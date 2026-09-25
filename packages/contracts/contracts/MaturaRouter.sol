// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IMaturaRouter} from "./interfaces/IMaturaRouter.sol";
import {IClaimRegistry} from "./interfaces/IClaimRegistry.sol";
import {ILiquidityVault} from "./interfaces/ILiquidityVault.sol";
import {IVaultRegistry} from "./interfaces/IVaultRegistry.sol";
import {IIssuerRegistry} from "./interfaces/IIssuerRegistry.sol";
import {ISettlementManager} from "./interfaces/ISettlementManager.sol";
import {MaturaConstants} from "./libraries/MaturaConstants.sol";

/// @title MaturaRouter
/// @notice Verifies a user-signed EIP-712 ExecutionRoute, recomputes every vault quote on-chain,
///         reserves claim slices and funds the user atomically. Validates a backend-proposed route;
///         it never searches for the cheapest combination on-chain.
/// @dev Uses ReentrancyGuardTransient (EIP-1153) — requires a Cancun-capable chain (BSC qualifies).
contract MaturaRouter is IMaturaRouter, AccessControl, EIP712, Nonces, ReentrancyGuardTransient, Pausable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bytes32 private constant ROUTE_LEG_TYPEHASH =
        keccak256("RouteLeg(bytes32 claimId,address vault,uint256 faceAmount,uint256 minimumAdvanceAmount)");
    bytes32 private constant EXECUTION_ROUTE_TYPEHASH = keccak256(
        "ExecutionRoute(address user,uint256 targetAdvance,uint256 maxTotalFace,uint256 deadline,uint256 nonce,RouteLeg[] legs)RouteLeg(bytes32 claimId,address vault,uint256 faceAmount,uint256 minimumAdvanceAmount)"
    );

    IClaimRegistry public immutable claimRegistry;
    IVaultRegistry public immutable vaultRegistry;
    IIssuerRegistry public immutable issuerRegistry;
    ISettlementManager public immutable settlementManager;
    address public immutable settlementToken;

    /// @dev Transient per-leg computed values, threaded through the passes without stack pressure.
    struct LegComputation {
        uint256 advance;
        uint256 discount;
        uint8 claimType;
        uint256 dueDate;
    }

    constructor(
        address admin,
        address claimRegistry_,
        address vaultRegistry_,
        address issuerRegistry_,
        address settlementManager_,
        address token_
    ) EIP712("MaturaRouter", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        claimRegistry = IClaimRegistry(claimRegistry_);
        vaultRegistry = IVaultRegistry(vaultRegistry_);
        issuerRegistry = IIssuerRegistry(issuerRegistry_);
        settlementManager = ISettlementManager(settlementManager_);
        settlementToken = token_;
    }

    /// @inheritdoc IMaturaRouter
    function executeRoute(ExecutionRoute calldata route, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
    {
        if (block.timestamp > route.deadline) revert RouteExpired();
        uint256 n = route.legs.length;
        if (n == 0) revert EmptyRoute();
        if (n > MaturaConstants.MAX_LEGS) revert MaxLegsExceeded();
        if (route.targetAdvance == 0) revert ZeroTargetAdvance();

        bytes32 executionId = _verifyRoute(route, signature);
        _useCheckedNonce(route.user, route.nonce);
        _requireNoDuplicateClaims(route);

        LegComputation[] memory comps = new LegComputation[](n);
        (uint256 totalAdvance, uint256 totalFace, uint256 totalCost) = _validateLegs(route, comps);

        if (totalFace > route.maxTotalFace) revert MaxFaceExceeded();
        if (totalAdvance < route.targetAdvance) revert TargetAdvanceNotMet();

        // Effects: reserve slices + register allocations.
        for (uint256 i = 0; i < n; ++i) {
            RouteLeg calldata leg = route.legs[i];
            claimRegistry.reserveSlice(leg.claimId, leg.faceAmount);
            settlementManager.registerAllocation(leg.claimId, executionId, leg.vault, leg.faceAmount);
        }

        // Interactions: fund the user + per-leg events.
        for (uint256 i = 0; i < n; ++i) {
            RouteLeg calldata leg = route.legs[i];
            LegComputation memory comp = comps[i];
            ILiquidityVault(leg.vault).fund(leg.claimId, route.user, comp.claimType, leg.faceAmount, comp.dueDate);
            emit RouteLegExecuted(executionId, leg.claimId, leg.vault, leg.faceAmount, comp.advance, comp.discount);
        }

        emit RouteExecuted(executionId, route.user, totalAdvance, totalFace, totalCost);
    }

    /// @dev Validate every leg and fill `comps`; returns route totals. Accumulates per-vault reserved
    ///      liquidity so two legs on one vault cannot both pass against a stale balance.
    function _validateLegs(ExecutionRoute calldata route, LegComputation[] memory comps)
        private
        view
        returns (uint256 totalAdvance, uint256 totalFace, uint256 totalCost)
    {
        uint256 n = route.legs.length;
        address[] memory seenVaults = new address[](n);
        uint256[] memory reserved = new uint256[](n);
        uint256 seenCount;

        for (uint256 i = 0; i < n; ++i) {
            RouteLeg calldata leg = route.legs[i];
            IClaimRegistry.Claim memory c = claimRegistry.getClaim(leg.claimId);

            if (c.beneficiary != route.user) revert BeneficiaryMismatch();
            if (c.token != ILiquidityVault(leg.vault).token()) revert TokenMismatch();
            if (!claimRegistry.isFinanceable(leg.claimId)) revert ClaimNotFinanceable();
            if (!issuerRegistry.isActive(c.issuer)) revert IssuerInactive();
            if (!vaultRegistry.isActive(leg.vault)) revert VaultNotActive();

            (bool ok, uint256 advance, uint256 discount) =
                ILiquidityVault(leg.vault).quoteAndCheck(c.issuer, c.claimType, leg.faceAmount, c.dueDate);
            if (!ok) revert MandateRejected();
            if (advance < leg.minimumAdvanceAmount) revert AdvanceBelowMinimum();

            comps[i] = LegComputation({advance: advance, discount: discount, claimType: c.claimType, dueDate: c.dueDate});
            totalAdvance += advance;
            totalFace += leg.faceAmount;
            totalCost += discount;

            uint256 vi = type(uint256).max;
            for (uint256 k = 0; k < seenCount; ++k) {
                if (seenVaults[k] == leg.vault) {
                    vi = k;
                    break;
                }
            }
            if (vi == type(uint256).max) {
                vi = seenCount;
                seenVaults[seenCount] = leg.vault;
                ++seenCount;
            }
            reserved[vi] += advance;
            if (reserved[vi] > ILiquidityVault(leg.vault).availableLiquidity()) revert InsufficientLiquidity();
        }
    }

    function _requireNoDuplicateClaims(ExecutionRoute calldata route) private pure {
        uint256 n = route.legs.length;
        for (uint256 i = 0; i < n; ++i) {
            bytes32 claimId = route.legs[i].claimId;
            for (uint256 j = i + 1; j < n; ++j) {
                if (route.legs[j].claimId == claimId) revert DuplicateClaimInRoute();
            }
        }
    }

    /// @dev Recompute the EIP-712 digest (also the executionId) and verify it recovers to route.user.
    function _verifyRoute(ExecutionRoute calldata route, bytes calldata signature)
        private
        view
        returns (bytes32 digest)
    {
        uint256 n = route.legs.length;
        bytes32[] memory legHashes = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            RouteLeg calldata leg = route.legs[i];
            legHashes[i] =
                keccak256(abi.encode(ROUTE_LEG_TYPEHASH, leg.claimId, leg.vault, leg.faceAmount, leg.minimumAdvanceAmount));
        }
        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTION_ROUTE_TYPEHASH,
                route.user,
                route.targetAdvance,
                route.maxTotalFace,
                route.deadline,
                route.nonce,
                keccak256(abi.encodePacked(legHashes))
            )
        );
        digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, signature) != route.user) revert InvalidRouteSignature();
    }

    /// @notice Pause route execution (PAUSER_ROLE). Settlement is intentionally not pausable.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause route execution (PAUSER_ROLE).
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
