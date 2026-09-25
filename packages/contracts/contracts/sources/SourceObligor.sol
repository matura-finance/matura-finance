// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ISettlementManager} from "../interfaces/ISettlementManager.sol";
import {IClaimRegistry} from "../interfaces/IClaimRegistry.sol";
import {MaturaConstants} from "../libraries/MaturaConstants.sol";
import {ClaimStates} from "../libraries/ClaimEnums.sol";

/// @title SourceObligor
/// @notice A funded, permissionless self-paying obligor used to simulate the source that owes a
///         financed claim. Anyone may call {settle} to mature (if needed) and settle a funded claim
///         out of this contract's own balance, approving the EXACT settlement amount just-in-time.
/// @dev !!! TESTNET / DEMO ONLY — NOT FOR PRODUCTION !!!
///      Trust model (deliberately minimal — no ReentrancyGuard, no roles, no admin):
///      - Trusts `token` as a well-behaved standard ERC-20 (the demo MockUSDT). It is the sole
///        asset held and the sole spend approval target.
///      - Trusts the immutable, correctly-wired `settlementManager` as the ONLY spender: {settle}
///        approves exactly `owed` to it and nothing else, and {SettlementManager-settleClaim} is
///        itself `nonReentrant`, so this contract adds no reentrancy surface of its own.
///      - Holds only disposable, pre-funded balance; a griefer can at most trigger legitimate
///        settlements of funded, matured claims (which is the point) — it never custodies value it
///        is unwilling to pay out.
///      - No obligor<->claim binding: {settle} is permissionless and settles ANY settleable claim
///        from this obligor's own balance, so on a shared testnet anyone can drain one obligor to
///        settle an unrelated claim. Not theft (funds only flow through the legit settlement path;
///        an attacker with no issuer key cannot name themselves beneficiary) — acceptable for the
///        demo, but do NOT rely on per-obligor accounting.
contract SourceObligor {
    using SafeERC20 for IERC20;

    /// @notice The ERC-20 settlement token this obligor pays claims in (demo MockUSDT).
    IERC20 public immutable token;
    /// @notice The settlement manager that pulls `owed` and distributes it on settlement.
    ISettlementManager public immutable settlementManager;
    /// @notice The claim registry queried for claim state and used to mature funded claims.
    IClaimRegistry public immutable claimRegistry;

    /// @notice Reverts when any constructor dependency is the zero address.
    error ZeroAddress();

    /// @notice Wires the obligor to its immutable dependencies.
    /// @dev Grants no approval here — {settle} approves the exact amount just-in-time.
    /// @param token_ The ERC-20 settlement token (demo MockUSDT).
    /// @param settlementManager_ The {ISettlementManager} that settles claims.
    /// @param claimRegistry_ The authoritative {IClaimRegistry}.
    constructor(address token_, address settlementManager_, address claimRegistry_) {
        if (token_ == address(0) || settlementManager_ == address(0) || claimRegistry_ == address(0)) {
            revert ZeroAddress();
        }
        token = IERC20(token_);
        settlementManager = ISettlementManager(settlementManager_);
        claimRegistry = IClaimRegistry(claimRegistry_);
    }

    /// @notice Permissionless: mature (if needed) then settle a funded claim, approving the exact
    ///         settlement amount just-in-time and paying it out of this contract's balance.
    /// @dev Mirrors {SettlementManager-settleClaim}'s fee-as-surcharge math exactly: the payer owes
    ///      `faceValue + ceil(faceValue * feeBps / BPS_DENOMINATOR)`. If the claim is still
    ///      FUNDED/PARTIALLY_FUNDED it is matured first (reverts {IClaimRegistry-NotMatured} if the
    ///      due date has not elapsed); otherwise {SettlementManager-settleClaim} reverts
    ///      {ISettlementManager-NotMature} unless the claim is MATURED/DELAYED. Checks-effects-
    ///      interactions: the state-changing {IClaimRegistry-markMatured} precedes the approval and
    ///      settlement interactions.
    /// @param claimId The claim to mature (if needed) and settle.
    function settle(bytes32 claimId) external {
        IClaimRegistry.Claim memory c = claimRegistry.getClaim(claimId);

        if (c.state == ClaimStates.FUNDED || c.state == ClaimStates.PARTIALLY_FUNDED) {
            claimRegistry.markMatured(claimId); // reverts NotMatured if dueDate not reached
        }

        // Exact settlement surcharge — identical formula/rounding to SettlementManager.settleClaim.
        uint256 protocolFee =
            Math.mulDiv(c.faceValue, settlementManager.feeBps(), MaturaConstants.BPS_DENOMINATOR, Math.Rounding.Ceil);
        uint256 owed = c.faceValue + protocolFee;

        token.forceApprove(address(settlementManager), owed);
        settlementManager.settleClaim(claimId); // pulls exactly `owed`; reverts if not MATURED/DELAYED
    }
}
