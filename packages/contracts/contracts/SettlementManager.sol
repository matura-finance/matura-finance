// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ISettlementManager} from "./interfaces/ISettlementManager.sol";
import {IClaimRegistry} from "./interfaces/IClaimRegistry.sol";
import {ILiquidityVault} from "./interfaces/ILiquidityVault.sol";
import {MaturaConstants} from "./libraries/MaturaConstants.sol";
import {ClaimStates} from "./libraries/ClaimEnums.sol";

/// @title SettlementManager
/// @notice Records per-(claim,vault) funded allocations from the router and performs maturity-gated
///         settlement with exact conservation. Allocations are AGGREGATED per (claimId, vault) so a
///         claim funded by the same vault across multiple routes settles with a single transfer and a
///         single {ILiquidityVault-onSettlementReturn} call.
/// @dev Settlement uses the fee-as-surcharge model: the payer transfers `faceValue + protocolFee`,
///      the financed face is distributed to the funding vaults, the residual goes to the beneficiary,
///      and the fee goes to the treasury. This contract must hold `SETTLEMENT_ROLE` on the
///      ClaimRegistry (for {IClaimRegistry-releaseSlice}) and on every funding vault (for
///      {ILiquidityVault-onSettlementReturn}); those grants are performed at deployment/wiring time.
contract SettlementManager is ISettlementManager, AccessControl, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice Role held by the MaturaRouter; the only caller allowed to register allocations.
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    /// @notice Authoritative claim registry queried for claim state and financed-face accounting.
    IClaimRegistry private immutable _claimRegistry;
    /// @notice Settlement token pulled from the payer and distributed on settlement.
    IERC20 private immutable _token;

    /// @notice Aggregated allocations per claim (one entry per funding vault).
    mapping(bytes32 => Allocation[]) private _allocations;
    /// @notice One-based index into `_allocations[claimId]` for a given vault (0 means "no entry yet").
    mapping(bytes32 => mapping(address => uint256)) private _allocIndexPlusOne;
    /// @notice Tracks whether a claim has already been settled (guards against double settlement).
    mapping(bytes32 => bool) private _settled;

    /// @notice Recipient of the protocol fee surcharge.
    address private _treasury;
    /// @notice Protocol fee in basis points, applied as a surcharge on `faceValue`.
    uint16 private _feeBps;

    /// @notice Deploys the settlement manager and wires its immutable dependencies.
    /// @dev Grants `DEFAULT_ADMIN_ROLE` to `admin`, initialises the treasury to `admin`, and sets the
    ///      fee to zero. `ROUTER_ROLE` and the cross-contract `SETTLEMENT_ROLE` grants are made during
    ///      protocol wiring, not here.
    /// @param admin The address that receives `DEFAULT_ADMIN_ROLE` and the initial treasury.
    /// @param claimRegistry_ The authoritative {IClaimRegistry}.
    /// @param token_ The ERC-20 settlement token.
    constructor(address admin, address claimRegistry_, address token_) {
        if (admin == address(0) || claimRegistry_ == address(0) || token_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _claimRegistry = IClaimRegistry(claimRegistry_);
        _token = IERC20(token_);
        _treasury = admin;
        _feeBps = 0;
    }

    /// @notice Registers (or adds to) a funded allocation for `(claimId, vault)`.
    /// @dev Aggregates per `(claimId, vault)`: if the vault already has an allocation for the claim,
    ///      `faceAmount` is added to it; otherwise a new entry is pushed. The
    ///      {MaxSlicesExceeded} bound is only enforced when adding a NEW vault. ROUTER_ROLE only.
    /// @param claimId The claim being funded.
    /// @param executionId The router execution that produced this allocation (emitted for tracing).
    /// @param vault The funding vault to credit at settlement.
    /// @param faceAmount The face amount financed by `vault` in this call.
    function registerAllocation(bytes32 claimId, bytes32 executionId, address vault, uint256 faceAmount)
        external
        onlyRole(ROUTER_ROLE)
    {
        uint256 indexPlusOne = _allocIndexPlusOne[claimId][vault];
        if (indexPlusOne != 0) {
            _allocations[claimId][indexPlusOne - 1].faceAmount += faceAmount;
        } else {
            if (_allocations[claimId].length >= MaturaConstants.MAX_SLICES_PER_CLAIM) revert MaxSlicesExceeded();
            _allocations[claimId].push(Allocation({vault: vault, faceAmount: faceAmount}));
            _allocIndexPlusOne[claimId][vault] = _allocations[claimId].length;
        }

        emit AllocationRegistered(claimId, executionId, vault, faceAmount);
    }

    /// @notice Maturity-gated, exact-pull settlement with a permissionless payer.
    /// @dev Pulls `faceValue + protocolFee` from `msg.sender`, distributes the financed face to each
    ///      funding vault (calling {ILiquidityVault-onSettlementReturn}), pays the residual to the
    ///      beneficiary and the fee to the treasury, then marks the claim PAID via
    ///      {IClaimRegistry-releaseSlice}. Follows checks-effects-interactions and is `nonReentrant`.
    /// @param claimId The matured (or delayed) claim to settle.
    function settleClaim(bytes32 claimId) external nonReentrant {
        IClaimRegistry.Claim memory c = _claimRegistry.getClaim(claimId);

        if (_settled[claimId]) revert AlreadySettled();
        if (c.state != ClaimStates.MATURED && c.state != ClaimStates.DELAYED) revert NotMature();
        if (c.financedFaceValue == 0) revert NothingFinanced();

        // Snapshot the accounting BEFORE any mutation or external interaction.
        uint256 faceValue = c.faceValue;
        uint256 financed = c.financedFaceValue;

        uint256 protocolFee = Math.mulDiv(faceValue, _feeBps, MaturaConstants.BPS_DENOMINATOR, Math.Rounding.Ceil);
        uint256 amountReceived = faceValue + protocolFee;

        // Effects before interactions.
        _settled[claimId] = true;

        // Pull the full settlement amount from the payer.
        _token.safeTransferFrom(msg.sender, address(this), amountReceived);

        // Distribute financed face to each funding vault and clear its exposure.
        Allocation[] storage allocs = _allocations[claimId];
        uint256 vaultDistribution = 0;
        uint256 len = allocs.length;
        for (uint256 i = 0; i < len; ++i) {
            Allocation memory a = allocs[i];
            vaultDistribution += a.faceAmount;
            _token.safeTransfer(a.vault, a.faceAmount);
            ILiquidityVault(a.vault).onSettlementReturn(claimId, a.faceAmount);
        }

        if (vaultDistribution != financed) revert ConservationViolation();

        // Residual to the beneficiary, fee to the treasury.
        uint256 userResidual = faceValue - financed;
        if (userResidual > 0) _token.safeTransfer(c.beneficiary, userResidual);
        if (protocolFee > 0) _token.safeTransfer(_treasury, protocolFee);

        // Mark the claim PAID (preserves financedFaceValue in the registry).
        _claimRegistry.releaseSlice(claimId);

        emit ClaimSettled(claimId, amountReceived, vaultDistribution, userResidual, protocolFee);
    }

    /// @notice Updates the protocol fee recipient.
    /// @dev Reverts {ZeroAddress} for the zero address. DEFAULT_ADMIN_ROLE only.
    /// @param newTreasury The new treasury address.
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        _treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Updates the protocol fee (in basis points).
    /// @dev Reverts {FeeTooHigh} when `newFeeBps` exceeds {MaturaConstants-MAX_FEE_BPS}. DEFAULT_ADMIN_ROLE only.
    /// @param newFeeBps The new fee in basis points.
    function setFeeBps(uint16 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeBps > MaturaConstants.MAX_FEE_BPS) revert FeeTooHigh();
        _feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    /// @notice Returns the aggregated allocations recorded for a claim.
    /// @param claimId The claim to query.
    /// @return The array of `(vault, faceAmount)` allocations, one per funding vault.
    function getAllocations(bytes32 claimId) external view returns (Allocation[] memory) {
        return _allocations[claimId];
    }

    /// @notice Returns the current protocol fee recipient.
    /// @return The treasury address.
    function treasury() external view returns (address) {
        return _treasury;
    }

    /// @notice Returns the current protocol fee in basis points.
    /// @return The fee in basis points.
    function feeBps() external view returns (uint16) {
        return _feeBps;
    }

    /// @notice Returns whether a claim has already been settled.
    /// @param claimId The claim to query.
    /// @return True if the claim has been settled.
    function isSettled(bytes32 claimId) external view returns (bool) {
        return _settled[claimId];
    }

    /// @notice Returns the address of the authoritative claim registry.
    /// @return The claim registry address.
    function claimRegistry() external view returns (address) {
        return address(_claimRegistry);
    }

    /// @notice Returns the address of the settlement token.
    /// @return The settlement token address.
    function token() external view returns (address) {
        return address(_token);
    }
}
