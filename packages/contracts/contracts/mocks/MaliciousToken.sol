// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MaliciousToken
/// @notice TEST-ONLY reentrant ERC-20. On every balance change it optionally re-enters a preset
///         target with preset calldata and records whether that reentrant call reverted, so tests
///         can prove a `nonReentrant` guard actively blocked the reentry (rather than the reentry
///         merely being uneconomical). Behaves as a standard 6-decimal ERC-20 when disarmed.
/// @dev !!! TEST-ONLY — NOT FOR PRODUCTION !!! Never deployed by the protocol, never registered as a
///      settlement token in a manifest, and deliberately EXCLUDED from the ABI export set
///      (`scripts/export-abis.ts`). It exists only to exercise the reentrancy guards on the
///      value-moving entrypoints (`LiquidityVault.fund`, `SettlementManager.settleClaim`).
contract MaliciousToken is ERC20 {
    /// @notice Contract re-entered from the token hook while armed.
    address public reentryTarget;
    /// @notice ABI-encoded call executed against {reentryTarget} while armed.
    bytes public reentryData;
    /// @notice When true, the next balance change fires exactly one reentrant call (one-shot).
    bool public armed;
    /// @notice Set once a reentrant call has been attempted (for test assertions).
    bool public reentryAttempted;
    /// @notice True when the attempted reentrant call reverted (i.e. a guard blocked it).
    bool public reentryReverted;

    constructor() ERC20("Malicious", "EVIL") {}

    /// @notice Matches MockUSDT's 6-decimal precision so it is a drop-in settlement token in tests.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Permissionless mint (test helper) so fixtures can seed balances.
    /// @param to The recipient of the freshly minted tokens.
    /// @param amount The number of 6-decimal tokens to mint.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arms a single reentrant call to fire on the next balance change.
    /// @param target The contract to re-enter.
    /// @param data The ABI-encoded calldata to invoke on `target`.
    function arm(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
        armed = true;
        reentryAttempted = false;
        reentryReverted = false;
    }

    /// @notice Disarms so subsequent transfers behave as a standard ERC-20.
    function disarm() external {
        armed = false;
    }

    /// @dev Fires at most one reentrant call per arming; disarms BEFORE the call so the reentry
    ///      itself cannot recurse infinitely. Records whether the reentrant call reverted.
    function _attemptReentry() private {
        if (!armed) return;
        armed = false; // one-shot
        reentryAttempted = true;
        (bool success,) = reentryTarget.call(reentryData);
        reentryReverted = !success;
    }

    /// @dev The reentrancy hook: fires after every mint/transfer/transferFrom balance update.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        _attemptReentry();
    }
}
