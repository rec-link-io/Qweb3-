'use strict';

/**
 * Academic Service
 *
 * Handles:
 *   • Academic Sessions
 *   • Terms
 *   • Classes
 *   • Arms
 *   • Subjects
 *   • Academic Context
 *   • Grading Configuration
 */

const { db } = require('../utils/firebase');
const {
    requireFields,
    sanitizeString,
    validateColor
} = require('../utils/validators');

const { logAudit } = require('./audit');


// ────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────

function makeId(prefix) {
    return (
        prefix +
        Date.now().toString(36).toUpperCase() +
        Math.random()
            .toString(36)
            .substring(2, 5)
            .toUpperCase()
    );
}

function normalizeStatus(status) {

    status = String(status || 'active')
        .toLowerCase()
        .trim();

    return status === 'inactive'
        ? 'inactive'
        : 'active';
}


// ────────────────────────────────────────────────
// CREATE SESSION
// ────────────────────────────────────────────────

async function createSession(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'name'
    ]);

    const name = sanitizeString(
        data.name,
        80
    );

    // Prevent duplicate session name

    const existing =
        await db
            .ref(`sessions/${school.id}`)
            .orderByChild('name')
            .equalTo(name)
            .once('value');

    if (existing.exists()) {
        throw new Error(
            'A session with this name already exists.'
        );
    }

    const sessionId = makeId('SES');

    const session = {

        id: sessionId,

        schoolId: school.id,

        name,

        status: normalizeStatus(
            data.status
        ),

        createdAt: Date.now(),

        createdBy: userEmail
    };

    await db
        .ref(
            `sessions/${school.id}/${sessionId}`
        )
        .set(session);

    await logAudit(
        school.id,
        'Academic session created',
        name,
        userEmail
    );

    return {

        success: true,

        sessionId,

        session,

        message:
            'Academic session created successfully.'
    };
}

// ────────────────────────────────────────────────
// DELETE SESSION
// ────────────────────────────────────────────────

async function deleteSession(
    school,
    data,
    userEmail
) {

    requireFields(data, ['sessionId']);

    const sessionRef = db.ref(
        `sessions/${school.id}/${data.sessionId}`
    );

    const sessionSnap = await sessionRef.once('value');

    if (!sessionSnap.exists()) {
        throw new Error('Session not found.');
    }

    const session = sessionSnap.val();

    // Prevent deleting active session
    if (session.status === 'active') {
        throw new Error(
            'Deactivate this session before deleting it.'
        );
    }

    // Check for terms
    const termSnap = await db
        .ref(`terms/${school.id}`)
        .once('value');

    if (termSnap.exists()) {

        let hasTerm = false;

        termSnap.forEach(c => {
            if (
                c.val().sessionId === data.sessionId
            ) {
                hasTerm = true;
            }
        });

        if (hasTerm) {
            throw new Error(
                'Cannot delete session because terms exist under it.'
            );
        }
    }

    await sessionRef.remove();

    await logAudit(
        school.id,
        'Academic session deleted',
        session.name,
        userEmail
    );

    return {
        success: true,
        message: 'Academic session deleted.'
    };
}



// ────────────────────────────────────────────────
// CREATE TERM
// ────────────────────────────────────────────────

async function createTerm(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'sessionId',
        'name'
    ]);

    // Verify session exists

    const sessionSnap = await db
        .ref(
            `sessions/${school.id}/${data.sessionId}`
        )
        .once('value');

    if (!sessionSnap.exists()) {
        throw new Error(
            'Selected session does not exist.'
        );
    }

    const name = sanitizeString(
        data.name,
        60
    );

    // Prevent duplicate term

    const termSnap = await db
        .ref(`terms/${school.id}`)
        .once('value');

    if (termSnap.exists()) {

        let duplicate = false;

        termSnap.forEach(c => {

            const t = c.val();

            if (
                t.sessionId === data.sessionId &&
                t.name === name
            ) {
                duplicate = true;
            }

        });

        if (duplicate) {
            throw new Error(
                'This term already exists in the selected session.'
            );
        }

    }

    const termId = makeId('TRM');

    const term = {

        id: termId,

        schoolId: school.id,

        sessionId: data.sessionId,

        name,

        status: normalizeStatus(
            data.status
        ),

        createdAt: Date.now(),

        createdBy: userEmail

    };

    await db
        .ref(
            `terms/${school.id}/${termId}`
        )
        .set(term);

    await logAudit(
        school.id,
        'Academic term created',
        name,
        userEmail
    );

    return {

        success: true,

        termId,

        term,

        message:
            'Academic term created successfully.'

    };

}



// ────────────────────────────────────────────────
// DELETE TERM
// ────────────────────────────────────────────────

