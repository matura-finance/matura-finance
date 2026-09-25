// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IVaultRegistry
/// @notice Enumerable registry of LiquidityVaults the router may route across. Vaults are never
///         deleted (settlement always pays the stored vault); `active=false` only blocks new routing.
interface IVaultRegistry {
    event VaultRegistered(address indexed vault);
    event VaultStatusChanged(address indexed vault, bool active);

    error VaultAlreadyRegistered(address vault);
    error VaultNotRegistered(address vault);
    error ZeroAddress();

    function registerVault(address vault) external; // DEFAULT_ADMIN_ROLE
    function setVaultActive(address vault, bool active) external; // DEFAULT_ADMIN_ROLE
    function isRegistered(address vault) external view returns (bool);
    function isActive(address vault) external view returns (bool);
    function getVaults() external view returns (address[] memory);
}
