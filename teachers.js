'use strict';

/**
 * Teachers Service
 *
 * Handles all teacher management for SchoolCore.
 *
 * Functions:
 *   createTeacher()
 *   updateTeacher()
 *   deleteTeacher()
 */

const { db } = require('../utils/firebase');
const {
  requireFields,
  sanitizeString,
  validateEmail
} = require('../utils/validators');
const { logAudit } = require('./audit');

// ─────────────────────────────────────────────────────────────
// CREATE TEACHER
// ─────────────────────────────────────────────────────────────

async function createTeacher(school, data, userEmail) {
  requireFields(data, [
    'fullName',
    'email'
  ]);
  
  const fullName = sanitizeString(data.fullName, 120);
  const email = validateEmail(data.email);
  
  // Prevent duplicate email in same school
  const teacherSnap = await db
    .ref(`teachers/${school.id}`)
    .orderByChild('email')
    .equalTo(email)
    .once('value');
  
  if (teacherSnap.exists()) {
    throw new Error('A teacher with this email already exists.');
  }
  
  const teacherId = `TCH${Date.now().toString(36).toUpperCase()}`;
  
  const teacher = {
    teacherId,
    schoolId: school.id,
    
    fullName,
    email,
    
    phone: sanitizeString(data.phone || '', 30),
    
    gender: sanitizeString(data.gender || '', 20),
    
    qualification: sanitizeString(
      data.qualification || '',
      100
    ),
    
    specialization: sanitizeString(
      data.specialization || '',
      100
    ),
    
    address: sanitizeString(
      data.address || '',
      250
    ),
    
    classTeacherOf: data.classTeacherOf || null,
    
    assignedSubjects: Array.isArray(data.assignedSubjects) ?
      data.assignedSubjects :
      [],
    
    status: 'active',
    
    createdBy: userEmail,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  await db
    .ref(`teachers/${school.id}/${teacherId}`)
    .set(teacher);
  
  await logAudit(
    school.id,
    'Teacher created',
    fullName,
    userEmail
  );
  
  return {
    success: true,
    teacherId,
    message: `${fullName} created successfully.`
  };
}

// ─────────────────────────────────────────────────────────────
// UPDATE TEACHER
// ─────────────────────────────────────────────────────────────

async function updateTeacher(school, data, userEmail) {
  
  requireFields(data, ['teacherId']);
  
  const ref = db.ref(
    `teachers/${school.id}/${data.teacherId}`
  );
  
  const snap = await ref.once('value');
  
  if (!snap.exists()) {
    throw new Error('Teacher not found.');
  }
  
  const updates = {};
  
  if (data.fullName !== undefined)
    updates.fullName = sanitizeString(
      data.fullName,
      120
    );
  
if (data.email !== undefined) {
  const email = validateEmail(data.email);

  const emailSnap = await db
    .ref(`teachers/${school.id}`)
    .orderByChild('email')
    .equalTo(email)
    .once('value');

  if (emailSnap.exists()) {
    let duplicate = false;

    emailSnap.forEach(child => {
      if (child.key !== data.teacherId) {
        duplicate = true;
      }
    });

    if (duplicate) {
      throw new Error(
        'Another teacher already uses this email.'
      );
    }
  }

  updates.email = email;
}
  
  if (data.phone !== undefined)
    updates.phone = sanitizeString(
      data.phone,
      30
    );
  
  if (data.gender !== undefined)
    updates.gender = sanitizeString(
      data.gender,
      20
    );
  
  if (data.qualification !== undefined)
    updates.qualification = sanitizeString(
      data.qualification,
      100
    );
  
  if (data.specialization !== undefined)
    updates.specialization = sanitizeString(
      data.specialization,
      100
    );
  
  if (data.address !== undefined)
    updates.address = sanitizeString(
      data.address,
      250
    );
  
  if (data.classTeacherOf !== undefined) {

  if (data.classTeacherOf) {

    const classSnap = await db
      .ref(`classes/${school.id}/${data.classTeacherOf}`)
      .once('value');

    if (!classSnap.exists()) {
      throw new Error(
        'Selected class does not exist.'
      );
    }

    updates.classTeacherOf = data.classTeacherOf;

  } else {

    updates.classTeacherOf = null;

  }

}
  
if (Array.isArray(data.assignedSubjects)) {

  for (const subjectId of data.assignedSubjects) {

    const subjectSnap = await db
      .ref(`subjects/${school.id}/${subjectId}`)
      .once('value');

    if (!subjectSnap.exists()) {
      throw new Error(
        `Subject not found (${subjectId}).`
      );
    }

  }

  updates.assignedSubjects =
    data.assignedSubjects;
}
  
  if (data.status !== undefined)
    updates.status = sanitizeString(
      data.status,
      20
    );
  
  updates.updatedAt = Date.now();
  
  await ref.update(updates);
  
  await logAudit(
    school.id,
    'Teacher updated',
    data.teacherId,
    userEmail
  );
  
  return {
    success: true,
    message: 'Teacher updated successfully.'
  };
}

// ─────────────────────────────────────────────────────────────
// DELETE TEACHER
// ─────────────────────────────────────────────────────────────

async function deleteTeacher(
  school,
  data,
  userEmail
) {
  
  requireFields(data, ['teacherId']);
  
  const ref = db.ref(
    `teachers/${school.id}/${data.teacherId}`
  );
  
  const snap = await ref.once('value');
  
  if (!snap.exists()) {
    throw new Error('Teacher not found.');
  }
  
  const teacher = snap.val();
  
  // Soft delete
  await ref.update({
    status: 'deleted',
    deletedAt: Date.now(),
    deletedBy: userEmail
  });
  
  await logAudit(
    school.id,
    'Teacher deleted',
    teacher.fullName || data.teacherId,
    userEmail
  );
  
  return {
    success: true,
    message: 'Teacher deleted successfully.'
  };
}

// ─────────────────────────────────────────────────────────────

module.exports = {
  createTeacher,
  updateTeacher,
  deleteTeacher
};
