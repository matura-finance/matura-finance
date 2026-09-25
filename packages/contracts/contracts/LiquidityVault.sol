// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILiquidityVault} from "./interfaces/ILiquidityVault.sol";
import {ClaimTypes} from "./libraries/ClaimEnums.sol";
import {MaturaConstants} from "./libraries/MaturaConstants.sol";
import {MaturaPricing} from "./libraries/MaturaPricing.sol";

/// @title LiquidityVault
/// @notice Admin-funded isolated capital pool with a mandate and deterministic integer-bps pricing.
///         Only MaturaRouter (ROUTER_ROLE) may fund slices; only SettlementManager (SETTLEMENT_ROLE)
///         may clear principal on settlement. Pricing always routes through {MaturaPricing} so the
///         public preview, the router hot-path check, and on-chain execution can never diverge.
/// @dev Decoupled from ClaimRegistry: the router supplies pricing inputs (claimType, dueDate) it read
///      from the authoritative registry. All token moves use {SafeERC20}; value-moving entrypoints are
///      guarded by {ReentrancyGuardTransient} and {Pausable} and follow strict checks-effects-interactions.
contract LiquidityVault is ILiquidityVault, AccessControl, ReentrancyGuardTransient, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Role held by the MaturaRouter; the only caller allowed to {fund} slices.
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");
    /// @notice Role held by the SettlementManager; the only caller allowed to clear principal.
    bytes32 public constant SETTLEMENT_ROLE = keccak256("SETTLEMENT_ROLE");
    /// @notice Role allowed to {pause}/{unpause} funding.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice The settlement token this vault advances and receives (immutable for the vault's life).
    IERC20 private immutable _token;

    /// @notice The active mandate: supported types, face bounds, duration cap, liquidity cap, and pricing.
    Mandate private _mandate;
    /// @notice Issuer allow-list; only allowed issuers pass {quoteAndCheck}.
    mapping(address => bool) private _issuerAllowed;
    /// @notice Advanced principal outstanding per claim id.
    mapping(bytes32 => uint256) public principalByClaim;
    /// @notice Total financed face value per claim id (used to validate the settlement return).
    mapping(bytes32 => uint256) public faceByClaim;
    /// @notice Sum of all outstanding advanced principal across claims.
    uint256 private _outstandingPrincipal;

    /// @notice Deploys the vault, wires admin roles, and stores the settlement token and mandate.
    /// @dev Grants `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE` to `admin`. The token is immutable.
    /// @param admin The address that receives `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE`.
    /// @param token_ The ERC20 settlement token used for advances and returns.
    /// @param mandate_ The initial mandate configuration.
    constructor(address admin, address token_, Mandate memory mandate_) {
        if (admin == address(0) || token_ == address(0)) revert ZeroAddress();
        _validateMandate(mandate_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _token = IERC20(token_);
        _mandate = mandate_;
        emit MandateUpdated(mandate_);
    }

    /// @dev Rejects an obviously-broken mandate that would silently disable funding.
    function _validateMandate(Mandate memory m) private pure {
        if (m.minFace > m.maxFace || m.maxFace == 0 || m.liquidityCap == 0) revert InvalidMandate();
        // A zero-duration, zero-premium quote must be priceable (base within the cap).
        if (m.baseDiscountBps > MaturaConstants.MAX_DISCOUNT_BPS) revert InvalidMandate();
        for (uint256 t = 0; t < ClaimTypes.COUNT; ++t) {
            if (uint256(m.baseDiscountBps) + uint256(m.claimTypePremiumBps[t]) > MaturaConstants.MAX_DISCOUNT_BPS) {
                revert InvalidMandate();
            }
        }
    }

    /// @notice Returns the settlement token address.
    /// @return The ERC20 token used for advances and returns.
    function token() external view returns (address) {
        return address(_token);
    }

    /// @notice Public UI quote (view). Reverts on invalid inputs via {MaturaPricing}.
    /// @dev Reverts {ClaimTypeUnsupported} for an invalid claim-type ordinal; bubbles up
    ///      {MaturaPricing.DueDateInPast} / {MaturaPricing.DiscountCapExceeded} otherwise.
    /// @param claimType The claim-type ordinal being priced.
    /// @param faceAmount The face value of the slice (base units).
    /// @param dueDate The claim maturity (unix seconds), strictly in the future.
    /// @return advanceAmount The amount that would be advanced (face - discount).
    /// @return discountAmount The discount retained (rounded up).
    function previewQuote(uint8 claimType, uint256 faceAmount, uint256 dueDate)
        external
        view
        returns (uint256 advanceAmount, uint256 discountAmount)
    {
        if (!ClaimTypes.isValid(claimType)) revert ClaimTypeUnsupported();
        uint16 premium = _mandate.claimTypePremiumBps[claimType];
        (advanceAmount, discountAmount) =
            MaturaPricing.quote(_mandate.baseDiscountBps, _mandate.durationBpsPerDay, premium, faceAmount, dueDate);
    }

    /// @notice Router hot-path: a single STATICCALL doing mandate checks and pricing together.
    /// @dev Never reverts. Returns `ok = false` (and zero amounts) when the claim type is invalid or
    ///      unsupported, the issuer is not allowed, the face is out of range, the claim is past due,
    ///      the duration exceeds the mandate cap, or pricing would exceed the discount cap.
    /// @param issuer The issuer that attested the claim.
    /// @param claimType The claim-type ordinal being priced.
    /// @param faceAmount The face value of the slice (base units).
    /// @param dueDate The claim maturity (unix seconds).
    /// @return ok True when the mandate accepts the slice and pricing succeeds.
    /// @return advanceAmount The recomputed advance (0 when `ok` is false).
    /// @return discountAmount The recomputed discount (0 when `ok` is false).
    function quoteAndCheck(address issuer, uint8 claimType, uint256 faceAmount, uint256 dueDate)
        external
        view
        returns (bool ok, uint256 advanceAmount, uint256 discountAmount)
    {
        if (!ClaimTypes.isValid(claimType)) return (false, 0, 0);
        if (!ClaimTypes.supportsType(_mandate.supportedTypesBitmap, claimType)) return (false, 0, 0);
        if (!_issuerAllowed[issuer]) return (false, 0, 0);
        if (faceAmount < _mandate.minFace || faceAmount > _mandate.maxFace) return (false, 0, 0);
        if (dueDate <= block.timestamp) return (false, 0, 0);
        if ((dueDate - block.timestamp) / 1 days > _mandate.maxDurationDays) return (false, 0, 0);

        uint16 premium = _mandate.claimTypePremiumBps[claimType];
        (ok, advanceAmount, discountAmount) =
            MaturaPricing.tryQuote(_mandate.baseDiscountBps, _mandate.durationBpsPerDay, premium, faceAmount, dueDate);
        if (!ok) return (false, 0, 0);
    }

    /// @notice Advance funds for a slice to `to`, recomputing the quote internally.
    /// @dev ROUTER_ROLE only. Follows checks-effects-interactions: prices via {MaturaPricing.quote}
    ///      (which reverts on invalid pricing), validates liquidity and the mandate cap, updates
    ///      exposure counters, then transfers. Reverts {InsufficientLiquidity} when the balance is too
    ///      low and {LiquidityCapExceeded} when the mandate cap would be breached.
    /// @param claimId The claim identifier the slice belongs to.
    /// @param to The recipient of the advanced funds.
    /// @param claimType The claim-type ordinal being priced.
    /// @param faceAmount The face value of the slice (base units).
    /// @param dueDate The claim maturity (unix seconds).
    /// @return advanceAmount The amount advanced to `to`.
    function fund(bytes32 claimId, address to, uint8 claimType, uint256 faceAmount, uint256 dueDate)
        external
        onlyRole(ROUTER_ROLE)
        nonReentrant
        whenNotPaused
        returns (uint256 advanceAmount)
    {
        uint16 premium = _mandate.claimTypePremiumBps[claimType];
        (advanceAmount,) =
            MaturaPricing.quote(_mandate.baseDiscountBps, _mandate.durationBpsPerDay, premium, faceAmount, dueDate);

        if (advanceAmount > availableLiquidity()) revert InsufficientLiquidity();
        if (_outstandingPrincipal + advanceAmount > _mandate.liquidityCap) revert LiquidityCapExceeded();

        // Effects.
        principalByClaim[claimId] += advanceAmount;
        faceByClaim[claimId] += faceAmount;
        _outstandingPrincipal += advanceAmount;

        // Interaction.
        _token.safeTransfer(to, advanceAmount);

        emit VaultFunded(claimId, to, faceAmount, advanceAmount);
    }

    /// @notice Clears the vault's exposure for a claim after settlement funds have been received.
    /// @dev SETTLEMENT_ROLE only. Funds are transferred IN by the SettlementManager BEFORE this call;
    ///      this only updates counters. Reverts {ReturnMismatch} unless `faceAmount` is non-zero and
    ///      equals the vault's stored financed face for the claim.
    /// @param claimId The claim identifier being settled.
    /// @param faceAmount The vault's TOTAL financed face for the claim.
    function onSettlementReturn(bytes32 claimId, uint256 faceAmount) external onlyRole(SETTLEMENT_ROLE) {
        if (faceAmount == 0 || faceByClaim[claimId] != faceAmount) revert ReturnMismatch();

        uint256 principal = principalByClaim[claimId];
        _outstandingPrincipal -= principal;
        delete principalByClaim[claimId];
        delete faceByClaim[claimId];

        emit SettlementReturned(claimId, faceAmount, principal);
    }

    /// @notice Returns the liquidity currently available to advance (the vault's token balance).
    /// @return The current token balance held by the vault.
    function availableLiquidity() public view returns (uint256) {
        return _token.balanceOf(address(this));
    }

    /// @inheritdoc ILiquidityVault
    function fundableLiquidity() external view returns (uint256) {
        uint256 balance = _token.balanceOf(address(this));
        uint256 cap = _mandate.liquidityCap;
        uint256 headroom = cap > _outstandingPrincipal ? cap - _outstandingPrincipal : 0;
        return balance < headroom ? balance : headroom;
    }

    /// @notice Returns the total advanced principal outstanding across all claims.
    /// @return The outstanding principal.
    function outstandingPrincipal() external view returns (uint256) {
        return _outstandingPrincipal;
    }

    /// @notice Returns the mandate's liquidity cap.
    /// @return The maximum outstanding principal permitted by the mandate.
    function liquidityCap() external view returns (uint256) {
        return _mandate.liquidityCap;
    }

    /// @notice Returns the full active mandate.
    /// @return The current {Mandate}.
    function getMandate() external view returns (Mandate memory) {
        return _mandate;
    }

    /// @notice Withdraws idle liquidity to `to`.
    /// @dev DEFAULT_ADMIN_ROLE only. Reverts {InsufficientLiquidity} when `amount` exceeds the balance.
    /// @param to The recipient of the withdrawn funds.
    /// @param amount The amount to withdraw.
    function withdraw(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount > availableLiquidity()) revert InsufficientLiquidity();
        _token.safeTransfer(to, amount);
        emit LiquidityWithdrawn(to, amount);
    }

    /// @notice Replaces the active mandate.
    /// @dev DEFAULT_ADMIN_ROLE only. Emits the key pricing/cap fields for off-chain indexing.
    /// @param m The new mandate configuration.
    function setMandate(Mandate calldata m) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _validateMandate(m);
        _mandate = m;
        emit MandateUpdated(m);
    }

    /// @notice Adds or removes an issuer from the allow-list.
    /// @dev DEFAULT_ADMIN_ROLE only.
    /// @param issuer The issuer address to toggle.
    /// @param allowed True to allow the issuer, false to disallow it.
    function setIssuerAllowed(address issuer, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _issuerAllowed[issuer] = allowed;
        emit IssuerAllowed(issuer, allowed);
    }

    /// @notice Pauses funding.
    /// @dev PAUSER_ROLE only.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resumes funding.
    /// @dev PAUSER_ROLE only.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