async function deleteTerm(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'termId'
    ]);

    const termRef = db.ref(
        `terms/${school.id}/${data.termId}`
    );

    const termSnap = await termRef.once('value');

    if (!termSnap.exists()) {
        throw new Error('Term not found.');
    }

    const term = termSnap.val();

    if (term.status === 'active') {
        throw new Error(
            'Deactivate this term before deleting it.'
        );
    }

    // Prevent deleting the current term

    const contextSnap = await db
        .ref(
            `context/${school.id}`
        )
        .once('value');

    if (
        contextSnap.exists() &&
        contextSnap.val().termId === data.termId
    ) {
        throw new Error(
            'This term is currently selected as the active academic term.'
        );
    }

    await termRef.remove();

    await logAudit(
        school.id,
        'Academic term deleted',
        term.name,
        userEmail
    );

    return {

        success: true,

        message:
            'Academic term deleted successfully.'

    };

}

// ────────────────────────────────────────────────
// CREATE CLASS
// ────────────────────────────────────────────────

async function createClass(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'name'
    ]);

    const name = sanitizeString(
        data.name,
        80
    );

    // Prevent duplicate class name

    const existing = await db
        .ref(`classes/${school.id}`)
        .orderByChild('name')
        .equalTo(name)
        .once('value');

    if (existing.exists()) {
        throw new Error(
            'A class with this name already exists.'
        );
    }

    const classId = makeId('CLS');

    const classObj = {

        id: classId,

        schoolId: school.id,

        name,

        shortName: sanitizeString(
            data.shortName || '',
            20
        ),

        status: normalizeStatus(
            data.status
        ),

        color: data.color
            ? validateColor(data.color)
            : '#1976D2',

        armsCount: 0,

        createdAt: Date.now(),

        createdBy: userEmail
    };

    await db
        .ref(`classes/${school.id}/${classId}`)
        .set(classObj);

    await logAudit(
        school.id,
        'Class created',
        name,
        userEmail
    );

    return {

        success: true,

        classId,

        class: classObj,

        message:
            'Class created successfully.'

    };

}



// ────────────────────────────────────────────────
// DELETE CLASS
// ────────────────────────────────────────────────

async function deleteClass(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'classId'
    ]);

    const classRef = db.ref(
        `classes/${school.id}/${data.classId}`
    );

    const classSnap =
        await classRef.once('value');

    if (!classSnap.exists()) {
        throw new Error(
            'Class not found.'
        );
    }

    const classData = classSnap.val();

    if (classData.status === 'active') {
        throw new Error(
            'Deactivate this class before deleting it.'
        );
    }

    // Check whether arms still exist

    const armSnap = await db
        .ref(`arms/${school.id}`)
        .once('value');

    if (armSnap.exists()) {

        let hasArm = false;

        armSnap.forEach(child => {

            const arm = child.val();

            if (
                arm.classId === data.classId
            ) {
                hasArm = true;
            }

        });

        if (hasArm) {
            throw new Error(
                'Cannot delete class because it still contains arms.'
            );
        }

    }

    // Check whether students still belong to this class

    const enrollSnap = await db
        .ref('studentEnrollments')
        .once('value');

    if (enrollSnap.exists()) {

        let hasStudents = false;

        enrollSnap.forEach(student => {

            const schoolEnroll =
                student.child(school.id);

            if (
                schoolEnroll.exists() &&
                schoolEnroll.val().classId === data.classId &&
                schoolEnroll.val().status === 'active'
            ) {
                hasStudents = true;
            }

        });

        if (hasStudents) {
            throw new Error(
                'Cannot delete class because active students are assigned to it.'
            );
        }

    }

    await classRef.remove();

    await logAudit(
        school.id,
        'Class deleted',
        classData.name,
        userEmail
    );

    return {

        success: true,

        message:
            'Class deleted successfully.'

    };

}

// ────────────────────────────────────────────────
// CREATE ARM
// ────────────────────────────────────────────────

