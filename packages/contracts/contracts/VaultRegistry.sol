// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IVaultRegistry} from "./interfaces/IVaultRegistry.sol";

/// @title VaultRegistry
/// @notice Enumerable registry of LiquidityVaults the router may route across. Vaults are never
///         removed once registered (settlement always pays the stored vault); toggling `active`
///         to false only blocks NEW routing while preserving the ability to settle existing legs.
/// @dev Administered entirely by `DEFAULT_ADMIN_ROLE`. Registration is append-only.
contract VaultRegistry is IVaultRegistry, AccessControl {
    /// @notice Append-only list of every vault that has ever been registered.
    address[] private _vaults;
    /// @notice Tracks whether a vault has ever been registered (membership set for `_vaults`).
    mapping(address => bool) private _registered;
    /// @notice Tracks whether a registered vault currently accepts new routing.
    mapping(address => bool) private _active;

    /// @notice Deploys the registry and grants full administration to `admin`.
    /// @param admin The address that receives `DEFAULT_ADMIN_ROLE`.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Registers a new vault, marking it registered and active.
    /// @dev Reverts with {ZeroAddress} for the zero address and {VaultAlreadyRegistered} if the
    ///      vault is already present. Registration is permanent; vaults are never removed.
    /// @param vault The LiquidityVault address to register.
    function registerVault(address vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (vault == address(0)) revert ZeroAddress();
        if (_registered[vault]) revert VaultAlreadyRegistered(vault);

        _vaults.push(vault);
        _registered[vault] = true;
        _active[vault] = true;

        emit VaultRegistered(vault);
    }

    /// @notice Enables or disables new routing to an already-registered vault.
    /// @dev Reverts with {VaultNotRegistered} if the vault was never registered. Does not remove
    ///      the vault from the registry; settlement of existing legs remains possible.
    /// @param vault The registered vault whose status is being changed.
    /// @param active True to allow new routing, false to block it.
    function setVaultActive(address vault, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_registered[vault]) revert VaultNotRegistered(vault);

        _active[vault] = active;

        emit VaultStatusChanged(vault, active);
    }

    /// @notice Returns whether a vault has ever been registered.
    /// @param vault The vault address to query.
    /// @return True if the vault is registered.
    function isRegistered(address vault) external view returns (bool) {
        return _registered[vault];
    }

    /// @notice Returns whether a registered vault currently accepts new routing.
    /// @param vault The vault address to query.
    /// @return True if the vault is registered and active.
    function isActive(address vault) external view returns (bool) {
        return _active[vault];
    }

    /// @notice Returns the full list of registered vaults in registration order.
    /// @return The complete array of registered vault addresses.
    function getVaults() external view returns (address[] memory) {
        return _vaults;
    }
}
