'use strict';

/**
 * Wallet Service
 *
 * Handles all school wallet operations:
 *   fundWallet      — School admin submits a deposit request
 *   getWallet       — Fetch wallet balance + transaction history
 *   approveDeposit  — Super admin approves and credits wallet (atomic)
 *   rejectDeposit   — Super admin rejects a pending deposit
 */

const { db }                           = require('../utils/firebase');
const { creditWallet }                 = require('../utils/transactions');
const { requireFields, validateAmount } = require('../utils/validators');
const { logAudit, logPlatformAudit }   = require('./audit');

const PIN_PRICE = 850; // ₦850 per pin

// ── SCHOOL ADMIN ─────────────────────────────────────────────────────────────

/**
 * Submit a wallet funding request.
 * The school admin has made a bank transfer and is reporting it here.
 * Balance is NOT credited yet — super admin must approve first.
 */
async function fundWallet(school, data, userEmail) {
  requireFields(data, ['amount']);
  const amount = validateAmount(data.amount);

  // Verify payment details exist (super admin must have configured them)
  const settingsSnap = await db.ref('platformSettings/paymentDetails').once('value');
  if (!settingsSnap.exists()) {
    throw new Error('Payment details are not configured yet. Please contact SchoolCore support.');
  }

  const reqId = `WR${Date.now().toString(36).toUpperCase()}`;

const reference =
  data.reference ||
  `PAY-${school.id}-${Date.now()}`;

  // Save the request
  await db.ref(`walletRequests/${reqId}`).set({
    schoolId:    school.id,
    schoolName:  school.schoolName || '',
    amount,
    reference,
    screenshot:  data.screenshot  || null,
    note:        data.note        || '',
    status:      'pending',
    submittedAt: Date.now(),
    submittedBy: userEmail,
  });

  // Optimistically increase pendingDeposit so the school sees their request is registered
  const walletRef = db.ref(`schoolWallet/${school.id}`);
  await walletRef.transaction(wallet => {
  if (!wallet) {
    wallet = {
      balance: 0,
      totalDeposited: 0,
      totalSpent: 0,
      pendingDeposit: 0,
    };
  }

  return {
    ...wallet,
    pendingDeposit: (wallet.pendingDeposit || 0) + amount,
    lastActivity: Date.now(),
  };
});

  // Record the pending transaction for display in the school's history
  await db.ref(`walletTransactions/${school.id}`).push({
    type:        'pending',
    amount,
    description: `Deposit pending approval · Ref: ${reference}`,
    reference,
    balanceAfter: null,
    timestamp:   Date.now(),
  });

  await logAudit(school.id, 'Wallet funding submitted',
    `₦${amount.toLocaleString()} · Ref: ${reference}`, userEmail);

  return {
    success:   true,
    requestId: reqId,
    reference,
    amount,
    pinsAffordable: Math.floor(amount / PIN_PRICE),
    message:   'Payment request submitted. Your balance will be credited once we confirm your transfer.',
  };
}

/**
 * Retrieve the current wallet balance and recent transactions.
 */
async function getWallet(school) {
  const walletSnap = await db.ref(`schoolWallet/${school.id}`).once('value');
  const wallet = walletSnap.exists()
    ? walletSnap.val()
    : { balance: 0, totalDeposited: 0, totalSpent: 0, pendingDeposit: 0 };

  // Last 30 transactions, newest first
  const txSnap = await db.ref(`walletTransactions/${school.id}`)
    .limitToLast(30).once('value');
  const transactions = [];
  if (txSnap.exists()) txSnap.forEach(c => transactions.unshift({ key: c.key, ...c.val() }));

  // Pending requests
  const reqSnap = await db.ref('walletRequests')
    .orderByChild('schoolId').equalTo(school.id).once('value');
  const requests = [];
  if (reqSnap.exists()) reqSnap.forEach(c => requests.push({ key: c.key, ...c.val() }));

  return {
    success: true,
    wallet,
    transactions,
    pendingRequests: requests.filter(r => r.status === 'pending'),
    pinPrice: PIN_PRICE,
  };
}

// ── SUPER ADMIN ───────────────────────────────────────────────────────────────

/**
 * Approve a deposit request.
 * Credits the school wallet atomically using a Firebase Transaction.
 * Marks the request as approved with timestamp and admin email.
 */
async function approveDeposit(data, adminEmail) {
  requireFields(data, ['requestId']);

  const reqSnap = await db.ref(`walletRequests/${data.requestId}`).once('value');
  if (!reqSnap.exists()) throw new Error('Wallet request not found.');

  const req = reqSnap.val();
  if (req.status !== 'pending') {
    throw new Error(`This request has already been ${req.status}. No action taken.`);
  }

  // Credit wallet — atomic, safe for concurrent calls
  const newBalance = await creditWallet(
    req.schoolId,
    req.amount,
    `Deposit approved · Ref: ${req.reference}`,
    req.reference
  );

  // Mark request as approved
  await db.ref(`walletRequests/${data.requestId}`).update({
    status:     'approved',
    approvedAt: Date.now(),
    approvedBy: adminEmail,
  });

  await logPlatformAudit('wallet_approved', {
    schoolId:    req.schoolId,
    schoolName:  req.schoolName,
    amount:      req.amount,
    reference:   req.reference,
    approvedBy:  adminEmail,
    newBalance,
  });

  return {
    success:    true,
    schoolId:   req.schoolId,
    schoolName: req.schoolName,
    amount:     req.amount,
    newBalance,
    message:    `₦${req.amount.toLocaleString()} credited to ${req.schoolName || req.schoolId} wallet.`,
  };
}

/**
 * Reject a deposit request.
 * Reduces the school's pendingDeposit and records the rejection reason.
 */
async function rejectDeposit(data, adminEmail) {
  requireFields(data, ['requestId']);

  const reqSnap = await db.ref(`walletRequests/${data.requestId}`).once('value');
  if (!reqSnap.exists()) throw new Error('Wallet request not found.');

  const req = reqSnap.val();
  if (req.status !== 'pending') {
    throw new Error(`This request has already been ${req.status}. No action taken.`);
  }

  const reason = data.reason
    ? String(data.reason).trim().substring(0, 500)
    : 'Request rejected by SchoolCore admin.';

  // Reduce pendingDeposit
  const walletRef = db.ref(`schoolWallet/${req.schoolId}`);
  let currentBalance = 0;
  await walletRef.transaction(wallet => {
    if (!wallet) return wallet;
    currentBalance = wallet.balance || 0;
    return { ...wallet, pendingDeposit: Math.max(0, (wallet.pendingDeposit || 0) - req.amount) };
  });

  // Record rejection in school's transaction history
  await db.ref(`walletTransactions/${req.schoolId}`).push({
    type:        'rejected',
    amount:      req.amount,
    description: `Deposit rejected · ${reason}`,
    balanceAfter: currentBalance,
    timestamp:   Date.now(),
  });

  // Mark request as rejected
  await db.ref(`walletRequests/${data.requestId}`).update({
    status:          'rejected',
    rejectedAt:      Date.now(),
    rejectedBy:      adminEmail,
    rejectionReason: reason,
  });

  await logPlatformAudit('wallet_rejected', {
    schoolId:   req.schoolId,
    schoolName: req.schoolName,
    amount:     req.amount,
    reason,
    rejectedBy: adminEmail,
  });

  return {
    success: true,
    message: `Deposit request from ${req.schoolName || req.schoolId} has been rejected.`,
  };
}

module.exports = { fundWallet, getWallet, approveDeposit, rejectDeposit };


