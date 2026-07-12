'use strict';

/**
 * Results Service
 *
 * processResults  — Takes raw scores from teachers, computes totals,
 *                   averages, positions, and saves processed results.
 *
 * publishResults  — Marks processed results as published so students
 *                   can unlock them with scratch pins.
 */

const { db }               = require('../utils/firebase');
const { requireFields }    = require('../utils/validators');
const { logAudit }         = require('./audit');

// ── GRADING HELPER ────────────────────────────────────────────────────────────

const DEFAULT_BANDS = [
  { min: 70, max: 100, grade: 'A', remark: 'Excellent'  },
  { min: 60, max:  69, grade: 'B', remark: 'Very Good'  },
  { min: 50, max:  59, grade: 'C', remark: 'Good'       },
  { min: 45, max:  49, grade: 'D', remark: 'Pass'       },
  { min:  0, max:  44, grade: 'F', remark: 'Fail'       },
];

function getGrade(score, bands = []) {
  const activeBands = (bands && bands.length > 0) ? bands : DEFAULT_BANDS;
  for (const b of activeBands) {
    if (score >= b.min && score <= b.max) return { grade: b.grade, remark: b.remark };
  }
  return { grade: 'F', remark: 'Fail' };
}

// ── PROCESS RESULTS ────────────────────────────────────────────────────────────

async function processResults(school, data, userEmail) {
  requireFields(data, ['sessionId', 'termId', 'classId']);

  const { sessionId, termId, classId } = data;

  // Load grading configuration for this school
  const gradingSnap = await db.ref(`gradingConfig/${school.id}`).once('value');
  const grading     = gradingSnap.exists() ? gradingSnap.val() : {};
  const bands       = grading.bands || [];

  // Load raw results
  const rawSnap = await db.ref(`rawResults/${school.id}`).once('value');
  if (!rawSnap.exists()) {
    return { success: false, error: 'No raw results have been submitted yet.', processed: 0 };
  }

  // Collect all raw result entries
  const allRaw = [];
  rawSnap.forEach(c => allRaw.push({ key: c.key, ...c.val() }));

  // Find students in this class
  const enrollSnap = await db.ref('studentEnrollments').once('value');
  const classStudentIds = [];

  if (enrollSnap.exists()) {
    enrollSnap.forEach(stuNode => {
      const schoolEnroll = stuNode.child(school.id);
      if (schoolEnroll.exists()) {
        const enroll = schoolEnroll.val();
        if (enroll.classId === classId && enroll.status === 'active') {
          classStudentIds.push(stuNode.key);
        }
      }
    });
  }

  if (classStudentIds.length === 0) {
    throw new Error('No active students found in this class for this school.');
  }

  // Load student profiles in parallel
  const studentProfiles = {};
  await Promise.all(classStudentIds.map(async id => {
    const snap = await db.ref(`students/${id}`).once('value');
    if (snap.exists()) studentProfiles[id] = snap.val();
  }));

  // ── Calculate results per student ──
  const results = [];

  for (const stuId of classStudentIds) {
    // Only unprocessed scores for this student
    const stuScores = allRaw.filter(r =>
    r.studentId === stuId &&
    r.classId === classId &&
    r.sessionId === sessionId &&
    r.termId === termId &&
    !r.processed
);
if (stuScores.length === 0) {
    continue;
}
    let totalScore = 0;
    let subjectCount = 0;
    const scoreDetails = {};

    for (const raw of stuScores) {
      const ca   = Math.max(0, parseInt(raw.caScore,   10) || 0);
      const exam = Math.max(0, parseInt(raw.examScore, 10) || 0);
      const sub = Math.min(100, ca + exam);
      const { grade, remark } = getGrade(sub, bands);

       scoreDetails[raw.subjectId] = { ca, exam, total: sub, grade, remark, rawKey: raw.key };
      totalScore += sub;
      subjectCount++;
    }

    const average = subjectCount > 0
      ? Math.round((totalScore / subjectCount) * 10) / 10
      : 0;

    results.push({ stuId, student: studentProfiles[stuId] || {}, totalScore, average, subjectCount, scoreDetails });
  }

  if (results.length === 0) {
    throw new Error('No unprocessed scores found for students in this class. ' +
      'Teachers may not have submitted scores yet, or results were already processed.');
  }

  // ── Assign positions (handle ties) ──
  results.sort((a, b) => b.average - a.average);
  let pos = 1;
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].average < results[i - 1].average) pos = i + 1;
    results[i].position = pos;
  }

  const classSize = results.length;
  const now       = Date.now();

  // ── Batch write: processed results + mark raw as processed ──
  const batchUpdates = {};

  for (const r of results) {
    const { grade: overallGrade, remark: overallRemark } = getGrade(r.average, bands);
    const resultId = `RES${now.toString(36).toUpperCase()}_${r.stuId}`;

    batchUpdates[`processedResults/${school.id}/${resultId}`] = {
      studentId:    r.stuId,
      studentName:  r.student.name || r.stuId,
      schoolId:     school.id,
      classId,
      sessionId,
      termId,
      total:        r.totalScore,
      average:      r.average,
      position:     r.position,
      classSize,
      subjectCount: r.subjectCount,
      overallGrade,
      overallRemark,
      scoreDetails: r.scoreDetails,
      status:       'draft',
      processedAt:  now,
    };

    // Mark each contributing raw score as processed
    for (const detail of Object.values(r.scoreDetails)) {
      batchUpdates[`rawResults/${school.id}/${detail.rawKey}/processed`] = true;
    }
  }

  await db.ref().update(batchUpdates);

  // Load class name for audit
  const classSnap = await db.ref(`classes/${school.id}/${classId}`).once('value');
  const className = classSnap.exists() ? classSnap.val().name : classId;

  await logAudit(
    school.id,
    'Results processed',
    `${results.length} students · ${className}`,
    userEmail
  );

  return {
    success:   true,
    processed: results.length,
    classSize,
    className,
    // Return a preview for the admin to see before publishing
    preview: results.map(r => ({
      studentName:  r.student.name || r.stuId,
      total:        r.totalScore,
      average:      r.average,
      position:     r.position,
      overallGrade: getGrade(r.average, bands).grade,
    })),
    message: `${results.length} student results processed for ${className}.`,
  };
}

