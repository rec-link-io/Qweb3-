'use strict';

/**
 * Timetable Service
 *
 * Handles:
 *   • Save Timetable
 *   • Load Timetable
 *   • Delete Timetable
 *
 * Storage:
 * timetable/{schoolId}/{classId_armId}
 */

const { db } = require('../utils/firebase');
const {
    requireFields
} = require('../utils/validators');

const { logAudit } = require('./audit');


// ────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────

function makeKey(classId, armId) {
    return armId
        ? `${classId}_${armId}`
        : classId;
}


// ────────────────────────────────────────────────
// SAVE TIMETABLE
// ────────────────────────────────────────────────

async function saveTimetable(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        "classId",
        "timetable"
    ]);

    // Verify class exists

    const classSnap = await db
        .ref(`classes/${school.id}/${data.classId}`)
        .once("value");

    if (!classSnap.exists()) {
        throw new Error(
            "Selected class does not exist."
        );
    }

    // Verify arm if supplied

    if (data.armId) {

        const armSnap = await db
            .ref(`arms/${school.id}/${data.armId}`)
            .once("value");

        if (!armSnap.exists()) {
            throw new Error(
                "Selected arm does not exist."
            );
        }

        if (
            armSnap.val().classId !== data.classId
        ) {
            throw new Error(
                "The selected arm does not belong to this class."
            );
        }

    }

    if (
        typeof data.timetable !== "object" ||
        Array.isArray(data.timetable)
    ) {
        throw new Error(
            "Invalid timetable data."
        );
    }

    const classData = classSnap.val();

    const key = makeKey(
        data.classId,
        data.armId
    );

    const timetable = {};

    // Validate every timetable cell

    for (const cellKey of Object.keys(data.timetable)) {

        const cell = data.timetable[cellKey];

        if (!cell.subjectId) {
            continue;
        }

        // Verify subject exists

        const subjectSnap = await db
            .ref(
                `subjects/${school.id}/${cell.subjectId}`
            )
            .once("value");

        if (!subjectSnap.exists()) {
            throw new Error(
                `Subject not found (${cell.subjectId}).`
            );
        }

        // Verify teacher if supplied

        if (cell.teacherId) {

            const teacherSnap = await db
                .ref(
                    `teachers/${school.id}/${cell.teacherId}`
                )
                .once("value");

            if (!teacherSnap.exists()) {
                throw new Error(
                    `Teacher not found (${cell.teacherId}).`
                );
            }

        }

        timetable[cellKey] = {

            subjectId: cell.subjectId,

            teacherId:
                cell.teacherId || "",

            startTime:
                cell.startTime || "",

            endTime:
                cell.endTime || ""

        };

    }

    await db
        .ref(
            `timetable/${school.id}/${key}`
        )
        .set(timetable);

    await logAudit(
        school.id,
        "Timetable saved",
        `${classData.name}${data.armId ? " • Arm" : ""}`,
        userEmail
    );

    return {

        success: true,

        timetable,

        message:
            "Timetable saved successfully."

    };

}// ────────────────────────────────────────────────
// LOAD TIMETABLE
// ────────────────────────────────────────────────

async function loadTimetable(
    school,
    data
) {

    requireFields(data, [
        "classId"
    ]);

    // Verify class exists

    const classSnap = await db
        .ref(`classes/${school.id}/${data.classId}`)
        .once("value");

    if (!classSnap.exists()) {
        throw new Error(
            "Selected class does not exist."
        );
    }

    // Verify arm if supplied

    if (data.armId) {

        const armSnap = await db
            .ref(`arms/${school.id}/${data.armId}`)
            .once("value");

        if (!armSnap.exists()) {
            throw new Error(
                "Selected arm does not exist."
            );
        }

        if (
            armSnap.val().classId !== data.classId
        ) {
            throw new Error(
                "The selected arm does not belong to this class."
            );
        }

    }

    const key = makeKey(
        data.classId,
        data.armId
    );

    const snap = await db
        .ref(`timetable/${school.id}/${key}`)
        .once("value");

    const timetable = snap.exists()
        ? snap.val()
        : {};

    return {

        success: true,

        classId: data.classId,

        armId: data.armId || null,

        timetable,

        message: snap.exists()
            ? "Timetable loaded successfully."
            : "No timetable has been created for this class."

    };

}

// ────────────────────────────────────────────────
// DELETE TIMETABLE
// ────────────────────────────────────────────────

async function deleteTimetable(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        "classId"
    ]);

    // Verify class exists
    const classSnap = await db
        .ref(`classes/${school.id}/${data.classId}`)
        .once("value");

    if (!classSnap.exists()) {
        throw new Error(
            "Selected class does not exist."
        );
    }

    // Verify arm if supplied
    if (data.armId) {

        const armSnap = await db
            .ref(`arms/${school.id}/${data.armId}`)
            .once("value");

        if (!armSnap.exists()) {
            throw new Error(
                "Selected arm does not exist."
            );
        }

        if (armSnap.val().classId !== data.classId) {
            throw new Error(
                "The selected arm does not belong to this class."
            );
        }
    }

    const key = makeKey(
        data.classId,
        data.armId
    );

    await db
        .ref(`timetable/${school.id}/${key}`)
        .remove();

    await logAudit(
        school.id,
        "Timetable deleted",
        key,
        userEmail
    );

    return {

        success: true,

        message: "Timetable deleted successfully."

    };

}
// ────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────

module.exports = {
    saveTimetable,
    loadTimetable,
    deleteTimetable
};