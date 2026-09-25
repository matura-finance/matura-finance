// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MaturaConstants
/// @notice Protocol-wide constants shared across contracts. Bounds keep every loop
///         explicitly finite (no unbounded iteration).
library MaturaConstants {
    /// @notice Max reserve calls tracked per claim (bounds ClaimRegistry slice fan-out).
    uint8 internal constant MAX_SLICES_PER_CLAIM = 8;
    /// @notice Max legs in a single ExecutionRoute (bounds the router loop).
    uint8 internal constant MAX_LEGS = 8;
    /// @notice Hard ceiling on the total discount a vault may charge (30%).
    uint16 internal constant MAX_DISCOUNT_BPS = 3000;
    /// @notice Hard ceiling on the protocol fee (5%).
    uint16 internal constant MAX_FEE_BPS = 500;
    /// @notice Basis-points denominator.
    uint16 internal constant BPS_DENOMINATOR = 10_000;
}
