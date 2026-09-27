// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ISettlementManager} from "../interfaces/ISettlementManager.sol";
import {IClaimRegistry} from "../interfaces/IClaimRegistry.sol";
import {ClaimTypes, ClaimStates} from "../libraries/ClaimEnums.sol";

/// @title MockFreelanceEscrow
/// @notice A client-funded escrow that produces financeable payout claims from its OWN verified
///         on-chain state: a client funds an engagement, approves the work, then creates a single
///         payout that is registered in the {ClaimRegistry} via {IClaimRegistry-registerFromSource}.
///         The escrow is BOTH the claim's issuer (it calls registerFromSource, so the claim's issuer
///         is this contract) AND its obligor (it holds the engagement's funds and settles the claim).
/// @dev !!! TESTNET / DEMO ONLY — NOT FOR PRODUCTION !!!
///      Trust model:
///      - Trusts `token` as a well-behaved standard ERC-20 (the demo MockUSDT); it is the sole asset
///        held and the sole spend-approval target (`settlementManager`).
///      - Per-engagement accounting only (never `token.balanceOf`): each engagement records its own
///        `amount`, so one engagement's funds can never settle another's.
///      - Bound obligor (unlike {SourceObligor}): {settle} resolves the engagement bound to `claimId`
///        and pays ONLY that engagement's funds — a caller cannot drain engagement A to settle B.
///      - Requires `settlementManager.feeBps() == 0`: the escrow holds exactly the face, so a nonzero
///        surcharge would make it insolvent; {settle} fails closed with {FeeNotZero}.
///      - No refund path in P0 (YAGNI): funds either settle to the claim or stay escrowed on the
///        testnet. If added later, refund MUST consult the registry terminal state.
contract MockFreelanceEscrow is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    enum EngagementState {
        None,
        Funded,
        Approved,
        Settled
    }

    struct Engagement {
        address client;
        address beneficiary;
        uint256 amount;
        uint64 releaseDate;
        EngagementState state;
        bytes32 claimId; // 0 until the payout is created
    }

    /// @notice The ERC-20 settlement token every engagement is funded and paid in (demo MockUSDT).
    IERC20 public immutable token;
    /// @notice The claim registry this escrow registers payouts into and matures on settlement.
    IClaimRegistry public immutable claimRegistry;
    /// @notice The settlement manager that pulls the face and distributes it on settlement.
    ISettlementManager public immutable settlementManager;

    /// @dev Engagement ids start at 1 so a 0 lookup unambiguously means "no engagement".
    uint256 private _nextEngagementId = 1;
    mapping(uint256 engagementId => Engagement) private _engagements;
    /// @notice claimId -> engagementId, so {settle} pays only the funds bound to that claim.
    mapping(bytes32 claimId => uint256 engagementId) public claimToEngagement;

    event EngagementFunded(
        uint256 indexed engagementId, address indexed client, address indexed beneficiary, uint256 amount, uint64 releaseDate
    );
    event WorkApproved(uint256 indexed engagementId);
    event PayoutCreated(uint256 indexed engagementId, bytes32 indexed claimId);
    event EngagementSettled(uint256 indexed engagementId, bytes32 indexed claimId);

    error ZeroAddress();
    error ZeroAmount();
    error BadState();
    error UnknownClaim();
    error FeeNotZero();

    /// @param token_ the ERC-20 settlement token (demo MockUSDT)
    /// @param claimRegistry_ the authoritative {IClaimRegistry}
    /// @param settlementManager_ the {ISettlementManager} that settles claims
    constructor(address token_, address claimRegistry_, address settlementManager_) {
        if (token_ == address(0) || claimRegistry_ == address(0) || settlementManager_ == address(0)) {
            revert ZeroAddress();
        }
        token = IERC20(token_);
        claimRegistry = IClaimRegistry(claimRegistry_);
        settlementManager = ISettlementManager(settlementManager_);
    }

    /// @notice Client funds a new engagement, transferring `amount` into escrow. Returns its id.
    /// @param beneficiary the freelancer who will receive the residual on settlement
    /// @param amount the engagement face (also the claim's faceValue)
    /// @param releaseDate the synthetic due date the payout claim will carry (unix seconds)
    function fundEngagement(address beneficiary, uint256 amount, uint64 releaseDate)
        external
        nonReentrant
        returns (uint256 engagementId)
    {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        engagementId = _nextEngagementId++;
        _engagements[engagementId] = Engagement({
            client: msg.sender,
            beneficiary: beneficiary,
            amount: amount,
            releaseDate: releaseDate,
            state: EngagementState.Funded,
            claimId: bytes32(0)
        });

        // Interaction last (CEI): the engagement is already recorded before the pull.
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit EngagementFunded(engagementId, msg.sender, beneficiary, amount, releaseDate);
    }

    /// @notice Client approves the funded work, unlocking payout creation. Funded -> Approved.
    function approveWork(uint256 engagementId) external {
        Engagement storage eng = _engagements[engagementId];
        if (eng.state != EngagementState.Funded) revert BadState();
        if (msg.sender != eng.client) revert BadState();
        eng.state = EngagementState.Approved;
        emit WorkApproved(engagementId);
    }

    /// @notice Register the engagement's single payout as a claim in the registry (Approved state).
    ///         Each engagement backs at most one claim: a second call reverts {BadState} (claimId set).
    /// @dev The claim's issuer is this contract (registerFromSource binds issuer to msg.sender). The
    ///      externalIdHash is derived from (this, engagementId), so the registry's global uniqueness
    ///      set also guards against a duplicate for the same payout.
    function createPayout(uint256 engagementId) external returns (bytes32 claimId) {
        Engagement storage eng = _engagements[engagementId];
        if (eng.state != EngagementState.Approved || eng.claimId != bytes32(0)) revert BadState();

        claimId = keccak256(abi.encode("MockFreelanceEscrow.claim", address(this), engagementId));
        bytes32 externalIdHash = keccak256(abi.encode("MockFreelanceEscrow.ext", address(this), engagementId));
        bytes32 evidenceHash = keccak256(abi.encode("MockFreelanceEscrow.evidence", address(this), engagementId));

        eng.claimId = claimId;
        claimToEngagement[claimId] = engagementId;

        claimRegistry.registerFromSource(
            claimId,
            eng.beneficiary,
            address(token),
            eng.amount,
            uint256(eng.releaseDate),
            ClaimTypes.FREELANCE_ESCROW,
            externalIdHash,
            evidenceHash
        );
        emit PayoutCreated(engagementId, claimId);
    }

    /// @notice Bound obligor: mature (if needed) then settle the claim bound to this escrow's
    ///         engagement, paying exactly that engagement's funds. Permissionless payer, but the
    ///         funds spent are structurally limited to the engagement bound to `claimId`.
    /// @dev CEI: the engagement is marked Settled before any external call. Requires
    ///      `settlementManager.feeBps() == 0` (the escrow holds exactly the face); at zero fee the
    ///      amount owed equals `faceValue`, which the engagement funded.
    ///      NOTE: this is a BOUND, ZERO-FEE obligor. Despite sharing the `settle(bytes32)` signature
    ///      with {SourceObligor}, the two are NOT substitutable: {SourceObligor} replicates the
    ///      surcharge math and settles from a pooled balance at any `feeBps`, whereas this adapter
    ///      fails closed under any nonzero fee. Callers must not treat the three sources as
    ///      interchangeable through the shared signature (see the `sourceAbis` binding in the chain
    ///      package).
    function settle(bytes32 claimId) external nonReentrant {
        uint256 engagementId = claimToEngagement[claimId];
        if (engagementId == 0) revert UnknownClaim();
        Engagement storage eng = _engagements[engagementId];
        if (eng.state != EngagementState.Approved) revert BadState();
        if (settlementManager.feeBps() != 0) revert FeeNotZero();

        // Effects first.
        eng.state = EngagementState.Settled;

        // Interactions.
        IClaimRegistry.Claim memory c = claimRegistry.getClaim(claimId);
        if (c.state == ClaimStates.FUNDED || c.state == ClaimStates.PARTIALLY_FUNDED) {
            claimRegistry.markMatured(claimId); // reverts NotMatured if dueDate not reached
        }
        token.forceApprove(address(settlementManager), c.faceValue); // feeBps == 0 → owed == faceValue
        settlementManager.settleClaim(claimId);
        emit EngagementSettled(engagementId, claimId);
    }

    /// @notice Read an engagement by id.
    function getEngagement(uint256 engagementId) external view returns (Engagement memory) {
        return _engagements[engagementId];
    }
}