async function createArm(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'classId',
        'name'
    ]);

    // Verify class exists

    const classSnap = await db
        .ref(`classes/${school.id}/${data.classId}`)
        .once('value');

    if (!classSnap.exists()) {
        throw new Error(
            'Selected class does not exist.'
        );
    }

    const name = sanitizeString(
        data.name,
        40
    );

    // Prevent duplicate arm within the class

    const armSnap = await db
        .ref(`arms/${school.id}`)
        .once('value');

    if (armSnap.exists()) {

        let duplicate = false;

        armSnap.forEach(child => {

            const arm = child.val();

            if (
                arm.classId === data.classId &&
                arm.name.toLowerCase() === name.toLowerCase()
            ) {
                duplicate = true;
            }

        });

        if (duplicate) {
            throw new Error(
                'This arm already exists for the selected class.'
            );
        }

    }

    const armId = makeId('ARM');

    const arm = {

        id: armId,

        schoolId: school.id,

        classId: data.classId,

        name,

        status: normalizeStatus(
            data.status
        ),

        createdAt: Date.now(),

        createdBy: userEmail

    };

    const updates = {};

    updates[`arms/${school.id}/${armId}`] = arm;

    // Increase class arm count

    const cls = classSnap.val();

    updates[
        `classes/${school.id}/${data.classId}/armsCount`
    ] = (cls.armsCount || 0) + 1;

    await db.ref().update(updates);

    await logAudit(
        school.id,
        'Class arm created',
        `${cls.name} - ${name}`,
        userEmail
    );

    return {

        success: true,

        armId,

        arm,

        message:
            'Class arm created successfully.'

    };

}



// ────────────────────────────────────────────────
// DELETE ARM
// ────────────────────────────────────────────────

async function deleteArm(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'armId'
    ]);

    const armRef = db.ref(
        `arms/${school.id}/${data.armId}`
    );

    const armSnap = await armRef.once('value');

    if (!armSnap.exists()) {
        throw new Error(
            'Class arm not found.'
        );
    }

    const arm = armSnap.val();

    // Prevent deleting active arm

    if (arm.status === 'active') {
        throw new Error(
            'Deactivate this arm before deleting it.'
        );
    }

    // Check student enrolments

    const enrollSnap = await db
        .ref('studentEnrollments')
        .once('value');

    if (enrollSnap.exists()) {

        let hasStudents = false;

        enrollSnap.forEach(student => {

            const schoolEnroll =
                student.child(school.id);

            if (
                schoolEnroll.exists() &&
                schoolEnroll.val().armId === data.armId &&
                schoolEnroll.val().status === 'active'
            ) {
                hasStudents = true;
            }

        });

        if (hasStudents) {
            throw new Error(
                'Cannot delete arm because active students are assigned to it.'
            );
        }

    }

    const updates = {};

    updates[
        `arms/${school.id}/${data.armId}`
    ] = null;

    // Reduce class arm count safely

    const classSnap = await db
        .ref(`classes/${school.id}/${arm.classId}`)
        .once('value');

    if (classSnap.exists()) {

        const cls = classSnap.val();

        updates[
            `classes/${school.id}/${arm.classId}/armsCount`
        ] = Math.max(
            0,
            (cls.armsCount || 1) - 1
        );

    }

    await db.ref().update(updates);

    await logAudit(
        school.id,
        'Class arm deleted',
        arm.name,
        userEmail
    );

    return {

        success: true,

        message:
            'Class arm deleted successfully.'

    };

}

// ────────────────────────────────────────────────
// CREATE SUBJECT
// ────────────────────────────────────────────────

async function createSubject(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'name',
        'code'
    ]);

    const name = sanitizeString(
        data.name,
        100
    );

    const code = sanitizeString(
        data.code,
        20
    ).toUpperCase();

    // Prevent duplicate subject code

    const subjectSnap = await db
        .ref(`subjects/${school.id}`)
        .once('value');

    if (subjectSnap.exists()) {

        let duplicate = false;

        subjectSnap.forEach(child => {

            const subject = child.val();

            if (
                String(subject.code).toUpperCase() === code
            ) {
                duplicate = true;
            }

        });

        if (duplicate) {
            throw new Error(
                'Subject code already exists.'
            );
        }

    }

    const subjectId = makeId('SUB');

    const subject = {

        id: subjectId,

        schoolId: school.id,

        name,

        code,

        category: sanitizeString(
            data.category || 'Core',
            40
        ),

        color: data.color
            ? validateColor(data.color)
            : '#4CAF50',

        status: normalizeStatus(
            data.status
        ),

        createdAt: Date.now(),

        createdBy: userEmail

    };

    await db
        .ref(
            `subjects/${school.id}/${subjectId}`
        )
        .set(subject);

    await logAudit(
        school.id,
        'Subject created',
        `${name} (${code})`,
        userEmail
    );

    return {

        success: true,

        subjectId,

        subject,

        message:
            'Subject created successfully.'

    };

}



// ────────────────────────────────────────────────
// DELETE SUBJECT
// ────────────────────────────────────────────────

