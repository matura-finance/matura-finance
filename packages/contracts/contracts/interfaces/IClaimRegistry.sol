// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IClaimRegistry
/// @notice Verifies issuer EIP-712 attestations, owns the canonical claim state machine and the
///         aggregate financed-face accounting, and exposes role-gated slice reserve/release.
interface IClaimRegistry {
    /// @dev EIP-712 `ClaimAttestation` payload. `claimType`/`signerEpoch`/`nonce`/`deadline`
    ///      are uint8/uint256 to match the typed-data encoding used off-chain.
    struct ClaimAttestation {
        bytes32 claimId;
        address issuer;
        address beneficiary;
        address token;
        uint256 faceValue;
        uint256 dueDate;
        uint8 claimType;
        bytes32 externalIdHash;
        bytes32 evidenceHash;
        uint256 signerEpoch;
        uint256 nonce;
        uint256 deadline;
    }

    /// @dev Canonical stored claim. `financedFaceValue` is preserved after settlement (never zeroed);
    ///      `state` uses the frozen ClaimStates ordinals.
    /// @dev Field order packs the small fields into the `beneficiary` slot (address 20 + 3×uint8 +
    ///      uint64 = 31 bytes), so a claim occupies 5 storage slots instead of 7. `dueDate` is a
    ///      unix-seconds uint64 (safe past year 2554); money stays uint256.
    struct Claim {
        address beneficiary;
        uint8 claimType;
        uint8 state;
        uint8 sliceCount;
        uint64 dueDate;
        address issuer;
        address token;
        uint256 faceValue;
        uint256 financedFaceValue;
    }

    event ClaimRegistered(
        bytes32 indexed claimId,
        address indexed issuer,
        address indexed beneficiary,
        uint8 claimType,
        address token,
        uint256 faceValue,
        uint256 dueDate,
        bytes32 externalIdHash,
        bytes32 evidenceHash
    );
    event ClaimStateChanged(bytes32 indexed claimId, uint8 previousState, uint8 newState);
    event ClaimSliceReserved(bytes32 indexed claimId, uint256 faceAmount, uint256 financedFaceValue);
    event ClaimSliceReleased(bytes32 indexed claimId, uint256 financedFaceValue);

    error InvalidSignature();
    error IssuerInactive();
    error SignatureExpired();
    error DuplicateClaimId();
    error DuplicateExternalId();
    error ZeroFaceValue();
    error DueDateInPast();
    error InvalidClaimType();
    error InvalidClaimState();
    error OverAssignment();
    error MaxSlicesExceeded();
    error ClaimAlreadyFunded();
    error NotAuthorized();
    error TokenNotSettlement();
    error ClaimNotFound();
    error NotMatured();
    error ZeroAddress();
    error NonceAlreadyUsed();

    /// @notice Verify an issuer attestation and register the claim as ATTESTED (permissionless submit).
    function registerClaim(ClaimAttestation calldata att, bytes calldata signature) external;

    /// @notice ATTESTED -> ELIGIBLE (CLAIM_REVIEWER_ROLE).
    function markEligible(bytes32 claimId) external;

    /// @notice ATTESTED -> REJECTED (CLAIM_REVIEWER_ROLE), terminal.
    function reject(bytes32 claimId) external;

    /// @notice ATTESTED/ELIGIBLE -> REVOKED (issuer or CLAIM_REVIEWER_ROLE), only if financedFaceValue == 0.
    function revoke(bytes32 claimId) external;

    /// @notice PARTIALLY_FUNDED/FUNDED -> MATURED (permissionless, requires block.timestamp >= dueDate).
    function markMatured(bytes32 claimId) external;

    /// @notice MATURED -> DELAYED (permissionless, past due, unpaid).
    function markDelayed(bytes32 claimId) external;

    /// @notice Reserve a financing slice; increments financedFaceValue and derives the funded state.
    ///         (ROUTER_ROLE) Reverts OverAssignment / MaxSlicesExceeded.
    function reserveSlice(bytes32 claimId, uint256 faceAmount) external;

    /// @notice MATURED/DELAYED -> PAID; preserves financedFaceValue (SETTLEMENT_ROLE).
    function releaseSlice(bytes32 claimId) external;

    function getClaim(bytes32 claimId) external view returns (Claim memory);

    /// @notice True when the claim is ELIGIBLE or PARTIALLY_FUNDED (financeable).
    function isFinanceable(bytes32 claimId) external view returns (bool);

    /// @notice True when `nonce` has already been consumed by `signer` (attestation nonces are
    ///         unordered — the backend should pick any unused value).
    function isNonceUsed(address signer, uint256 nonce) external view returns (bool);
}
