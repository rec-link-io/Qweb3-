'use strict';

/**
 * Calendar Service
 *
 * Handles:
 *   • Create calendar events
 *   • Get calendar events
 *   • Delete calendar events
 */

const { db } = require('../utils/firebase');
const {
  requireFields,
  sanitizeString
} = require('../utils/validators');

const { logAudit } = require('./audit');

/**
 * Create a calendar event.
 */
async function createCalendarEvent(school, data, userEmail) {

  requireFields(data, [
    'title',
    'startDate'
  ]);

  const eventId =
    `CAL${Date.now().toString(36).toUpperCase()}`;

  const event = {

    id: eventId,

    schoolId: school.id,

    title: sanitizeString(
      data.title,
      150
    ),

    startDate: sanitizeString(
      data.startDate,
      30
    ),

    endDate: data.endDate
      ? sanitizeString(data.endDate, 30)
      : null,

    type: sanitizeString(
      data.type || 'event',
      30
    ),

    notes: sanitizeString(
      data.notes || '',
      1000
    ),

    createdBy: userEmail,

    createdAt: Date.now()

  };

  await db
    .ref(`academicCalendar/${school.id}/${eventId}`)
    .set(event);

  await logAudit(
    school.id,
    'Calendar event created',
    event.title,
    userEmail
  );

  return {

    success: true,

    eventId,

    message:
      'Calendar event created successfully.'

  };

}

/**
 * Get all calendar events.
 */
async function getCalendarEvents(school) {

  const snap = await db
    .ref(`academicCalendar/${school.id}`)
    .once('value');

  const events = [];

  if (snap.exists()) {

    snap.forEach(child => {

      events.push({

        id: child.key,

        ...child.val()

      });

    });

  }

  events.sort((a, b) =>
    new Date(a.startDate) -
    new Date(b.startDate)
  );

  return {

    success: true,

    events

  };

}

/**
 * Delete a calendar event.
 */
async function deleteCalendarEvent(
  school,
  data,
  userEmail
) {

  requireFields(data, [
    'eventId'
  ]);

  const ref = db.ref(
    `academicCalendar/${school.id}/${data.eventId}`
  );

  const snap = await ref.once('value');

  if (!snap.exists()) {

    throw new Error(
      'Calendar event not found.'
    );

  }

  const event = snap.val();

  await ref.remove();

  await logAudit(
    school.id,
    'Calendar event deleted',
    event.title || data.eventId,
    userEmail
  );

  return {

    success: true,

    message:
      'Calendar event deleted successfully.'

  };

}

module.exports = {

  createCalendarEvent,

  getCalendarEvents,

  deleteCalendarEvent

};
