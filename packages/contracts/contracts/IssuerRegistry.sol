// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIssuerRegistry} from "./interfaces/IIssuerRegistry.sol";

/// @title IssuerRegistry
/// @notice Admin-managed allowlist of claim issuers and their authorized EIP-712 signers.
/// @dev A signer address may back only ONE issuer at a time. OpenZeppelin `Nonces` (used by
///      ClaimRegistry to consume attestation nonces) is keyed by the signer address, so allowing
///      a shared signer would let one issuer consume another issuer's attestation nonce. The
///      `signerToIssuer` reverse mapping enforces this one-signer-one-issuer invariant on both
///      registration and rotation.
contract IssuerRegistry is IIssuerRegistry, AccessControl {
    /// @notice Role authorized to register issuers, toggle their active status, and rotate signers.
    bytes32 public constant ISSUER_ADMIN_ROLE = keccak256("ISSUER_ADMIN_ROLE");

    /// @notice Issuer record keyed by issuer address.
    mapping(address issuer => Issuer record) private issuers;

    /// @notice Registration flag keyed by issuer address; distinguishes a registered issuer from a
    ///         default-zeroed record.
    mapping(address issuer => bool isRegistered) private registered;

    /// @notice Reverse mapping enforcing one-signer-one-issuer: signer => the issuer it backs.
    ///         Cleared on signer rotation so a freed signer may be reused elsewhere.
    mapping(address signer => address issuer) private signerToIssuer;

    /// @notice Deploy the registry and grant admin roles to `admin`.
    /// @param admin Address granted both DEFAULT_ADMIN_ROLE and ISSUER_ADMIN_ROLE.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ADMIN_ROLE, admin);
    }

    /// @notice Register a new issuer with its initial authorized signer.
    /// @dev Reverts ZeroAddress if `issuer` or `signer` is zero, IssuerAlreadyRegistered if the
    ///      issuer already exists, or SignerAlreadyBound if `signer` already backs another issuer.
    /// @param issuer The issuer address being onboarded.
    /// @param signer The EIP-712 signer authorized to attest on behalf of the issuer.
    /// @param metadataHash Off-chain metadata commitment (e.g. IPFS content hash).
    function registerIssuer(address issuer, address signer, bytes32 metadataHash)
        external
        onlyRole(ISSUER_ADMIN_ROLE)
    {
        if (issuer == address(0) || signer == address(0)) revert ZeroAddress();
        if (registered[issuer]) revert IssuerAlreadyRegistered(issuer);
        if (signerToIssuer[signer] != address(0)) revert SignerAlreadyBound(signer);

        issuers[issuer] = Issuer({
            issuerAddress: issuer,
            signer: signer,
            metadataHash: metadataHash,
            active: true,
            signerEpoch: 0
        });
        registered[issuer] = true;
        signerToIssuer[signer] = issuer;

        emit IssuerRegistered(issuer, signer, metadataHash);
    }

    /// @notice Activate or deactivate a registered issuer.
    /// @dev Reverts IssuerNotRegistered if the issuer does not exist.
    /// @param issuer The issuer whose status is being changed.
    /// @param active New active status.
    function setIssuerActive(address issuer, bool active) external onlyRole(ISSUER_ADMIN_ROLE) {
        if (!registered[issuer]) revert IssuerNotRegistered(issuer);

        issuers[issuer].active = active;

        emit IssuerStatusChanged(issuer, active);
    }

    /// @notice Rotate an issuer's authorized signer.
    /// @dev Bumps `signerEpoch`, instantly invalidating all in-flight attestations signed by the old
    ///      key (see `isAuthorizedSigner`). Reverts IssuerNotRegistered if the issuer does not exist,
    ///      ZeroAddress if `newSigner` is zero, or SignerAlreadyBound if `newSigner` already backs a
    ///      different issuer. Re-binding an issuer's current signer to itself is disallowed because
    ///      the reverse mapping still points at this issuer (guarded by SignerAlreadyBound).
    /// @param issuer The issuer whose signer is being rotated.
    /// @param newSigner The new EIP-712 signer address.
    function rotateSigner(address issuer, address newSigner) external onlyRole(ISSUER_ADMIN_ROLE) {
        if (!registered[issuer]) revert IssuerNotRegistered(issuer);
        if (newSigner == address(0)) revert ZeroAddress();
        if (signerToIssuer[newSigner] != address(0)) revert SignerAlreadyBound(newSigner);

        Issuer storage record = issuers[issuer];
        address oldSigner = record.signer;

        delete signerToIssuer[oldSigner];
        signerToIssuer[newSigner] = issuer;

        uint64 newEpoch = record.signerEpoch + 1;
        record.signerEpoch = newEpoch;
        record.signer = newSigner;

        emit IssuerSignerRotated(issuer, oldSigner, newSigner, newEpoch);
    }

    /// @notice Return the full issuer record.
    /// @param issuer The issuer to look up.
    /// @return The Issuer struct (zeroed if unregistered).
    function getIssuer(address issuer) external view returns (Issuer memory) {
        return issuers[issuer];
    }

    /// @notice Whether an issuer is registered and currently active.
    /// @param issuer The issuer to query.
    /// @return True if registered and active.
    function isActive(address issuer) external view returns (bool) {
        return registered[issuer] && issuers[issuer].active;
    }

    /// @notice Validate a signer + epoch pair against an issuer's current authorization.
    /// @dev True ONLY when the issuer is registered and active, `signer` is the issuer's CURRENT
    ///      signer, and `signerEpoch` equals the issuer's current epoch. Historical epochs are never
    ///      valid, which is what makes signer rotation an instant kill-switch.
    /// @param issuer The issuer to validate against.
    /// @param signer The signer address to check.
    /// @param signerEpoch The epoch the caller believes is current.
    /// @return True if the signer + epoch pair is currently authorized.
    function isAuthorizedSigner(address issuer, address signer, uint256 signerEpoch)
        external
        view
        returns (bool)
    {
        if (!registered[issuer]) return false;
        Issuer storage record = issuers[issuer];
        return record.active && record.signer == signer && record.signerEpoch == signerEpoch;
    }

    /// @notice Return an issuer's current signer epoch.
    /// @param issuer The issuer to query.
    /// @return The current epoch (0 for an unregistered issuer).
    function currentEpoch(address issuer) external view returns (uint256) {
        return issuers[issuer].signerEpoch;
    }
}