// ── PUBLISH RESULTS ────────────────────────────────────────────────────────────

async function publishResults(school, data, userEmail) {
  requireFields(data, ['classId', 'sessionId', 'termId']);

  const { classId, sessionId, termId } = data;

  const snap = await db.ref(`processedResults/${school.id}`).once('value');
  if (!snap.exists()) {
    throw new Error('No processed results found. Run the result processing step first.');
  }

  const batchUpdates = {};
  const now = Date.now();
  let count = 0;

  snap.forEach(c => {
    const v = c.val();
    if (
      v.classId   === classId   &&
      v.sessionId === sessionId &&
      v.termId    === termId    &&
      v.status    === 'draft'
    ) {
      batchUpdates[`processedResults/${school.id}/${c.key}/status`]      = 'published';
      batchUpdates[`processedResults/${school.id}/${c.key}/publishedAt`] = now;
      count++;
    }
  });

  if (count === 0) {
    throw new Error(
      'No draft results found for the selected class, session and term. ' +
      'Results may have already been published, or processing has not been run yet.'
    );
  }

  await db.ref().update(batchUpdates);

  const classSnap = await db.ref(`classes/${school.id}/${classId}`).once('value');
  const className = classSnap.exists() ? classSnap.val().name : classId;

  await logAudit(school.id, 'Results published', `${count} results · ${className}`, userEmail);

  return {
    success:   true,
    published: count,
    className,
    message:   `${count} results published for ${className}. Students can now unlock results with scratch pins.`,
  };
}

module.exports = { processResults, publishResults };
