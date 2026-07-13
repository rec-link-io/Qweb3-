'use strict';

/**
 * Pins Service
 *
 * Generates result and fee scratch pins.
 * Every pin generation:
 *   1. Atomically deducts wallet (fails safely if insufficient)
 *   2. Creates pin records in Firebase
 *   3. Triggers commission calculation for partners
 *   4. Writes an audit log entry
 *
 * Pin price: ₦850 per pin (both result and fee pins)
 */

const { db }                             = require('../utils/firebase');
const { deductWallet }                   = require('../utils/transactions');
const { writeCommission }                = require('./partners');
const { requireFields, validateQuantity, sanitizeString } = require('../utils/validators');
const { logAudit }                       = require('./audit');

const PIN_PRICE = 850;

/** Generate a random scratch pin: XXXX-XXXXXX-XXXX */
function genPin() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 (ambiguous)
  let pin = '';
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) pin += '-';
    pin += chars[Math.floor(Math.random() * chars.length)];
  }
  return pin;
}

function genId(prefix) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

// ── RESULT PINS ──────────────────────────────────────────────────────────

/**
 * Generate a batch of result scratch pins for a school.
 *
 * Validates session + term exist, deducts wallet atomically,
 * generates pins as a single batch write, then triggers commission.
 */
async function generateResultPins(school, data, userEmail) {
  requireFields(data, ['sessionId', 'termId', 'quantity']);

  const quantity  = validateQuantity(data.quantity, 1, 500);
  const totalCost = quantity * PIN_PRICE;

  // Verify session and term belong to this school
  const [sessSnap, termSnap] = await Promise.all([
    db.ref(`sessions/${school.id}/${data.sessionId}`).once('value'),
    db.ref(`terms/${school.id}/${data.termId}`).once('value'),
  ]);
  if (!sessSnap.exists()) throw new Error('Selected session not found. Please refresh and try again.');
  if (!termSnap.exists()) throw new Error('Selected term not found. Please refresh and try again.');

  const sessName = sessSnap.val().name || data.sessionId;
  const termName = termSnap.val().name || data.termId;

  // Atomically deduct — throws if insufficient balance
  const newBalance = await deductWallet(
    school.id,
    totalCost,
    `${quantity} result pins · ${sessName} ${termName}`
  );

  // Build pin batch (single multi-path update is faster than individual sets)
  const pinsUpdate = {};
  const generatedPins = [];
  const now = Date.now();

  for (let i = 0; i < quantity; i++) {
    const id = genId('PIN');
    const code = genPin();
    pinsUpdate[id] = {
      pin:       code,
      schoolId:  school.id,
      sessionId: data.sessionId,
      termId:    data.termId,
      used:      false,
      usedBy:    null,
      usedAt:    null,
      type:      'result',
      createdAt: now,
    };
    generatedPins.push({ id, pin: code, used: false, type: 'result', createdAt: now });
  }

  await db.ref(`pins/${school.id}`).update(pinsUpdate);

  // Write commission asynchronously — failure should not roll back pins
  writeCommission(school, quantity, 'result').catch(e =>
    console.error(`[Pins] Commission write failed for school ${school.id}:`, e.message)
  );

  await logAudit(
    school.id,
    'Result pins generated',
    `${quantity} pins · ₦${totalCost.toLocaleString()} deducted · ${sessName} ${termName}`,
    userEmail
  );

  return {
    success:        true,
    pinsGenerated:  quantity,
    generated:       quantity,
    pins:           generatedPins,
    totalCost,
    newBalance,
    session:        sessName,
    term:           termName,
    message:        `${quantity} result pins generated successfully. ₦${totalCost.toLocaleString()} deducted from wallet.`,
  };
}

// ── FEE PINS ──────────────────────────────────────────────────────────

/**
 * Generate a single fee payment pin for a specific student.
 *
 * Validates student enrollment, deducts one pin cost (₦850) from wallet,
 * creates the fee pin record, triggers commission.
 */
