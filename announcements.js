'use strict';

/**
 * Announcements Service
 *
 * Handles:
 *   • Create announcements
 *   • Delete announcements
 *
 * Every announcement belongs to a school.
 */

const { db } = require('../utils/firebase');
const {
  requireFields,
  sanitizeString
} = require('../utils/validators');
const { logAudit } = require('./audit');

/**
 * Create a new announcement.
 */
async function createAnnouncement(school, data, userEmail) {
  requireFields(data, ['title', 'message']);
  
  const announcementId =
    `ANN${Date.now().toString(36).toUpperCase()}`;
  
  const announcement = {
    id: announcementId,
    schoolId: school.id,
    
    title: sanitizeString(data.title, 150),
    
    message: sanitizeString(data.message, 5000),
    
    audience: sanitizeString(
      data.audience || 'all',
      30
    ),
    
    priority: sanitizeString(
      data.priority || 'normal',
      20
    ),
    
    publishDate: data.publishDate || Date.now(),
    
    expiryDate: data.expiryDate || null,
    
    pinned: Boolean(data.pinned),
    
    active: true,
    
    createdBy: userEmail,
    
    createdAt: Date.now()
  };
  
  await db.ref(
    `announcements/${school.id}/${announcementId}`
  ).set(announcement);
  
  await logAudit(
    school.id,
    'Announcement created',
    announcement.title,
    userEmail
  );
  
  return {
    success: true,
    announcementId,
    message: 'Announcement created successfully.'
  };
}

/**
 * Delete an announcement.
 */
async function deleteAnnouncement(school, data, userEmail) {
  requireFields(data, ['announcementId']);
  
  const ref = db.ref(
    `announcements/${school.id}/${data.announcementId}`
  );
  
  const snap = await ref.once('value');
  
  if (!snap.exists()) {
    throw new Error('Announcement not found.');
  }
  
  const announcement = snap.val();
  
  await ref.remove();
  
  await logAudit(
    school.id,
    'Announcement deleted',
    announcement.title || data.announcementId,
    userEmail
  );
  
  return {
    success: true,
    message: 'Announcement deleted successfully.'
  };
}

/**
 * Get all announcements for a school.
 */
async function getAnnouncements(school) {

  const snap = await db
    .ref(`announcements/${school.id}`)
    .once('value');

  const announcements = [];

  if (snap.exists()) {

    snap.forEach(child => {

      announcements.push({

        id: child.key,

        ...child.val()

      });

    });

  }

  announcements.sort(
    (a, b) =>
      (b.postedAt || 0) -
      (a.postedAt || 0)
  );

  return {

    success: true,

    announcements

  };

}

module.exports = {

  createAnnouncement,

  getAnnouncements,

  deleteAnnouncement,

};

