// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ISettlementManager} from "../interfaces/ISettlementManager.sol";
import {IClaimRegistry} from "../interfaces/IClaimRegistry.sol";
import {ClaimTypes, ClaimStates} from "../libraries/ClaimEnums.sol";

/// @title MockStream
/// @notice A minimal LINEAR stablecoin stream (start/stop/deposit) exposing vested/remaining
///         economics, whose position is ASSIGNABLE to the protocol so the remaining-claimable amount
///         can be financed as a single claim. This is a self-contained mock — it does NOT import or
///         integrate Sablier; it only mirrors the round-down `streamed − withdrawn` shape.
/// @dev !!! TESTNET / DEMO ONLY — NOT FOR PRODUCTION !!!
///      Trust model:
///      - Trusts `token` as a well-behaved standard ERC-20 (the demo MockUSDT).
///      - The stream is BOTH the claim's issuer (calls registerFromSource) AND its obligor.
///      - One claim per stream (cumulative-face solvency): the frozen `faceValue` never exceeds the
///        deposit still held, and a second {createClaim} reverts {AlreadyClaimed}.
///      - Assignment is one-shot and irreversible: after {assignToProtocol} the recipient can no
///        longer {withdraw}, so the deposit stays put to back the claim.
///      - Bound obligor + `feeBps() == 0` precondition, identical to {MockFreelanceEscrow}.
contract MockStream is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Stream {
        address funder;
        address recipient;
        uint256 deposit;
        uint64 start;
        uint64 stop;
        uint256 withdrawn;
        bool assigned;
        bytes32 claimId; // 0 until the single claim is created
    }

    /// @notice The ERC-20 the stream is funded and paid in (demo MockUSDT).
    IERC20 public immutable token;
    /// @notice The claim registry this stream registers its claim into and matures on settlement.
    IClaimRegistry public immutable claimRegistry;
    /// @notice The settlement manager that pulls the face and distributes it on settlement.
    ISettlementManager public immutable settlementManager;

    /// @dev Stream ids start at 1 so a 0 lookup unambiguously means "no stream".
    uint256 private _nextStreamId = 1;
    mapping(uint256 streamId => Stream) private _streams;
    /// @notice claimId -> streamId, so {settle} pays only the funds bound to that claim.
    mapping(bytes32 claimId => uint256 streamId) public claimToStream;

    event StreamCreated(
        uint256 indexed streamId, address indexed funder, address indexed recipient, uint256 deposit, uint64 start, uint64 stop
    );
    event StreamWithdrawn(uint256 indexed streamId, uint256 amount);
    event StreamAssigned(uint256 indexed streamId);
    event StreamClaimCreated(uint256 indexed streamId, bytes32 indexed claimId, uint256 faceValue);
    event StreamSettled(uint256 indexed streamId, bytes32 indexed claimId);

    error ZeroAddress();
    error ZeroAmount();
    error BadTimeRange();
    error NotRecipient();
    error AlreadyAssigned();
    error NotAssigned();
    error AlreadyClaimed();
    error InsufficientClaimable();
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

    /// @notice Fund a new linear stream to `recipient` over [start, stop). Returns its id.
    function createStream(address recipient, uint256 deposit, uint64 start, uint64 stop)
        external
        nonReentrant
        returns (uint256 streamId)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (deposit == 0) revert ZeroAmount();
        if (stop <= start) revert BadTimeRange();

        streamId = _nextStreamId++;
        _streams[streamId] = Stream({
            funder: msg.sender,
            recipient: recipient,
            deposit: deposit,
            start: start,
            stop: stop,
            withdrawn: 0,
            assigned: false,
            claimId: bytes32(0)
        });

        token.safeTransferFrom(msg.sender, address(this), deposit);
        emit StreamCreated(streamId, msg.sender, recipient, deposit, start, stop);
    }

    /// @notice Recipient withdraws up to the currently claimable amount. Disabled after assignment.
    function withdraw(uint256 streamId, uint256 amount) external nonReentrant {
        Stream storage s = _streams[streamId];
        if (s.assigned) revert AlreadyAssigned();
        if (msg.sender != s.recipient) revert NotRecipient();
        if (amount == 0) revert ZeroAmount();
        if (amount > _claimable(s)) revert InsufficientClaimable();

        s.withdrawn += amount;
        token.safeTransfer(s.recipient, amount);
        emit StreamWithdrawn(streamId, amount);
    }

    /// @notice Recipient assigns the stream position to the protocol (one-shot). After this the
    ///         recipient can no longer {withdraw}; the deposit stays to back the financed claim.
    function assignToProtocol(uint256 streamId) external {
        Stream storage s = _streams[streamId];
        if (msg.sender != s.recipient) revert NotRecipient();
        if (s.assigned) revert AlreadyAssigned();
        s.assigned = true;
        emit StreamAssigned(streamId);
    }

    /// @notice Freeze the remaining-claimable amount as the single financeable claim for this stream.
    ///         Requires the stream to be assigned; a second call reverts {AlreadyClaimed}.
    /// @dev Recipient-gated: the frozen `face` is the claimable AT CALL TIME, so a permissionless
    ///      call would let a third party front-run the recipient's intended timing and lock in a
    ///      smaller face (stranding the remainder, since `withdraw` is disabled post-assign). Only
    ///      the recipient may create the claim. faceValue = claimable-at-registration; dueDate =
    ///      stop; the claim's beneficiary is the recipient; issuer is this contract.
    function createClaim(uint256 streamId) external returns (bytes32 claimId) {
        Stream storage s = _streams[streamId];
        if (msg.sender != s.recipient) revert NotRecipient();
        if (!s.assigned) revert NotAssigned();
        if (s.claimId != bytes32(0)) revert AlreadyClaimed();

        uint256 face = _claimable(s);
        if (face == 0) revert ZeroAmount();

        claimId = keccak256(abi.encode("MockStream.claim", address(this), streamId));
        bytes32 externalIdHash = keccak256(abi.encode("MockStream.ext", address(this), streamId));
        bytes32 evidenceHash = keccak256(abi.encode("MockStream.evidence", address(this), streamId));

        s.claimId = claimId;
        claimToStream[claimId] = streamId;

        claimRegistry.registerFromSource(
            claimId,
            s.recipient,
            address(token),
            face,
            uint256(s.stop),
            ClaimTypes.STREAM,
            externalIdHash,
            evidenceHash
        );
        emit StreamClaimCreated(streamId, claimId, face);
    }

    /// @notice Bound obligor: mature (if needed) then settle the claim bound to this stream, paying
    ///         only that stream's deposit. See {MockFreelanceEscrow-settle} for the shared discipline.
    function settle(bytes32 claimId) external nonReentrant {
        uint256 streamId = claimToStream[claimId];
        if (streamId == 0) revert UnknownClaim();
        // The claim's own state guards double-settle (settleClaim reverts AlreadySettled once PAID).
        if (settlementManager.feeBps() != 0) revert FeeNotZero();

        IClaimRegistry.Claim memory c = claimRegistry.getClaim(claimId);
        if (c.state == ClaimStates.FUNDED || c.state == ClaimStates.PARTIALLY_FUNDED) {
            claimRegistry.markMatured(claimId); // reverts NotMatured if dueDate not reached
        }
        token.forceApprove(address(settlementManager), c.faceValue); // feeBps == 0 → owed == faceValue
        settlementManager.settleClaim(claimId);
        emit StreamSettled(streamId, claimId);
    }

    /// @notice Total amount vested (streamed) so far, rounded down (multiply-before-divide).
    function streamedOf(uint256 streamId) external view returns (uint256) {
        return _streamed(_streams[streamId]);
    }

    /// @notice Currently claimable amount: streamed − withdrawn.
    function claimableOf(uint256 streamId) external view returns (uint256) {
        return _claimable(_streams[streamId]);
    }

    /// @notice Amount not yet vested: deposit − streamed.
    function remainingOf(uint256 streamId) external view returns (uint256) {
        Stream storage s = _streams[streamId];
        return s.deposit - _streamed(s);
    }

    /// @notice Read a stream by id.
    function getStream(uint256 streamId) external view returns (Stream memory) {
        return _streams[streamId];
    }

    /// @dev Linear vesting, clamped to [0, deposit], rounded down.
    function _streamed(Stream storage s) private view returns (uint256) {
        if (block.timestamp <= s.start) return 0;
        if (block.timestamp >= s.stop) return s.deposit;
        uint256 elapsed = block.timestamp - s.start;
        uint256 duration = s.stop - s.start;
        return (s.deposit * elapsed) / duration; // multiply before divide → round down
    }

    function _claimable(Stream storage s) private view returns (uint256) {
        return _streamed(s) - s.withdrawn;
    }
}
