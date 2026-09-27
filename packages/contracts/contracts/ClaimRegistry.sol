// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IClaimRegistry} from "./interfaces/IClaimRegistry.sol";
import {IIssuerRegistry} from "./interfaces/IIssuerRegistry.sol";
import {ClaimTypes, ClaimStates} from "./libraries/ClaimEnums.sol";
import {MaturaConstants} from "./libraries/MaturaConstants.sol";

/// @title ClaimRegistry
/// @notice Verifies issuer EIP-712 attestations, owns the canonical claim state machine and the
///         aggregate financed-face accounting, and exposes role-gated slice reserve/release.
/// @dev Attestation nonces are keyed by the recovered signer (OZ Nonces). A signer backs only one
///      issuer (enforced in IssuerRegistry), so signer-keyed nonces cannot collide across issuers.
contract ClaimRegistry is IClaimRegistry, AccessControl, EIP712 {
    bytes32 public constant CLAIM_REVIEWER_ROLE = keccak256("CLAIM_REVIEWER_ROLE");
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");
    bytes32 public constant SETTLEMENT_ROLE = keccak256("SETTLEMENT_ROLE");
    /// @dev Holders (source adapters) may register claims from their own verified on-chain state via
    ///      `registerFromSource`, bypassing the EIP-712 signature. A second writer to the registry,
    ///      distinct from the ROUTER_ROLE single-writer boundary; each holder can mint only as itself.
    bytes32 public constant SOURCE_REGISTRAR_ROLE = keccak256("SOURCE_REGISTRAR_ROLE");

    bytes32 private constant CLAIM_ATTESTATION_TYPEHASH = keccak256(
        "ClaimAttestation(bytes32 claimId,address issuer,address beneficiary,address token,uint256 faceValue,uint256 dueDate,uint8 claimType,bytes32 externalIdHash,bytes32 evidenceHash,uint256 signerEpoch,uint256 nonce,uint256 deadline)"
    );

    IIssuerRegistry public immutable issuerRegistry;
    address public immutable settlementToken;

    mapping(bytes32 claimId => Claim) private _claims;
    mapping(bytes32 claimId => bool) private _exists;
    mapping(bytes32 externalIdHash => bool) private _usedExternalId;
    /// @dev Unordered attestation nonces keyed by signer: any unused nonce may be consumed, in any
    ///      order, so an unsubmitted low nonce cannot block higher ones (permissionless entrypoint).
    mapping(address signer => mapping(uint256 nonce => bool)) private _usedNonce;
    /// @dev claimId → externalIdHash, so reject/revoke can free the invoice for re-attestation.
    mapping(bytes32 claimId => bytes32 externalIdHash) private _claimExternalId;

    /// @param admin holder of DEFAULT_ADMIN_ROLE and CLAIM_REVIEWER_ROLE
    /// @param issuerRegistry_ authorization source for issuer signers
    /// @param settlementToken_ the single settlement token every claim must use
    constructor(address admin, address issuerRegistry_, address settlementToken_) EIP712("MaturaClaimRegistry", "1") {
        if (admin == address(0) || issuerRegistry_ == address(0) || settlementToken_ == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CLAIM_REVIEWER_ROLE, admin);
        issuerRegistry = IIssuerRegistry(issuerRegistry_);
        settlementToken = settlementToken_;
    }

    /// @inheritdoc IClaimRegistry
    function registerClaim(ClaimAttestation calldata att, bytes calldata signature) external {
        if (block.timestamp > att.deadline) revert SignatureExpired();
        if (_exists[att.claimId]) revert DuplicateClaimId();
        if (_usedExternalId[att.externalIdHash]) revert DuplicateExternalId();
        if (att.faceValue == 0) revert ZeroFaceValue();
        if (att.dueDate <= block.timestamp) revert DueDateInPast();
        if (!ClaimTypes.isValid(att.claimType)) revert InvalidClaimType();
        if (att.token != settlementToken) revert TokenNotSettlement();
        if (!issuerRegistry.isActive(att.issuer)) revert IssuerInactive();

        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_ATTESTATION_TYPEHASH,
                att.claimId,
                att.issuer,
                att.beneficiary,
                att.token,
                att.faceValue,
                att.dueDate,
                att.claimType,
                att.externalIdHash,
                att.evidenceHash,
                att.signerEpoch,
                att.nonce,
                att.deadline
            )
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (!issuerRegistry.isAuthorizedSigner(att.issuer, signer, att.signerEpoch)) revert InvalidSignature();

        if (_usedNonce[signer][att.nonce]) revert NonceAlreadyUsed();

        // Effects. The nonce write is signer-dependent so it stays here; the shared claim write +
        // event live in _writeClaim (identical to the source path).
        _usedNonce[signer][att.nonce] = true;
        _writeClaim(
            att.claimId,
            att.beneficiary,
            att.issuer,
            att.token,
            att.faceValue,
            att.dueDate,
            att.claimType,
            att.externalIdHash,
            att.evidenceHash
        );
    }

    /// @inheritdoc IClaimRegistry
    function registerFromSource(
        bytes32 claimId,
        address beneficiary,
        address token,
        uint256 faceValue,
        uint256 dueDate,
        uint8 claimType,
        bytes32 externalIdHash,
        bytes32 evidenceHash
    ) external onlyRole(SOURCE_REGISTRAR_ROLE) {
        // The issuer IS the caller — provenance is unspoofable by construction. Re-run every
        // registerClaim invariant except the signature/nonce path (skipped: SignatureExpired, ECDSA,
        // NonceAlreadyUsed). Same short-circuit order as registerClaim for the shared checks.
        address issuer = msg.sender;
        if (_exists[claimId]) revert DuplicateClaimId();
        if (_usedExternalId[externalIdHash]) revert DuplicateExternalId();
        if (faceValue == 0) revert ZeroFaceValue();
        if (dueDate <= block.timestamp) revert DueDateInPast();
        if (!ClaimTypes.isValid(claimType)) revert InvalidClaimType();
        if (token != settlementToken) revert TokenNotSettlement();
        if (!issuerRegistry.isActive(issuer)) revert IssuerInactive();

        _writeClaim(claimId, beneficiary, issuer, token, faceValue, dueDate, claimType, externalIdHash, evidenceHash);
    }

    /// @inheritdoc IClaimRegistry
    function markEligible(bytes32 claimId) external onlyRole(CLAIM_REVIEWER_ROLE) {
        Claim storage c = _load(claimId);
        if (c.state != ClaimStates.ATTESTED) revert InvalidClaimState();
        _setState(claimId, c, ClaimStates.ELIGIBLE);
    }

    /// @inheritdoc IClaimRegistry
    function reject(bytes32 claimId) external onlyRole(CLAIM_REVIEWER_ROLE) {
        Claim storage c = _load(claimId);
        if (c.state != ClaimStates.ATTESTED) revert InvalidClaimState();
        _freeExternalId(claimId);
        _setState(claimId, c, ClaimStates.REJECTED);
    }

    /// @inheritdoc IClaimRegistry
    function revoke(bytes32 claimId) external {
        Claim storage c = _load(claimId);
        if (msg.sender != c.issuer && !hasRole(CLAIM_REVIEWER_ROLE, msg.sender)) revert NotAuthorized();
        if (c.financedFaceValue != 0) revert ClaimAlreadyFunded();
        if (c.state != ClaimStates.ATTESTED && c.state != ClaimStates.ELIGIBLE) revert InvalidClaimState();
        _freeExternalId(claimId);
        _setState(claimId, c, ClaimStates.REVOKED);
    }

    /// @inheritdoc IClaimRegistry
    function markMatured(bytes32 claimId) external {
        Claim storage c = _load(claimId);
        if (c.state != ClaimStates.PARTIALLY_FUNDED && c.state != ClaimStates.FUNDED) revert InvalidClaimState();
        if (block.timestamp < c.dueDate) revert NotMatured();
        _setState(claimId, c, ClaimStates.MATURED);
    }

    /// @inheritdoc IClaimRegistry
    function markDelayed(bytes32 claimId) external {
        Claim storage c = _load(claimId);
        if (c.state != ClaimStates.MATURED) revert InvalidClaimState();
        _setState(claimId, c, ClaimStates.DELAYED);
    }

    /// @inheritdoc IClaimRegistry
    /// @dev ROUTER_ROLE is a single-holder trust boundary: financedFaceValue here and the
    ///      SettlementManager allocation ledger stay in sync only because the router updates both
    ///      per leg. Never grant ROUTER_ROLE to a second writer.
    function reserveSlice(bytes32 claimId, uint256 faceAmount) external onlyRole(ROUTER_ROLE) {
        Claim storage c = _load(claimId);
        if (c.state != ClaimStates.ELIGIBLE && c.state != ClaimStates.PARTIALLY_FUNDED) revert InvalidClaimState();
        if (faceAmount == 0) revert ZeroFaceValue();
        uint256 newFinanced = c.financedFaceValue + faceAmount;
        if (newFinanced > c.faceValue) revert OverAssignment();
        if (c.sliceCount >= MaturaConstants.MAX_SLICES_PER_CLAIM) revert MaxSlicesExceeded();

        c.financedFaceValue = newFinanced;
        c.sliceCount += 1;
        uint8 newState = newFinanced == c.faceValue ? ClaimStates.FUNDED : ClaimStates.PARTIALLY_FUNDED;
        if (c.state != newState) {
            uint8 prev = c.state;
            c.state = newState;
            emit ClaimStateChanged(claimId, prev, newState);
        }
        emit ClaimSliceReserved(claimId, faceAmount, newFinanced);
    }

    /// @inheritdoc IClaimRegistry
    function releaseSlice(bytes32 claimId) external onlyRole(SETTLEMENT_ROLE) {
        Claim storage c = _load(claimId);
        if (c.state != ClaimStates.MATURED && c.state != ClaimStates.DELAYED) revert InvalidClaimState();
        _setState(claimId, c, ClaimStates.PAID); // financedFaceValue preserved
        emit ClaimSliceReleased(claimId, c.financedFaceValue);
    }

    /// @inheritdoc IClaimRegistry
    function getClaim(bytes32 claimId) external view returns (Claim memory) {
        if (!_exists[claimId]) revert ClaimNotFound();
        return _claims[claimId];
    }

    /// @inheritdoc IClaimRegistry
    function isNonceUsed(address signer, uint256 nonce) external view returns (bool) {
        return _usedNonce[signer][nonce];
    }

    /// @inheritdoc IClaimRegistry
    function isFinanceable(bytes32 claimId) external view returns (bool) {
        if (!_exists[claimId]) return false;
        uint8 s = _claims[claimId].state;
        return s == ClaimStates.ELIGIBLE || s == ClaimStates.PARTIALLY_FUNDED;
    }

    /// @dev The single shared effect+event site for both registration paths. Marks the externalId
    ///      used, writes the ATTESTED claim (dueDate narrowed to uint64), and emits ClaimRegistered
    ///      with the RAW uint256 dueDate. Callers own their path-specific validations + nonce writes.
    function _writeClaim(
        bytes32 claimId,
        address beneficiary,
        address issuer,
        address token,
        uint256 faceValue,
        uint256 dueDate,
        uint8 claimType,
        bytes32 externalIdHash,
        bytes32 evidenceHash
    ) private {
        _usedExternalId[externalIdHash] = true;
        _claimExternalId[claimId] = externalIdHash;
        _exists[claimId] = true;
        _claims[claimId] = Claim({
            beneficiary: beneficiary,
            issuer: issuer,
            claimType: claimType,
            token: token,
            faceValue: faceValue,
            financedFaceValue: 0,
            dueDate: SafeCast.toUint64(dueDate),
            state: ClaimStates.ATTESTED,
            sliceCount: 0
        });

        emit ClaimRegistered(claimId, issuer, beneficiary, claimType, token, faceValue, dueDate, externalIdHash, evidenceHash);
    }

    /// @dev Frees the claim's externalIdHash so the underlying invoice can be re-attested after a
    ///      reject/revoke. The terminal claim record (REJECTED/REVOKED) is preserved.
    function _freeExternalId(bytes32 claimId) private {
        delete _usedExternalId[_claimExternalId[claimId]];
        delete _claimExternalId[claimId];
    }

    function _load(bytes32 claimId) private view returns (Claim storage c) {
        if (!_exists[claimId]) revert ClaimNotFound();
        c = _claims[claimId];
    }

    function _setState(bytes32 claimId, Claim storage c, uint8 newState) private {
        uint8 prev = c.state;
        c.state = newState;
        emit ClaimStateChanged(claimId, prev, newState);
    }
}
