'use strict';

/**
 * Partners Service — Commission Calculation
 *
 * Commission split per ₦850 pin:
 *   School has direct partner + upline:
 *     SchoolCore:      ₦425  (50%)
 *     Direct partner:  ₦255  (30%)
 *     Upline partner:  ₦170  (20%)
 *
 *   School has direct partner, no upline:
 *     SchoolCore:      ₦595  (70%)
 *     Direct partner:  ₦255  (30%)
 *
 *   School is direct (no partner):
 *     SchoolCore:      ₦850  (100%)
 *
 * Uses atomic Firebase Transactions to prevent lost updates
 * when multiple schools generate pins simultaneously.
 */

const { db }                        = require('../utils/firebase');
const { incrementPartnerEarnings }  = require('../utils/transactions');

const PIN_PRICE     = 850;
const DIRECT_RATE   = 0.30; // 30%
const INDIRECT_RATE = 0.20; // 20%

/**
 * Calculate and write commission to partner accounts.
 * Called after every successful pin generation.
 *
 * This function is non-critical — the calling service calls it with .catch()
 * so commission failures do not roll back the pin generation.
 */
async function writeCommission(school, pinCount, pinType) {
  const marketerId = school.marketerId || null;
  if (!marketerId) return; // Direct school — SchoolCore keeps all revenue

  // Verify partner exists
  const partnerSnap = await db.ref(`partners/${marketerId}`).once('value');
  if (!partnerSnap.exists()) {
    console.warn(`[Partners] Partner ${marketerId} not found for school ${school.id}. No commission written.`);
    return;
  }

  const partner    = partnerSnap.val();
  const uplineId   = partner.uplineId || null;
  const totalValue = pinCount * PIN_PRICE;
  const directAmt  = Math.round(totalValue * DIRECT_RATE);

  // ── Direct partner commission ──
  await incrementPartnerEarnings(marketerId, directAmt, {
    type:       'commission_direct',
    schoolId:   school.id,
    schoolName: school.schoolName || '',
    pinCount,
    pinType,
    pinPrice:   PIN_PRICE,
    rate:       `${DIRECT_RATE * 100}%`,
  });

  // ── Upline partner commission ──
  if (uplineId) {
    const uplineAmt = Math.round(totalValue * INDIRECT_RATE);

    // Verify upline exists before writing
    const uplineSnap = await db.ref(`partners/${uplineId}`).once('value');
    if (!uplineSnap.exists()) {
      console.warn(`[Partners] Upline ${uplineId} not found. Indirect commission skipped.`);
      return;
    }

    await incrementPartnerEarnings(uplineId, uplineAmt, {
      type:               'commission_network',
      schoolId:           school.id,
      schoolName:         school.schoolName || '',
      pinCount,
      pinType,
      pinPrice:           PIN_PRICE,
      rate:               `${INDIRECT_RATE * 100}%`,
      referredPartnerId:  marketerId,
    });
  }
}

/**
 * Calculate what the commission split would be for a given number of pins.
 * Used by the frontend for display purposes — does not write anything.
 */
function calculateCommissionPreview(pinCount, hasPartner, hasUpline) {
  const total      = pinCount * PIN_PRICE;
  const directAmt  = hasPartner ? Math.round(total * DIRECT_RATE)   : 0;
  const uplineAmt  = hasUpline  ? Math.round(total * INDIRECT_RATE)  : 0;
  const scAmt      = total - directAmt - uplineAmt;
  return { total, schoolcoreAmount: scAmt, directAmount: directAmt, uplineAmount: uplineAmt };
}

module.exports = { writeCommission, calculateCommissionPreview };
