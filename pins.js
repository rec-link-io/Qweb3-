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
const { requireFields, validateQuantity } = require('../utils/validators');
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

// ── RESULT PINS ──────────────────────────────────────────────────────────────

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

console.log("========== RESULT PIN PURCHASE ==========");
console.log("school.id =", school.id);
console.log("totalCost =", totalCost);
console.log("quantity =", quantity);
console.log("session =", data.sessionId);
console.log("term =", data.termId);
  // Atomically deduct — throws if insufficient balance
  const newBalance = await deductWallet(
    school.id,
    totalCost,
    `${quantity} result pins · ${sessName} ${termName}`
  );

  // Build pin batch (single multi-path update is faster than individual sets)
  const pinsUpdate = {};
  const now = Date.now();

  for (let i = 0; i < quantity; i++) {
    const id = genId('PIN');
    pinsUpdate[id] = {
      pin:       genPin(),
      schoolId:  school.id,
      sessionId: data.sessionId,
      termId:    data.termId,
      used:      false,
      usedBy:    null,
      type:      'result',
      createdAt: now,
    };
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
    totalCost,
    newBalance,
    session:        sessName,
    term:           termName,
    message:        `${quantity} result pins generated successfully. ₦${totalCost.toLocaleString()} deducted from wallet.`,
  };
}

// ── FEE PINS ─────────────────────────────────────────────────────────────────

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

module.exports = { generateResultPins, generateFeePins };