async function deleteSubject(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'subjectId'
    ]);

    const subjectRef = db.ref(
        `subjects/${school.id}/${data.subjectId}`
    );

    const subjectSnap =
        await subjectRef.once('value');

    if (!subjectSnap.exists()) {
        throw new Error(
            'Subject not found.'
        );
    }

    const subject = subjectSnap.val();

    if (subject.status === 'active') {
        throw new Error(
            'Deactivate this subject before deleting it.'
        );
    }

    // Prevent deleting if used in raw results

    const rawSnap = await db
        .ref(`rawResults/${school.id}`)
        .once('value');

    if (rawSnap.exists()) {

        let used = false;

        rawSnap.forEach(child => {

            if (
                child.val().subjectId ===
                data.subjectId
            ) {
                used = true;
            }

        });

        if (used) {
            throw new Error(
                'Cannot delete this subject because examination records already exist.'
            );
        }

    }

    // Prevent deleting if already assigned
    // to a teacher

    const teacherSnap = await db
        .ref(`teachers/${school.id}`)
        .once('value');

    if (teacherSnap.exists()) {

        let assigned = false;

        teacherSnap.forEach(child => {

            const teacher = child.val();

            if (
                Array.isArray(
                    teacher.assignedSubjects
                ) &&
                teacher.assignedSubjects.includes(
                    data.subjectId
                )
            ) {
                assigned = true;
            }

        });

        if (assigned) {
            throw new Error(
                'Remove this subject from all teachers before deleting it.'
            );
        }

    }

    await subjectRef.update({
    status: 'deleted',
    deletedAt: Date.now(),
    deletedBy: userEmail
});

    await logAudit(
        school.id,
        'Subject deleted',
        `${subject.name} (${subject.code})`,
        userEmail
    );

    return {

        success: true,

        message:
            'Subject deleted successfully.'

    };

}

// ────────────────────────────────────────────────
// SAVE ACADEMIC CONTEXT
// ────────────────────────────────────────────────

async function saveContext(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'sessionId',
        'termId'
    ]);

    // Verify session exists

    const sessionSnap = await db
        .ref(`sessions/${school.id}/${data.sessionId}`)
        .once('value');

    if (!sessionSnap.exists()) {
        throw new Error(
            'Selected session does not exist.'
        );
    }

    // Verify term exists

    const termSnap = await db
        .ref(`terms/${school.id}/${data.termId}`)
        .once('value');

    if (!termSnap.exists()) {
        throw new Error(
            'Selected term does not exist.'
        );
    }

    const session = sessionSnap.val();
    const term = termSnap.val();

    // Ensure the term belongs to the selected session

    if (term.sessionId !== data.sessionId) {
        throw new Error(
            'The selected term does not belong to the selected session.'
        );
    }

    const context = {

        schoolId: school.id,

        sessionId: data.sessionId,
        sessionName: session.name,

        termId: data.termId,
        termName: term.name,

        updatedAt: Date.now(),
        updatedBy: userEmail

    };

    await db
        .ref(`context/${school.id}`)
        .set(context);

    await logAudit(
        school.id,
        'Academic context updated',
        `${session.name} • ${term.name}`,
        userEmail
    );

    return {

        success: true,

        context,

        message:
            'Academic context saved successfully.'

    };

}

// ────────────────────────────────────────────────
// SAVE GRADING CONFIGURATION
// ────────────────────────────────────────────────

async function saveGrading(
    school,
    data,
    userEmail
) {

    requireFields(data, ['bands']);

    if (!Array.isArray(data.bands) || data.bands.length === 0) {
        throw new Error(
            'At least one grading band is required.'
        );
    }

    const bands = [];

    for (const band of data.bands) {

        const min = parseInt(band.min, 10);
        const max = parseInt(band.max, 10);

        if (
            isNaN(min) ||
            isNaN(max) ||
            min < 0 ||
            max > 100 ||
            min > max
        ) {
            throw new Error(
                'Invalid grading band.'
            );
        }

        bands.push({

            min,
            max,

            grade: sanitizeString(
                band.grade,
                5
            ).toUpperCase(),

            remark: sanitizeString(
                band.remark,
                60
            )

        });

    }

    // Sort by minimum score

    bands.sort((a, b) => a.min - b.min);

    // Ensure ranges do not overlap

    for (let i = 1; i < bands.length; i++) {

        if (
            bands[i].min <= bands[i - 1].max
        ) {
            throw new Error(
                'Grading bands overlap.'
            );
        }

    }

    const grading = {

        schoolId: school.id,

        bands,

        updatedAt: Date.now(),

        updatedBy: userEmail

    };

    await db
        .ref(`gradingConfig/${school.id}`)
        .set(grading);

    await logAudit(
        school.id,
        'Grading configuration updated',
        `${bands.length} grading bands`,
        userEmail
    );

    return {

        success: true,

        grading,

        message:
            'Grading configuration saved successfully.'

    };

}



// ────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────

module.exports = {

    createSession,
    deleteSession,

    createTerm,
    deleteTerm,

    createClass,
    deleteClass,

    createArm,
    deleteArm,

    createSubject,
    deleteSubject,

    saveContext,

    saveGrading

};
