// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MaturaConstants} from "./MaturaConstants.sol";

/// @title MaturaPricing
/// @notice Deterministic integer-bps pricing. The vault's `previewQuote` and `fund`
///         MUST both route through this single function so preview and execution never diverge.
/// @dev Discount rounds UP (vault never undercharges); advance = face - discount rounds down.
library MaturaPricing {
    /// @notice Thrown when the claim is already matured/past due at pricing time.
    error DueDateInPast();
    /// @notice Thrown when base + duration + premium exceeds MAX_DISCOUNT_BPS.
    error DiscountCapExceeded();

    /// @param baseDiscountBps per-vault base discount (bps)
    /// @param durationBpsPerDay per-vault per-day discount (bps/day)
    /// @param premiumBps per-claim-type premium (bps)
    /// @param faceAmount face value of the slice (base units)
    /// @param dueDate claim maturity (unix seconds), strictly in the future
    /// @return advanceAmount amount advanced to the user (face - discount)
    /// @return discountAmount the discount retained (rounded up)
    function quote(
        uint16 baseDiscountBps,
        uint16 durationBpsPerDay,
        uint16 premiumBps,
        uint256 faceAmount,
        uint256 dueDate
    ) internal view returns (uint256 advanceAmount, uint256 discountAmount) {
        if (dueDate <= block.timestamp) revert DueDateInPast();
        uint256 daysToDue = (dueDate - block.timestamp) / 1 days;
        uint256 totalBps = uint256(baseDiscountBps) + (uint256(durationBpsPerDay) * daysToDue) + uint256(premiumBps);
        if (totalBps > MaturaConstants.MAX_DISCOUNT_BPS) revert DiscountCapExceeded();
        discountAmount = Math.mulDiv(faceAmount, totalBps, MaturaConstants.BPS_DENOMINATOR, Math.Rounding.Ceil);
        advanceAmount = faceAmount - discountAmount;
    }
}
