'use strict';

/**
 * Commission Service
 *
 * Handles:
 *   • Direct partner commissions
 *   • Upline commissions
 *
 * DEPRECATED: This file is maintained for backwards compatibility.
 * Use partners.js writeCommission() instead.
 *
 * The partners.js module handles all commission calculations atomically.
 */

const { db } = require('../utils/firebase');
const { logAudit } = require('./audit');

/**
 * DEPRECATED: Use partners.writeCommission() instead.
 * This function maintained only for legacy code paths.
 */
async function writeCommission(school, pinCount, pinType) {
  // Delegate to the canonical implementation
  const { writeCommission: writeCommissionCanonical } = require('./partners');
  return writeCommissionCanonical(school, pinCount, pinType);
}

module.exports = { writeCommission };
