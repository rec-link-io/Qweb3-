'use strict';

/**
 * Awards Service
 *
 * Handles:
 *   • Create awards
 *   • Get awards
 *   • Delete awards
 */

const { db } = require('../utils/firebase');
const {
  requireFields,
  sanitizeString
} = require('../utils/validators');

const { logAudit } = require('./audit');

/**
 * Create Award
 */
async function createAward(
  school,
  data,
  userEmail
) {

  requireFields(data, [
    'studentId',
    'title'
  ]);

  // Fetch student (if available)

  let studentName = '';

  const studentSnap = await db
    .ref(`students/${school.id}/${data.studentId}`)
    .once('value');

  if (studentSnap.exists()) {
    studentName =
      studentSnap.val().name || '';
  }

  const awardId =
    `AWD${Date.now()
      .toString(36)
      .toUpperCase()}`;

  const award = {

    id: awardId,

    schoolId: school.id,

    studentId: data.studentId,

    studentName,

    sessionId:
      sanitizeString(
        data.sessionId || '',
        50
      ),

    termId:
      sanitizeString(
        data.termId || '',
        50
      ),

    title:
      sanitizeString(
        data.title,
        120
      ),

    category:
      sanitizeString(
        data.category || 'General',
        60
      ),

    awardedAt: Date.now(),

    createdBy: userEmail,

    createdAt: Date.now()

  };

  await db
    .ref(
      `awards/${school.id}/${awardId}`
    )
    .set(award);

  await logAudit(
    school.id,
    'Award created',
    `${studentName} — ${award.title}`,
    userEmail
  );  return {

    success: true,

    awardId,

    award,

    message:
      'Award created successfully.'

  };

}

/**
 * Get Awards
 */
async function getAwards(
  school
) {

  const snap = await db
    .ref(`awards/${school.id}`)
    .once('value');

  const awards = [];

  if (snap.exists()) {

    snap.forEach(child => {

      awards.unshift({

        id: child.key,

        ...child.val()

      });

    });

  }

  return {

    success: true,

    awards

  };

}

/**
 * Delete Award
 */
async function deleteAward(
  school,
  data,
  userEmail
) {

  requireFields(data, [
    'awardId'
  ]);

  const ref = db.ref(
    `awards/${school.id}/${data.awardId}`
  );

  const snap = await ref.once('value');

  if (!snap.exists()) {
    throw new Error(
      'Award not found.'
    );
  }

  const award = snap.val();

  await ref.remove();

  await logAudit(
    school.id,
    'Award deleted',
    `${award.studentName || ''} — ${award.title}`,
    userEmail
  );  return {

    success: true,

    message:
      'Award deleted successfully.'

  };

}

// ────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────

module.exports = {

  createAward,

  getAwards,

  deleteAward

};