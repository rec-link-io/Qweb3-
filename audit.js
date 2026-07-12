'use strict';

/**
 * Audit Logging Service
 *
 * Writes structured audit entries to Firebase.
 * All audit failures are swallowed — they must never break the main operation.
 *
 * School-level logs: /auditLog/{schoolId}/{entryId}
 * Platform-level logs: /platformAuditLog/{entryId}
 */

const { db } = require('../utils/firebase');

/**
 * Write a school-level audit log entry.
 *
 * @param {string} schoolId  - The school this action belongs to
 * @param {string} action    - Short description (e.g. "Result pins generated")
 * @param {string} detail    - Additional context (e.g. "200 pins · 2025/2026 Third Term")
 * @param {string} userEmail - Who performed the action
 */
async function logAudit(schoolId, action, detail = '', userEmail = 'system') {
  try {
    await db.ref(`auditLog/${schoolId}`).push({
      action,
      detail,
      user:      userEmail,
      timestamp: Date.now(),
    });
  } catch (e) {
    // Never let audit failures surface to the caller
    console.error(`[Audit] School log failed [${schoolId}]:`, e.message);
  }
}

/**
 * Write a platform-level audit log entry (super admin actions).
 *
 * @param {string} action - Short description (e.g. "wallet_approved")
 * @param {object} data   - Any additional data fields
 */
async function logPlatformAudit(action, data = {}) {
  try {
    await db.ref('platformAuditLog').push({
      action,
      ...data,
      timestamp: Date.now(),
    });
  } catch (e) {
    console.error(`[Audit] Platform log failed:`, e.message);
  }
}

module.exports = { logAudit, logPlatformAudit };
