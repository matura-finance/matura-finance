// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ISettlementManager
/// @notice Records per-(claim,vault) funded allocations from the router and performs maturity-gated
///         settlement with exact conservation. Allocations are AGGREGATED per (claimId, vault) so a
///         claim funded by the same vault across multiple routes settles with one transfer/return.
interface ISettlementManager {
    struct Allocation {
        address vault;
        uint256 faceAmount;
    }

    event AllocationRegistered(
        bytes32 indexed claimId, bytes32 indexed executionId, address indexed vault, uint256 faceAmount
    );
    event ClaimSettled(
        bytes32 indexed claimId,
        uint256 amountReceived,
        uint256 vaultDistribution,
        uint256 userResidual,
        uint256 protocolFee
    );
    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(uint16 feeBps);

    error NotMature();
    error AlreadySettled();
    error ConservationViolation();
    error FeeTooHigh();
    error ZeroAddress();
    error MaxSlicesExceeded();
    error NothingFinanced();

    /// @notice Register (or add to) a funded allocation for (claimId, vault) (ROUTER_ROLE).
    function registerAllocation(bytes32 claimId, bytes32 executionId, address vault, uint256 faceAmount) external;

    /// @notice Maturity-gated, exact-pull settlement. Pulls faceValue + fee from msg.sender,
    ///         distributes financed face to each vault, residual to beneficiary, fee to treasury,
    ///         then marks the claim PAID. Permissionless payer.
    function settleClaim(bytes32 claimId) external;

    function setTreasury(address treasury) external; // DEFAULT_ADMIN_ROLE
    function setFeeBps(uint16 feeBps) external; // DEFAULT_ADMIN_ROLE, <= MAX_FEE_BPS
    function getAllocations(bytes32 claimId) external view returns (Allocation[] memory);
}
