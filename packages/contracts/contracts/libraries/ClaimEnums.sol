// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ClaimTypes
/// @notice Canonical claim-type ordinals. MUST match `packages/shared/src/enums.ts` `CLAIM_TYPES`.
/// @dev Adding a claim type is a coordinated edit across six sites — keep them in sync:
///      (1) this library (+ `COUNT`); (2) `ILiquidityVault.Mandate.claimTypePremiumBps` fixed-array
///      length; (3) `packages/shared/src/enums.ts`; (4) the Prisma enum; (5) the contracts parity
///      test (`test/EnumParity.test.ts` + `test/helpers/constants.ts`); (6) `apps/api` parity spec
///      and the Ignition demo mandate. `EnumParity` and the api spec guard drift.
library ClaimTypes {
    uint8 internal constant PAYROLL = 0;
    uint8 internal constant FREELANCE_ESCROW = 1;
    uint8 internal constant STREAM = 2;
    uint8 internal constant COUNT = 3;

    /// @notice True when `t` is a valid claim-type ordinal.
    function isValid(uint8 t) internal pure returns (bool) {
        return t < COUNT;
    }

    /// @notice True when `bitmap` has the bit for claim type `t` set (bit i = CLAIM_TYPES[i]).
    function supportsType(uint8 bitmap, uint8 t) internal pure returns (bool) {
        return (bitmap & (uint8(1) << t)) != 0;
    }
}

/// @title ClaimStates
/// @notice Canonical claim lifecycle-state ordinals. MUST match `packages/shared/src/enums.ts`
///         `CLAIM_STATES` exactly. DISPUTED and DEFAULTED are reserved in P0 (no on-chain producer).
library ClaimStates {
    uint8 internal constant ATTESTED = 0;
    uint8 internal constant ELIGIBLE = 1;
    uint8 internal constant PARTIALLY_FUNDED = 2;
    uint8 internal constant FUNDED = 3;
    uint8 internal constant MATURED = 4;
    uint8 internal constant PAID = 5;
    uint8 internal constant DELAYED = 6;
    uint8 internal constant DISPUTED = 7; // reserved in P0
    uint8 internal constant DEFAULTED = 8; // reserved in P0
    uint8 internal constant REJECTED = 9;
    uint8 internal constant REVOKED = 10;
}
