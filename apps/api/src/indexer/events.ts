import { parseAbiItem } from "viem";

/**
 * Event signatures consumed by the indexer. Field order/types mirror the Solidity events.
 * Each is a single `AbiEvent` so viem's `getLogs({ event })` returns fully-typed `args`.
 */
export const ClaimRegisteredEvent = parseAbiItem(
  "event ClaimRegistered(bytes32 indexed claimId, address indexed issuer, address indexed beneficiary, uint8 claimType, address token, uint256 faceValue, uint256 dueDate, bytes32 externalIdHash, bytes32 evidenceHash)",
);
export const ClaimStateChangedEvent = parseAbiItem(
  "event ClaimStateChanged(bytes32 indexed claimId, uint8 previousState, uint8 newState)",
);
export const ClaimSliceReservedEvent = parseAbiItem(
  "event ClaimSliceReserved(bytes32 indexed claimId, uint256 faceAmount, uint256 financedFaceValue)",
);
export const ClaimSliceReleasedEvent = parseAbiItem(
  "event ClaimSliceReleased(bytes32 indexed claimId, uint256 financedFaceValue)",
);
export const RouteExecutedEvent = parseAbiItem(
  "event RouteExecuted(bytes32 indexed executionId, address indexed user, uint256 totalAdvance, uint256 totalFaceAssigned, uint256 totalCost)",
);
export const RouteLegExecutedEvent = parseAbiItem(
  "event RouteLegExecuted(bytes32 indexed executionId, bytes32 indexed claimId, address indexed vault, uint256 faceAmount, uint256 advanceAmount, uint256 discountAmount)",
);
export const ClaimSettledEvent = parseAbiItem(
  "event ClaimSettled(bytes32 indexed claimId, uint256 amountReceived, uint256 vaultDistribution, uint256 userResidual, uint256 protocolFee)",
);
