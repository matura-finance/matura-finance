// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMaturaRouter
/// @notice Verifies a user-signed EIP-712 ExecutionRoute, recomputes every vault quote on-chain,
///         reserves claim slices and funds the user atomically. Validates a backend-proposed route;
///         it never searches for the cheapest combination on-chain.
interface IMaturaRouter {
    struct RouteLeg {
        bytes32 claimId;
        address vault;
        uint256 faceAmount;
        uint256 minimumAdvanceAmount;
    }

    struct ExecutionRoute {
        address user;
        uint256 targetAdvance;
        uint256 maxTotalFace;
        uint256 deadline;
        uint256 nonce;
        RouteLeg[] legs;
    }

    event RouteExecuted(
        bytes32 indexed executionId,
        address indexed user,
        uint256 totalAdvance,
        uint256 totalFaceAssigned,
        uint256 totalCost
    );
    event RouteLegExecuted(
        bytes32 indexed executionId,
        bytes32 indexed claimId,
        address indexed vault,
        uint256 faceAmount,
        uint256 advanceAmount,
        uint256 discountAmount
    );

    error RouteExpired();
    error InvalidRouteSignature();
    error EmptyRoute();
    error ZeroTargetAdvance();
    error DuplicateClaimInRoute();
    error VaultNotActive();
    error BeneficiaryMismatch();
    error TokenMismatch();
    error ClaimNotFinanceable();
    error IssuerInactive();
    error AdvanceBelowMinimum();
    error TargetAdvanceNotMet();
    error MaxFaceExceeded();
    error MaxLegsExceeded();
    error MandateRejected();
    error InsufficientLiquidity();
    error ZeroAddress();

    /// @notice Execute a signed route: reserve slices + fund the user atomically. Reverts the whole
    ///         transaction if any leg fails. `signature` is the user's EIP-712 signature over `route`.
    function executeRoute(ExecutionRoute calldata route, bytes calldata signature) external;
}
