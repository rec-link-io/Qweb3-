'use strict';

/**
 * Dashboard Service
 *
 * Loads everything required for the School Admin dashboard
 * in a single request.
 *
 * Returns:
 * • Sessions
 * • Terms
 * • Classes
 * • Arms
 * • Subjects
 * • Teachers
 * • Students
 * • Alumni
 * • Grading Configuration
 * • Context
 * • Announcements
 * • Pins
 * • Raw Results
 * • Processed Results
 */

const { db } = require('../utils/firebase');

/**
 * Load dashboard data.
 */
async function loadDashboardData(school) {

  const paths = [
    `sessions/${school.id}`,
    `terms/${school.id}`,
    `classes/${school.id}`,
    `arms/${school.id}`,
    `subjects/${school.id}`,
    `teachers/${school.id}`,
    `gradingConfig/${school.id}`,
    `context/${school.id}`,
    `announcements/${school.id}`,
    `pins/${school.id}`,
    `rawResults/${school.id}`,
    `processedResults/${school.id}`,
    `studentEnrollments`,
  ];

  const [
    sessionsSnap,
    termsSnap,
    classesSnap,
    armsSnap,
    subjectsSnap,
    teachersSnap,
    gradingSnap,
    contextSnap,
    announcementsSnap,
    pinsSnap,
    rawResultsSnap,
    processedResultsSnap,
    enrollmentsSnap,
  ] = await Promise.all(
    paths.map(path => db.ref(path).once('value'))
  );

  const students = {};
  const alumni = {};

  if (enrollmentsSnap.exists()) {

    const tasks = [];

    enrollmentsSnap.forEach(studentNode => {

      const enrollment =
        studentNode.child(school.id);

      if (!enrollment.exists()) return;

      tasks.push(
        db.ref(`students/${studentNode.key}`)
          .once('value')
          .then(studentSnap => {

            if (!studentSnap.exists()) return;

            const data = {
              ...studentSnap.val(),
              _enrollment: enrollment.val(),
            };

            if (
              enrollment.val().status === 'alumni'
            ) {

              alumni[studentNode.key] = data;

            } else {

              students[studentNode.key] = data;

            }

          })
      );

    });

    await Promise.all(tasks);

  }

  return {

    success: true,

    sessions:
      sessionsSnap.exists()
        ? sessionsSnap.val()
        : {},

    terms:
      termsSnap.exists()
        ? termsSnap.val()
        : {},

    classes:
      classesSnap.exists()
        ? classesSnap.val()
        : {},

    arms:
      armsSnap.exists()
        ? armsSnap.val()
        : {},

    subjects:
      subjectsSnap.exists()
        ? subjectsSnap.val()
        : {},

    teachers:
      teachersSnap.exists()
        ? teachersSnap.val()
        : {},

    gradingConfig:
      gradingSnap.exists()
        ? gradingSnap.val()
        : {},

    context:
      contextSnap.exists()
        ? contextSnap.val()
        : {},

    announcements:
      announcementsSnap.exists()
        ? announcementsSnap.val()
        : {},

    pins:
      pinsSnap.exists()
        ? pinsSnap.val()
        : {},

    rawResults:
      rawResultsSnap.exists()
        ? rawResultsSnap.val()
        : {},

    processedResults:
      processedResultsSnap.exists()
        ? processedResultsSnap.val()
        : {},

    students,

    alumni,

  };

}

module.exports = {
  loadDashboardData,
};