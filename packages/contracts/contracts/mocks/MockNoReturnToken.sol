// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockNoReturnToken
/// @notice TEST-ONLY non-compliant ERC-20 whose {transfer} reports failure by returning `false`
///         instead of reverting. Used to prove the protocol's {SafeERC20} usage surfaces such a
///         token as a hard revert ({SafeERC20FailedOperation}) rather than silently continuing.
/// @dev !!! TEST-ONLY — NOT FOR PRODUCTION !!! Never deployed by the protocol, never in the ABI
///      export set. Balances are unaffected by the overridden {transfer} (it moves nothing).
contract MockNoReturnToken is ERC20 {
    constructor() ERC20("NoReturn", "NORT") {}

    /// @notice Matches MockUSDT's 6-decimal precision.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Permissionless mint (test helper) so fixtures can seed balances.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Reports failure via a `false` return (moves no tokens) so SafeERC20 must revert.
    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }
}
