// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ILiquidityVault
/// @notice Admin-funded isolated capital pool with a mandate + deterministic integer-bps pricing.
///         Only MaturaRouter (ROUTER_ROLE) may fund; only SettlementManager (SETTLEMENT_ROLE) may
///         return principal. The vault is intentionally decoupled from ClaimRegistry — the router
///         supplies claim pricing inputs (claimType, dueDate) it read from the authoritative registry.
interface ILiquidityVault {
    struct Mandate {
        uint8 supportedTypesBitmap; // bit i = ClaimTypes ordinal i
        uint256 minFace;
        uint256 maxFace;
        uint256 maxDurationDays;
        uint256 liquidityCap;
        uint16 baseDiscountBps;
        uint16 durationBpsPerDay;
        uint16[3] claimTypePremiumBps; // indexed by ClaimTypes ordinal
    }

    event VaultFunded(bytes32 indexed claimId, address indexed to, uint256 faceAmount, uint256 advanceAmount);
    event SettlementReturned(bytes32 indexed claimId, uint256 faceAmount, uint256 principalCleared);
    event MandateUpdated(Mandate mandate);
    event IssuerAllowed(address indexed issuer, bool allowed);
    event LiquidityWithdrawn(address indexed to, uint256 amount);

    error MandateRejected();
    error InsufficientLiquidity();
    error LiquidityCapExceeded();
    error ClaimTypeUnsupported();
    error ReturnMismatch();
    error ZeroAddress();
    error InvalidMandate();

    function token() external view returns (address);

    /// @notice Public UI quote (view). Reverts on invalid inputs via MaturaPricing.
    function previewQuote(uint8 claimType, uint256 faceAmount, uint256 dueDate)
        external
        view
        returns (uint256 advanceAmount, uint256 discountAmount);

    /// @notice Router hot-path: one STATICCALL doing mandate check + quote together.
    ///         `ok` is false when the mandate rejects; advance/discount are the recomputed quote.
    function quoteAndCheck(address issuer, uint8 claimType, uint256 faceAmount, uint256 dueDate)
        external
        view
        returns (bool ok, uint256 advanceAmount, uint256 discountAmount);

    function availableLiquidity() external view returns (uint256);
    /// @notice The amount actually fundable right now: min(token balance, liquidityCap headroom).
    ///         The router pre-checks against this so a route can't pass validation then revert in fund.
    function fundableLiquidity() external view returns (uint256);
    function outstandingPrincipal() external view returns (uint256);
    function liquidityCap() external view returns (uint256);
    function getMandate() external view returns (Mandate memory);

    /// @notice Advance funds for a slice to `to`; recomputes the quote internally (ROUTER_ROLE).
    function fund(bytes32 claimId, address to, uint8 claimType, uint256 faceAmount, uint256 dueDate)
        external
        returns (uint256 advanceAmount);

    /// @notice Called exactly once per (claim, vault) with the vault's TOTAL financed face for the
    ///         claim; clears exposure. Reverts ReturnMismatch on a wrong amount (SETTLEMENT_ROLE).
    function onSettlementReturn(bytes32 claimId, uint256 faceAmount) external;

    function setMandate(Mandate calldata m) external; // DEFAULT_ADMIN_ROLE
    function setIssuerAllowed(address issuer, bool allowed) external; // DEFAULT_ADMIN_ROLE
    function withdraw(address to, uint256 amount) external; // DEFAULT_ADMIN_ROLE, <= availableLiquidity
}
