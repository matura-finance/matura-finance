// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title MockUSDT
/// @notice A 6-decimal ERC20 that stands in for USDT on Matura testnets and local demos.
/// @dev !!! TESTNET / DEMO ONLY — NOT FOR PRODUCTION !!!
///      This token grants an UNRESTRICTED faucet: any address may mint itself tokens (up to a
///      per-address demo cap) with no cost, KYC, or supply backing. It carries none of the
///      guarantees of a real stablecoin and MUST never be deployed to, or trusted on, mainnet.
///      It exists purely so integrators can exercise the protocol with a fungible settlement
///      asset. Admins may additionally mint arbitrary amounts to seed liquidity in test fixtures.
contract MockUSDT is ERC20, AccessControl {
    /// @notice Total amount of tokens a single address may ever claim from {faucet}.
    /// @dev Cumulative across all faucet calls per address; the admin {mint} path is NOT capped.
    uint256 public constant FAUCET_CAP = 10_000e6;

    /// @notice Cumulative tokens each address has claimed via {faucet}.
    /// @dev Keyed by claimant; never decreases. Compared against {FAUCET_CAP} on every claim.
    mapping(address => uint256) public claimed;

    /// @notice Emitted when an address successfully claims tokens from the faucet.
    /// @param to The address that received the freshly minted tokens.
    /// @param amount The number of 6-decimal tokens minted by this claim.
    event Faucet(address indexed to, uint256 amount);

    /// @notice Reverts when a faucet claim would push an address past {FAUCET_CAP}.
    /// @param claimed The amount the caller has already claimed before this attempt.
    /// @param cap The per-address cap ({FAUCET_CAP}) that would be exceeded.
    error FaucetCapExceeded(uint256 claimed, uint256 cap);

    /// @notice Deploys the mock token and grants full admin rights to the deployer.
    /// @dev Sets ERC20 name "Mock USDT" / symbol "USDT"; grants DEFAULT_ADMIN_ROLE to msg.sender.
    constructor() ERC20("Mock USDT", "USDT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Returns the number of decimals used to display token amounts.
    /// @dev Overrides the ERC20 default of 18 to match USDT's 6 decimals.
    /// @return The fixed decimal precision, always 6.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints tokens to an arbitrary address; restricted to protocol admins.
    /// @dev DEMO helper for seeding balances (e.g. vault liquidity). Not faucet-capped.
    /// @param to The recipient of the newly minted tokens.
    /// @param amount The number of 6-decimal tokens to mint.
    function mint(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _mint(to, amount);
    }

    /// @notice Mints tokens to the caller, subject to a cumulative per-address demo cap.
    /// @dev !!! TESTNET / DEMO ONLY !!! Permissionless minting. Reverts with
    ///      {FaucetCapExceeded} if the caller's lifetime claims would exceed {FAUCET_CAP}.
    /// @param amount The number of 6-decimal tokens to mint to msg.sender.
    function faucet(uint256 amount) external {
        uint256 alreadyClaimed = claimed[msg.sender];
        if (alreadyClaimed + amount > FAUCET_CAP) {
            revert FaucetCapExceeded(alreadyClaimed, FAUCET_CAP);
        }
        claimed[msg.sender] = alreadyClaimed + amount;
        emit Faucet(msg.sender, amount);
        _mint(msg.sender, amount);
    }
}
