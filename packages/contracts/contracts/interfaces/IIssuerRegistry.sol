// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IIssuerRegistry
/// @notice Admin-managed allowlist of claim issuers and their authorized EIP-712 signers.
///         A signer may back only ONE issuer (OZ Nonces is keyed by signer address, so a
///         shared signer would let one issuer consume another's attestation nonce).
interface IIssuerRegistry {
    struct Issuer {
        address issuerAddress;
        address signer;
        bytes32 metadataHash;
        bool active;
        uint256 signerEpoch;
    }

    event IssuerRegistered(address indexed issuer, address indexed signer, bytes32 metadataHash);
    event IssuerStatusChanged(address indexed issuer, bool active);
    event IssuerSignerRotated(
        address indexed issuer, address indexed oldSigner, address indexed newSigner, uint256 newEpoch
    );

    error IssuerAlreadyRegistered(address issuer);
    error IssuerNotRegistered(address issuer);
    error SignerAlreadyBound(address signer);
    error ZeroAddress();

    /// @notice Register a new issuer with its initial authorized signer (ISSUER_ADMIN_ROLE).
    function registerIssuer(address issuer, address signer, bytes32 metadataHash) external;

    /// @notice Activate/deactivate an issuer (ISSUER_ADMIN_ROLE).
    function setIssuerActive(address issuer, bool active) external;

    /// @notice Rotate an issuer's authorized signer; bumps signerEpoch, instantly invalidating
    ///         all in-flight attestations signed by the old key (ISSUER_ADMIN_ROLE).
    function rotateSigner(address issuer, address newSigner) external;

    function getIssuer(address issuer) external view returns (Issuer memory);

    function isActive(address issuer) external view returns (bool);

    /// @notice True ONLY when `signer` is the issuer's CURRENT signer AND `signerEpoch` equals the
    ///         issuer's current epoch. Historical epochs are never valid.
    function isAuthorizedSigner(address issuer, address signer, uint256 signerEpoch) external view returns (bool);

    function currentEpoch(address issuer) external view returns (uint256);
}