async function generateFeePins(school, data, userEmail) {
  requireFields(data, ['studentId', 'sessionId', 'amount']);

  const feeAmount = parseInt(data.amount, 10);
  if (isNaN(feeAmount) || feeAmount < 1) {
    throw new Error('Fee amount must be a positive number.');
  }

  // Verify student is enrolled in this school
  const enrollSnap = await db.ref(`studentEnrollments/${data.studentId}/${school.id}`).once('value');
  if (!enrollSnap.exists()) {
    throw new Error('Student is not enrolled in your school. Please check the Student ID.');
  }

  const enroll = enrollSnap.val();
  if (enroll.status === 'alumni') {
    throw new Error('This student is marked as an alumni and cannot receive fee pins.');
  }

  // Load student name
  const studentSnap = await db.ref(`students/${data.studentId}`).once('value');
  const student     = studentSnap.exists() ? studentSnap.val() : {};
  const studentName = student.name || data.studentId;

  // Verify session belongs to school
  const sessSnap = await db.ref(`sessions/${school.id}/${data.sessionId}`).once('value');
  if (!sessSnap.exists()) throw new Error('Selected session not found.');
  const sessName = sessSnap.val().name || data.sessionId;

  // Atomically deduct one pin cost
  const newBalance = await deductWallet(
    school.id,
    PIN_PRICE,
    `Fee pin · ${studentName} · ${sessName}`
  );

  const pin = genPin();
  const id  = genId('FPAY');
  const now = Date.now();

  await db.ref(`feePins/${school.id}/${id}`).set({
    pin,
    amount:      feeAmount,
    studentId:   data.studentId,
    studentName,
    sessionId:   data.sessionId,
    schoolId:    school.id,
    type:        'fee',
    note:        data.note ? String(data.note).trim().substring(0, 200) : '',
    used:        false,
    usedAt:      null,
    createdAt:   now,
  });

  writeCommission(school, 1, 'fee').catch(e =>
    console.error(`[Pins] Fee pin commission failed for school ${school.id}:`, e.message)
  );

  await logAudit(
    school.id,
    'Fee pin generated',
    `${studentName} · ₦${feeAmount.toLocaleString()} fee · Pin cost ₦${PIN_PRICE}`,
    userEmail
  );

  return {
    success:     true,
    pin,
    studentName,
    feeAmount,
    pinCost:     PIN_PRICE,
    newBalance,
    session:     sessName,
    message:     `Fee pin generated for ${studentName}. ₦${PIN_PRICE} deducted from wallet.`,
  };
}


// ── PIN HISTORY ─────────────────────────────────────────────────────────

async function listPinHistory(school, data = {}) {
  const type = data.type || 'result';
  const refPath = type === 'fee' ? `feePins/${school.id}` : `pins/${school.id}`;
  const snap = await db.ref(refPath).once('value');

  const pins = [];
  if (snap.exists()) {
    snap.forEach(child => {
      const value = child.val() || {};
      pins.push({ id: child.key, ...value });
    });
  }

  pins.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return {
    success: true,
    pins,
    total: pins.length,
    used: pins.filter(pin => !!pin.used).length,
    unused: pins.filter(pin => !pin.used).length
  };
}

/**
 * Search and filter PIN inventory.
 * Supports filtering by: status (used/unused), date range, student (fee pins only), session, term
 */
async function searchPins(school, data = {}) {
  const type = data.type || 'result';
  const refPath = type === 'fee' ? `feePins/${school.id}` : `pins/${school.id}`;
  const snap = await db.ref(refPath).once('value');

  let pins = [];
  if (snap.exists()) {
    snap.forEach(child => {
      const value = child.val() || {};
      pins.push({ id: child.key, ...value });
    });
  }

  // Filter by status
  if (data.status === 'used') {
    pins = pins.filter(p => !!p.used);
  } else if (data.status === 'unused') {
    pins = pins.filter(p => !p.used);
  }

  // Filter by session (result pins)
  if (data.sessionId && type === 'result') {
    pins = pins.filter(p => p.sessionId === data.sessionId);
  }

  // Filter by term (result pins)
  if (data.termId && type === 'result') {
    pins = pins.filter(p => p.termId === data.termId);
  }

  // Filter by student (fee pins)
  if (data.studentId && type === 'fee') {
    pins = pins.filter(p => p.studentId === data.studentId);
  }

  // Filter by date range
  if (data.startDate && data.endDate) {
    const startTime = new Date(data.startDate).getTime();
    const endTime = new Date(data.endDate).getTime() + 86400000; // Include entire end day
    pins = pins.filter(p => p.createdAt >= startTime && p.createdAt <= endTime);
  }

  // Search by PIN code
  if (data.searchPin) {
    const searchStr = sanitizeString(data.searchPin, 20).toUpperCase();
    pins = pins.filter(p => p.pin && p.pin.includes(searchStr));
  }

  // Sort by creation date, newest first
  pins.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Apply limit if specified
  const limit = data.limit ? Math.min(parseInt(data.limit, 10), 1000) : 100;
  const offset = data.offset ? parseInt(data.offset, 10) : 0;
  const paginated = pins.slice(offset, offset + limit);

  return {
    success: true,
    pins: paginated,
    total: pins.length,
    used: pins.filter(p => !!p.used).length,
    unused: pins.filter(p => !p.used).length,
    limit,
    offset,
  };
}

/**
 * Get PIN statistics for dashboard.
 */
async function getPinStats(school, data = {}) {
  const type = data.type || 'result';
  const refPath = type === 'fee' ? `feePins/${school.id}` : `pins/${school.id}`;
  const snap = await db.ref(refPath).once('value');

  const pins = [];
  if (snap.exists()) {
    snap.forEach(child => {
      pins.push(child.val() || {});
    });
  }

  const total = pins.length;
  const used = pins.filter(p => !!p.used).length;
  const unused = total - used;

  // Calculate generation rate (pins created in last 7 days)
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const lastWeek = pins.filter(p => p.createdAt >= sevenDaysAgo).length;

  return {
    success: true,
    stats: {
      type,
      total,
      used,
      unused,
      usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
      generatedLastWeek: lastWeek,
    }
  };
}

module.exports = { 
  generateResultPins, 
  generateFeePins, 
  listPinHistory,
  searchPins,
  getPinStats,
};
