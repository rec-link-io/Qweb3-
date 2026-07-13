'use strict';

/**
 * Students Service
 *
 * Handles student management for SchoolCore.
 *
 * Part 1:
 *   • createStudent()
 *
 * Future Parts:
 *   • updateStudent()
 *   • transferStudent()
 *   • promoteStudent()
 *   • markAlumni()
 *   • reactivateStudent()
 *   • deleteStudent()
 */

const { db } = require('../utils/firebase');
const {
    requireFields,
    sanitizeString,
    validateEmail
} = require('../utils/validators');

const { logAudit } = require('./audit');

/* ==========================================================
   Helpers
========================================================== */

function generateStudentId(schoolId) {
    return `${schoolId}-STD-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeGender(gender) {
    const g = String(gender || '').trim().toLowerCase();

    if (g === 'male') return 'Male';
    if (g === 'female') return 'Female';

    throw new Error('Gender must be Male or Female.');
}

/* ==========================================================
   CREATE STUDENT
========================================================== */

async function createStudent(school, data, userEmail) {

    requireFields(data, ['classId']);

    if (!data.firstName && !data.lastName && !data.name) {
        throw new Error('Student name is required.');
    }

    const nameParts = String(data.name || '').trim().split(/\s+/).filter(Boolean);

    const firstName = sanitizeString(
        data.firstName || nameParts[0] || '',
        80
    );

    const lastName = sanitizeString(
        data.lastName || nameParts.slice(1).join(' ') || firstName,
        80
    );

    const middleName = sanitizeString(
        data.middleName || '',
        80
    );

    const admissionNumber = sanitizeString(
        data.admissionNumber || generateStudentId(school.id),
        60
    );

    const gender = normalizeGender(data.gender || 'Male');

    /* ----------------------------------
       Verify Class
    ----------------------------------- */

    const classSnap = await db
        .ref(`classes/${school.id}/${data.classId}`)
        .once('value');

    if (!classSnap.exists()) {
        throw new Error('Selected class does not exist.');
    }

    /* ----------------------------------
       Verify Arm
    ----------------------------------- */

    const armSnap = await db
        .ref(`arms/${school.id}/${data.armId}`)
        .once('value');

    if (data.armId) {
        if (!armSnap.exists()) {
            throw new Error('Selected arm does not exist.');
        }
    }

    /* ----------------------------------
       Ensure Admission Number
       is unique within school
    ----------------------------------- */

    const enrollmentSnap = await db
        .ref('studentEnrollments')
        .once('value');

    if (enrollmentSnap.exists()) {

        let duplicate = false;

        enrollmentSnap.forEach(student => {

            const schoolNode =
                student.child(school.id);

            if (schoolNode.exists()) {

                const e = schoolNode.val();

                if (
                    String(e.admissionNumber).toLowerCase()
                    ===
                    admissionNumber.toLowerCase()
                ) {
                    duplicate = true;
                }

            }

        });

        if (duplicate) {
            throw new Error(
                'Admission number already exists.'
            );
        }

    }

    /* ----------------------------------
       Student Record
    ----------------------------------- */

    const studentId = generateStudentId(
        school.id
    );

    const now = Date.now();

    const student = {

        studentId,

        firstName,

        middleName,

        lastName,

        name:
            `${firstName} ${middleName} ${lastName}`
            .replace(/\s+/g, ' ')
            .trim(),

        gender,

        dateOfBirth:
            sanitizeString(data.dateOfBirth || '', 30),

        phone:
            sanitizeString(data.phone || '', 30),

        email:
            data.email
                ? validateEmail(data.email)
                : '',

        address:
            sanitizeString(data.address || '', 300),

        guardianName:
            sanitizeString(
                data.guardianName || data.parentName || '',
                120
            ),

        guardianPhone:
            sanitizeString(
                data.guardianPhone || data.parentPhone || '',
                40
            ),

        parentName:
            sanitizeString(data.parentName || data.guardianName || '', 120),

        parentPhone:
            sanitizeString(data.parentPhone || data.guardianPhone || '', 40),

        parentEmail:
            data.parentEmail ? validateEmail(data.parentEmail) : '',

        photoUrl:
            sanitizeString(data.photoUrl || '', 500),

        studentPassword:
            sanitizeString(data.password || studentId.slice(-4), 80),

        createdAt: now,

        createdBy: userEmail
    };

    const enrollment = {

        schoolId: school.id,

        admissionNumber,

        classId: data.classId,

        armId: data.armId || '',

        status: 'active',

        admittedAt: now
    };

    const updates = {};

    updates[`students/${studentId}`] =
        student;

    updates[
        `studentEnrollments/${studentId}/${school.id}`
    ] = enrollment;

    await db.ref().update(updates);

    await logAudit(

        school.id,

        'Student created',

        `${student.name} (${admissionNumber})`,

        userEmail

    );

    return {

        success: true,

        studentId,

        studentName: student.name,

        admissionNumber,

        classId: data.classId,

        armId: data.armId || '',

        password: student.studentPassword,

        message:
            'Student created successfully.'

    };

}
/* ==========================================================
   UPDATE STUDENT
========================================================== */

async function updateStudent(school, data, userEmail) {

    requireFields(data, ['studentId']);

    const studentId = sanitizeString(data.studentId, 80);

    /* ----------------------------------
       Verify Student Exists
    ----------------------------------- */

    const studentSnap = await db
        .ref(`students/${studentId}`)
        .once('value');

    if (!studentSnap.exists()) {
        throw new Error('Student not found.');
    }

    /* ----------------------------------
       Verify Student belongs
       to this School
    ----------------------------------- */

    const enrollRef = db.ref(
        `studentEnrollments/${studentId}/${school.id}`
    );

    const enrollSnap = await enrollRef.once('value');

    if (!enrollSnap.exists()) {
        throw new Error(
            'Student is not enrolled in your school.'
        );
    }

    const enrollment = enrollSnap.val();

    /* ----------------------------------
       Validate Class (optional)
    ----------------------------------- */

    if (data.classId) {

        const classSnap = await db
            .ref(`classes/${school.id}/${data.classId}`)
            .once('value');

        if (!classSnap.exists()) {
            throw new Error(
                'Selected class does not exist.'
            );
        }

    }

    /* ----------------------------------
       Validate Arm (optional)
    ----------------------------------- */

    if (data.armId) {

        const armSnap = await db
            .ref(`arms/${school.id}/${data.armId}`)
            .once('value');

        if (!armSnap.exists()) {
            throw new Error(
                'Selected arm does not exist.'
            );
        }

    }

    /* ----------------------------------
       Validate Admission Number
       (if changed)
    ----------------------------------- */

    let admissionNumber =
        enrollment.admissionNumber;

    if (
        data.admissionNumber &&
        data.admissionNumber !==
        enrollment.admissionNumber
    ) {

        const allSnap = await db
            .ref('studentEnrollments')
            .once('value');

        let duplicate = false;

        allSnap.forEach(stu => {

            if (stu.key === studentId) return;

            const schoolNode =
                stu.child(school.id);

            if (schoolNode.exists()) {

                const value =
                    schoolNode.val();

                if (
                    String(
                        value.admissionNumber
                    ).toLowerCase()
                    ===
                    String(
                        data.admissionNumber
                    ).toLowerCase()
                ) {

                    duplicate = true;

                }

            }

        });

        if (duplicate) {
            throw new Error(
                'Admission number already exists.'
            );
        }

        admissionNumber = sanitizeString(
            data.admissionNumber,
            60
        );

    }

    /* ----------------------------------
       Student Update
    ----------------------------------- */

    const student =
        studentSnap.val();

    const firstName =
        data.firstName !== undefined
            ? sanitizeString(
                data.firstName,
                80
            )
            : student.firstName;

    const middleName =
        data.middleName !== undefined
            ? sanitizeString(
                data.middleName,
                80
            )
            : student.middleName;

    const lastName =
        data.lastName !== undefined
            ? sanitizeString(
                data.lastName,
                80
            )
            : student.lastName;

    const updates = {};

    updates[
        `students/${studentId}/firstName`
    ] = firstName;

    updates[
        `students/${studentId}/middleName`
    ] = middleName;

    updates[
        `students/${studentId}/lastName`
    ] = lastName;

    updates[
        `students/${studentId}/name`
    ] =
        `${firstName} ${middleName} ${lastName}`
            .replace(/\s+/g, ' ')
            .trim();

    if (data.gender !== undefined) {

        updates[
            `students/${studentId}/gender`
        ] =
            normalizeGender(
                data.gender
            );

    }

    if (data.dateOfBirth !== undefined) {

        updates[
            `students/${studentId}/dateOfBirth`
        ] =
            sanitizeString(
                data.dateOfBirth,
                30
            );

    }

    if (data.phone !== undefined) {

        updates[
            `students/${studentId}/phone`
        ] =
            sanitizeString(
                data.phone,
                30
            );

    }

    if (data.email !== undefined) {

        updates[
            `students/${studentId}/email`
        ] =
            data.email
                ? validateEmail(
                    data.email
                )
                : '';

    }

    if (data.address !== undefined) {

        updates[
            `students/${studentId}/address`
        ] =
            sanitizeString(
                data.address,
                300
            );

    }

    if (data.guardianName !== undefined) {

        updates[
            `students/${studentId}/guardianName`
        ] =
            sanitizeString(
                data.guardianName,
                120
            );

    }

    if (data.guardianPhone !== undefined) {

        updates[
            `students/${studentId}/guardianPhone`
        ] =
            sanitizeString(
                data.guardianPhone,
                40
            );

    }

    if (data.classId !== undefined) {

        updates[
            `studentEnrollments/${studentId}/${school.id}/classId`
        ] = data.classId;

    }

    if (data.armId !== undefined) {

        updates[
            `studentEnrollments/${studentId}/${school.id}/armId`
        ] = data.armId;

    }

    if (data.admissionNumber !== undefined) {

        updates[
            `studentEnrollments/${studentId}/${school.id}/admissionNumber`
        ] = admissionNumber;

    }

    updates[
        `students/${studentId}/updatedAt`
    ] = Date.now();

    updates[
        `students/${studentId}/updatedBy`
    ] = userEmail;

    await db.ref().update(updates);

    await logAudit(

        school.id,

        'Student updated',

        `${updates[`students/${studentId}/name`]} (${admissionNumber})`,

        userEmail

    );

    return {

        success: true,

        studentId,

        studentName:
            updates[
                `students/${studentId}/name`
            ],

        admissionNumber,

        message:
            'Student updated successfully.'

    };

}

/* ==========================================================
   TRANSFER STUDENT (Part 2B-1)
========================================================== */

async function transferStudent(school, data, userEmail) {

    requireFields(data, [
        'studentId',
        'classId',
        'armId'
    ]);

    const studentId = sanitizeString(data.studentId, 80);

    /* ----------------------------------
       Verify Student Exists
    ----------------------------------- */

    const studentSnap = await db
        .ref(`students/${studentId}`)
        .once('value');

    if (!studentSnap.exists()) {
        throw new Error('Student not found.');
    }

    const student = studentSnap.val();

    /* ----------------------------------
       Verify Student belongs
       to this school
    ----------------------------------- */

    const enrollRef = db.ref(
        `studentEnrollments/${studentId}/${school.id}`
    );

    const enrollSnap = await enrollRef.once('value');

    if (!enrollSnap.exists()) {
        throw new Error(
            'Student is not enrolled in your school.'
        );
    }

    const enrollment = enrollSnap.val();

    if (enrollment.status !== 'active') {
        throw new Error(
            'Only active students can be transferred.'
        );
    }

    /* ----------------------------------
       Verify destination Class
    ----------------------------------- */

    const classSnap = await db
        .ref(`classes/${school.id}/${data.classId}`)
        .once('value');

    if (!classSnap.exists()) {
        throw new Error(
            'Destination class does not exist.'
        );
    }

    /* ----------------------------------
       Verify destination Arm
    ----------------------------------- */

    const armSnap = await db
        .ref(`arms/${school.id}/${data.armId}`)
        .once('value');

    if (!armSnap.exists()) {
        throw new Error(
            'Destination arm does not exist.'
        );
    }

    /* ----------------------------------
       Prevent unnecessary transfer
    ----------------------------------- */

    if (
        enrollment.classId === data.classId &&
        enrollment.armId === data.armId
    ) {
        throw new Error(
            'Student is already assigned to this class and arm.'
        );
    }

    /* ----------------------------------
       Load names for audit/history
    ----------------------------------- */

    const oldClassSnap = await db
        .ref(`classes/${school.id}/${enrollment.classId}`)
        .once('value');

    const oldArmSnap = await db
        .ref(`arms/${school.id}/${enrollment.armId}`)
        .once('value');

    const oldClassName =
        oldClassSnap.exists()
            ? oldClassSnap.val().name
            : enrollment.classId;

    const oldArmName =
        oldArmSnap.exists()
            ? oldArmSnap.val().name
            : enrollment.armId;

    const newClassName =
        classSnap.val().name || data.classId;

    const newArmName =
        armSnap.val().name || data.armId;

    /* ----------------------------------
       Prepare Updates
    ----------------------------------- */

    const now = Date.now();

    const updates = {};

    updates[
        `studentEnrollments/${studentId}/${school.id}/classId`
    ] = data.classId;

    updates[
        `studentEnrollments/${studentId}/${school.id}/armId`
    ] = data.armId;

    updates[
        `studentEnrollments/${studentId}/${school.id}/transferredAt`
    ] = now;

    updates[
        `studentEnrollments/${studentId}/${school.id}/transferredBy`
    ] = userEmail;

    if (data.reason) {

        updates[
            `studentEnrollments/${studentId}/${school.id}/transferReason`
        ] = sanitizeString(
            data.reason,
            200
        );

    }


    /* ----------------------------------
       Transfer History
    ----------------------------------- */

    const historyId =
        `TR${now.toString(36).toUpperCase()}`;

    updates[
        `studentTransferHistory/${studentId}/${historyId}`
    ] = {

        schoolId: school.id,

        studentId,

        studentName: student.name,

        fromClassId: enrollment.classId,

        fromArmId: enrollment.armId,

        toClassId: data.classId,

        toArmId: data.armId,

        fromClassName: oldClassName,

        fromArmName: oldArmName,

        toClassName: newClassName,

        toArmName: newArmName,

        transferredBy: userEmail,

        transferredAt: now,

        reason: data.reason
            ? sanitizeString(data.reason, 200)
            : ''

    };

    /* ----------------------------------
       Commit Updates
    ----------------------------------- */

    await db.ref().update(updates);

    /* ----------------------------------
       Audit Log
    ----------------------------------- */

    await logAudit(

        school.id,

        'Student transferred',

        `${student.name} : ${oldClassName} ${oldArmName} → ${newClassName} ${newArmName}`,

        userEmail

    );

    /* ----------------------------------
       Response
    ----------------------------------- */

    return {

        success: true,

        studentId,

        studentName: student.name,

        previousClass: oldClassName,

        previousArm: oldArmName,

        currentClass: newClassName,

        currentArm: newArmName,

        transferredAt: now,

        message:
            `${student.name} transferred successfully.`

    };
}
/* ==========================================================
   MARK STUDENT AS ALUMNI
========================================================== */

async function markAlumni(school, data, userEmail) {

    requireFields(data, ['studentId']);

    const studentId = sanitizeString(data.studentId, 80);

    /* ----------------------------------
       Verify Student Exists
    ----------------------------------- */

    const studentSnap = await db
        .ref(`students/${studentId}`)
        .once('value');

    if (!studentSnap.exists()) {
        throw new Error('Student not found.');
    }

    const student = studentSnap.val();

    /* ----------------------------------
       Verify Enrollment
    ----------------------------------- */

    const enrollRef = db.ref(
        `studentEnrollments/${studentId}/${school.id}`
    );

    const enrollSnap = await enrollRef.once('value');

    if (!enrollSnap.exists()) {
        throw new Error(
            'Student is not enrolled in your school.'
        );
    }

    const enrollment = enrollSnap.val();

    if (enrollment.status === 'alumni') {
        throw new Error(
            'Student is already marked as alumni.'
        );
    }

    /* ----------------------------------
       Update Status
    ----------------------------------- */

    const now = Date.now();

    const updates = {};

    updates[
        `studentEnrollments/${studentId}/${school.id}/status`
    ] = 'alumni';

    updates[
        `studentEnrollments/${studentId}/${school.id}/graduatedAt`
    ] = now;

    updates[
        `studentEnrollments/${studentId}/${school.id}/graduatedBy`
    ] = userEmail;

    if (data.reason) {

        updates[
            `studentEnrollments/${studentId}/${school.id}/graduationReason`
        ] = sanitizeString(
            data.reason,
            200
        );

    }

    /* ----------------------------------
       Alumni Record
    ----------------------------------- */

    updates[
        `alumni/${school.id}/${studentId}`
    ] = {

        studentId,

        studentName: student.name,

        admissionNumber:
            enrollment.admissionNumber,

        classId:
            enrollment.classId,

        armId:
            enrollment.armId,

        graduatedAt: now,

        graduatedBy: userEmail,

        reason:
            data.reason
                ? sanitizeString(
                    data.reason,
                    200
                )
                : ''

    };

    /* ----------------------------------
       Commit
    ----------------------------------- */

    await db.ref().update(updates);

    /* ----------------------------------
       Audit Log
    ----------------------------------- */

    await logAudit(

        school.id,

        'Student marked as alumni',

        `${student.name}`,

        userEmail

    );

    /* ----------------------------------
       Response
    ----------------------------------- */

    return {

        success: true,

        studentId,

        studentName: student.name,

        status: 'alumni',

        graduatedAt: now,

        message:
            `${student.name} has been moved to the alumni list.`

    };

}

/* ==========================================================
   REACTIVATE STUDENT
========================================================== */

async function reactivateStudent(school, data, userEmail) {

    requireFields(data, ['studentId']);

    const studentId = sanitizeString(data.studentId, 80);

    /* ----------------------------------
       Verify Student Exists
    ----------------------------------- */

    const studentSnap = await db
        .ref(`students/${studentId}`)
        .once('value');

    if (!studentSnap.exists()) {
        throw new Error('Student not found.');
    }

    const student = studentSnap.val();

    /* ----------------------------------
       Verify Enrollment
    ----------------------------------- */

    const enrollRef = db.ref(
        `studentEnrollments/${studentId}/${school.id}`
    );

    const enrollSnap = await enrollRef.once('value');

    if (!enrollSnap.exists()) {
        throw new Error(
            'Student is not enrolled in your school.'
        );
    }

    const enrollment = enrollSnap.val();

    if (enrollment.status !== 'alumni') {
        throw new Error(
            'Only alumni students can be reactivated.'
        );
    }

    /* ----------------------------------
       Verify Class
    ----------------------------------- */

    if (!data.classId) {
        throw new Error(
            'Please select the class to reactivate the student into.'
        );
    }

    const classSnap = await db
        .ref(`classes/${school.id}/${data.classId}`)
        .once('value');

    if (!classSnap.exists()) {
        throw new Error(
            'Selected class does not exist.'
        );
    }

    /* ----------------------------------
       Verify Arm
    ----------------------------------- */

    if (!data.armId) {
        throw new Error(
            'Please select the arm to reactivate the student into.'
        );
    }

    const armSnap = await db
        .ref(`arms/${school.id}/${data.armId}`)
        .once('value');

    if (!armSnap.exists()) {
        throw new Error(
            'Selected arm does not exist.'
        );
    }

    const now = Date.now();

    /* ----------------------------------
       Updates
    ----------------------------------- */

    const updates = {};

    updates[
        `studentEnrollments/${studentId}/${school.id}/status`
    ] = 'active';

    updates[
        `studentEnrollments/${studentId}/${school.id}/classId`
    ] = data.classId;

    updates[
        `studentEnrollments/${studentId}/${school.id}/armId`
    ] = data.armId;

    updates[
        `studentEnrollments/${studentId}/${school.id}/reactivatedAt`
    ] = now;

    updates[
        `studentEnrollments/${studentId}/${school.id}/reactivatedBy`
    ] = userEmail;

    updates[
        `studentEnrollments/${studentId}/${school.id}/graduatedAt`
    ] = null;

    updates[
        `studentEnrollments/${studentId}/${school.id}/graduatedBy`
    ] = null;

    updates[
        `studentEnrollments/${studentId}/${school.id}/graduationReason`
    ] = null;

    /* ----------------------------------
       Remove Alumni Record
    ----------------------------------- */

    updates[
        `alumni/${school.id}/${studentId}`
    ] = null;

    /* ----------------------------------
       Commit Updates
    ----------------------------------- */

    await db.ref().update(updates);

    /* ----------------------------------
       Audit
    ----------------------------------- */

    await logAudit(

        school.id,

        'Student reactivated',

        `${student.name} reactivated into ${classSnap.val().name} ${armSnap.val().name}`,

        userEmail

    );

    /* ----------------------------------
       Response
    ----------------------------------- */

    return {

        success: true,

        studentId,

        studentName: student.name,

        classId: data.classId,

        armId: data.armId || '',

        status: 'active',

        reactivatedAt: now,

        message:
            `${student.name} has been reactivated successfully.`

    };

}


/* ==========================================================
   RESET STUDENT PASSWORD
========================================================== */

async function resetStudentPassword(school, data, userEmail) {
    requireFields(data, ['studentId']);

    const studentId = sanitizeString(data.studentId, 80);
    const enrollSnap = await db.ref(`studentEnrollments/${studentId}/${school.id}`).once('value');

    if (!enrollSnap.exists()) {
        throw new Error('Student is not enrolled in your school.');
    }

    const password = sanitizeString(
        data.password || Math.random().toString(36).slice(2, 10).toUpperCase(),
        80
    );

    await db.ref(`students/${studentId}`).update({
        studentPassword: password,
        passwordUpdatedAt: Date.now(),
        passwordUpdatedBy: userEmail
    });

    await logAudit(school.id, 'Student password reset', studentId, userEmail);

    return {
        success: true,
        studentId,
        password,
        message: 'Student password reset successfully.'
    };
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
    createStudent,
    updateStudent,
    transferStudent,
    markAlumni,
    reactivateStudent,
    resetStudentPassword
};