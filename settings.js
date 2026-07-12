'use strict';

/**

Settings Service

Handles:

• School settings

• Branding

• Contact details

• Portal configuration

• Directory profile
*/

const { db } = require('../utils/firebase');
const {
requireFields,
sanitizeString,
validateColor
} = require('../utils/validators');
const { logAudit } = require('./audit');

/**

Save general school settings.
*/
async function saveSettings(school, data, userEmail) {
requireFields(data, [
'schoolName'
]);

const update = {};

//──────────────────────────────────────────
// Basic Information
//──────────────────────────────────────────

update.schoolName = sanitizeString(data.schoolName,120);

if (data.schoolShortName !== undefined)
update.schoolShortName =
sanitizeString(data.schoolShortName,30);

if (data.schoolMotto !== undefined)
update.schoolMotto =
sanitizeString(data.schoolMotto,150);

if (data.motto !== undefined)
update.motto =
sanitizeString(data.motto,150);

if (data.email !== undefined)
update.email =
sanitizeString(data.email,120);

if (data.phone !== undefined)
update.phone =
sanitizeString(data.phone,40);

if (data.altPhone !== undefined)
update.altPhone =
sanitizeString(data.altPhone,40);

if (data.website !== undefined)
update.website =
sanitizeString(data.website,150);

if (data.address !== undefined)
update.address =
sanitizeString(data.address,300);

if (data.city !== undefined)
update.city =
sanitizeString(data.city,80);

if (data.state !== undefined)
update.state =
sanitizeString(data.state,80);

if (data.country !== undefined)
update.country =
sanitizeString(data.country,80);

if (data.principalName !== undefined)
update.principalName =
sanitizeString(data.principalName, 120);


if (data.teacherRemark !== undefined)
update.teacherRemark =
sanitizeString(data.teacherRemark, 1000);

if (data.principalRemark !== undefined)
update.principalRemark =
sanitizeString(data.principalRemark, 1000);

if (data.nextTermBegins !== undefined)
update.nextTermBegins =
sanitizeString(data.nextTermBegins, 50);

if (data.schoolType !== undefined)
update.schoolType =
sanitizeString(data.schoolType, 60);
//──────────────────────────────────────────
// Branding
//──────────────────────────────────────────

if (data.logo !== undefined)
update.logo = sanitizeString(data.logo,500);

if (data.banner !== undefined)
update.banner = sanitizeString(data.banner,500);

if (data.primaryColor)
update.primaryColor =
validateColor(data.primaryColor);

if (data.secondaryColor)
update.secondaryColor =
validateColor(data.secondaryColor);

//──────────────────────────────────────────
// Portal Configuration
//──────────────────────────────────────────

if (data.portalEnabled !== undefined)
update.portalEnabled =
Boolean(data.portalEnabled);

if (data.allowParentAccess !== undefined)
update.allowParentAccess =
Boolean(data.allowParentAccess);

if (data.allowStudentAccess !== undefined)
update.allowStudentAccess =
Boolean(data.allowStudentAccess);

if (data.allowTeacherAccess !== undefined)
update.allowTeacherAccess =
Boolean(data.allowTeacherAccess);

if (data.allowOnlinePayment !== undefined)
update.allowOnlinePayment =
Boolean(data.allowOnlinePayment);

update.updatedAt = Date.now();

await db.ref(`schools/${school.id}`).update(update);

await logAudit(
school.id,
'School settings updated',
update.schoolName,
userEmail
);

return {
success: true,
schoolName: update.schoolName,
message: 'School settings saved successfully.'
};
}
/**

Save the school's public directory profile.

This information is shown in the SchoolCore public school directory.
*/
async function saveDirectoryProfile(school, data, userEmail) {
requireFields(data, ['description']);

const profile = {};

//──────────────────────────────────────────
// Public Description
//──────────────────────────────────────────

profile.description =
sanitizeString(data.description, 3000);

if (data.established !== undefined)
profile.established =
sanitizeString(data.established, 20);

if (data.schoolType !== undefined)
profile.schoolType =
sanitizeString(data.schoolType, 50);

if (data.category !== undefined)
profile.category =
sanitizeString(data.category, 50);

if (data.curriculum !== undefined)
profile.curriculum =
sanitizeString(data.curriculum, 120);

if (data.gender !== undefined)
profile.gender =
sanitizeString(data.gender, 30);

if (data.hostel !== undefined)
profile.hostel =
Boolean(data.hostel);

if (data.daySchool !== undefined)
profile.daySchool =
Boolean(data.daySchool);

//──────────────────────────────────────────
// Contact Information
//──────────────────────────────────────────

if (data.email !== undefined)
profile.email =
sanitizeString(data.email, 120);

if (data.phone !== undefined)
profile.phone =
sanitizeString(data.phone, 40);

if (data.website !== undefined)
profile.website =
sanitizeString(data.website, 150);

if (data.address !== undefined)
profile.address =
sanitizeString(data.address, 300);

if (data.city !== undefined)
profile.city =
sanitizeString(data.city, 80);

if (data.state !== undefined)
profile.state =
sanitizeString(data.state, 80);

if (data.country !== undefined)
profile.country =
sanitizeString(data.country, 80);

//──────────────────────────────────────────
// Social Links
//──────────────────────────────────────────

if (data.facebook !== undefined)
profile.facebook =
sanitizeString(data.facebook, 200);

if (data.instagram !== undefined)
profile.instagram =
sanitizeString(data.instagram, 200);

if (data.twitter !== undefined)
profile.twitter =
sanitizeString(data.twitter, 200);

if (data.linkedin !== undefined)
profile.linkedin =
sanitizeString(data.linkedin, 200);

if (data.youtube !== undefined)
profile.youtube =
sanitizeString(data.youtube, 200);

//──────────────────────────────────────────
// Media
//──────────────────────────────────────────

if (data.logo !== undefined)
profile.logo =
sanitizeString(data.logo, 500);

if (data.coverImage !== undefined)
profile.coverImage =
sanitizeString(data.coverImage, 500);

if (Array.isArray(data.gallery)) {
profile.gallery = data.gallery
.slice(0, 20)
.map(img => sanitizeString(img, 500));
}

//──────────────────────────────────────────
// Visibility
//──────────────────────────────────────────

profile.directoryVisible =
data.directoryVisible !== false;

profile.updatedAt = Date.now();

await db.ref(`schoolDirectory/${school.id}`).update(profile);

await logAudit(
school.id,
'Directory profile updated',
'School profile updated',
userEmail
);

return {
success: true,
message: 'School directory profile saved successfully.'
};
}

async function getDirectoryProfile(school) {

const snap = await db.ref(`schoolDirectory/${school.id}`).once('value');

return {
success: true,
profile: snap.exists() ? snap.val() : {}
};

}async function addGalleryImage(
school,
data,
userEmail
) {

requireFields(data, ['image']);

const ref = db.ref(`schoolDirectory/${school.id}/gallery`);

const snap = await ref.once('value');

const gallery = snap.exists()
? snap.val()
: [];

if (gallery.length >= 20) {
throw new Error(
'Maximum gallery size reached.'
);
}

gallery.push(
sanitizeString(data.image, 500000)
);

await ref.set(gallery);

await logAudit(
school.id,
'Gallery image added',
'',
userEmail
);

return {
success: true,
gallery
};

}async function removeGalleryImage(
school,
data,
userEmail
) {

requireFields(data, ['index']);

const ref = db.ref(`schoolDirectory/${school.id}/gallery`);

const snap = await ref.once('value');

if (!snap.exists()) {
throw new Error(
'Gallery is empty.'
);
}

const gallery = snap.val();

if (
data.index < 0 ||
data.index >= gallery.length
) {
throw new Error(
'Invalid gallery image.'
);
}

gallery.splice(data.index, 1);

await ref.set(gallery);

await logAudit(
school.id,
'Gallery image removed',
'',
userEmail
);

return {
success: true,
gallery
};

}
async function getSchoolProfile(school) {

const snap = await db.ref(`schools/${school.id}`).once("value");

if (!snap.exists()) {
throw new Error("School not found.");
}

return {
success: true,
school: {
id: school.id,
...snap.val()
}
};

}

/**
 * Save school fee structure.
 */

async function saveFeeStructure(
  school,
  data,
  userEmail
) {

  requireFields(data, [
    "sessionId",
    "totalAmount"
  ]);

  const feeStructure = {};

  feeStructure.sessionId = sanitizeString(
    data.sessionId,
    60
  );

  feeStructure.totalAmount =
    Number(data.totalAmount) || 0;

  if (data.currency !== undefined)
    feeStructure.currency =
      sanitizeString(data.currency, 20);

  if (data.dueDate !== undefined)
    feeStructure.dueDate =
      sanitizeString(data.dueDate, 50);

  feeStructure.term1 =
    Number(data.term1) || 0;

  feeStructure.term2 =
    Number(data.term2) || 0;

  feeStructure.term3 =
    Number(data.term3) || 0;

  if (data.notes !== undefined)
    feeStructure.notes =
      sanitizeString(data.notes, 1000);

  feeStructure.updatedAt = Date.now();

  const ref = db.ref(
  `feeStructure/${school.id}/${feeStructure.sessionId}`
);

const snap = await ref.once("value");

if (snap.exists()) {
  throw new Error("Fee structure already exists.");
}

await ref.set(feeStructure);

  await logAudit(
    school.id,
    "Fee structure saved",
    feeStructure.sessionId,
    userEmail
  );

  return {
    success: true,
    feeStructure,
    message: "Fee structure saved successfully."
  };

}

/**
 * Get school fee structure.
 */
async function getFeeStructure(
  school,
  data
) {

  requireFields(data, [
    "sessionId"
  ]);

  const snap = await db.ref(
    `feeStructure/${school.id}/${data.sessionId}`
  ).once("value");

  return {
    success: true,
    feeStructure: snap.exists()
      ? snap.val()
      : null
  };

}

/**
 * Update school fee structure.
 */
async function updateFeeStructure(
  school,
  data,
  userEmail
) {

  requireFields(data, [
    "sessionId"
  ]);

  const ref = db.ref(
    `feeStructure/${school.id}/${data.sessionId}`
  );

  const snap = await ref.once("value");

  if (!snap.exists()) {
    throw new Error(
      "Fee structure not found."
    );
  }

  const update = {};

  if (data.totalAmount !== undefined)
    update.totalAmount =
      Number(data.totalAmount) || 0;

  if (data.currency !== undefined)
    update.currency =
      sanitizeString(data.currency, 20);

  if (data.dueDate !== undefined)
    update.dueDate =
      sanitizeString(data.dueDate, 50);

  if (data.term1 !== undefined)
    update.term1 =
      Number(data.term1) || 0;

  if (data.term2 !== undefined)
    update.term2 =
      Number(data.term2) || 0;

  if (data.term3 !== undefined)
    update.term3 =
      Number(data.term3) || 0;

  if (data.notes !== undefined)
    update.notes =
      sanitizeString(data.notes, 1000);

  update.updatedAt = Date.now();

  await ref.update(update);

  await logAudit(
    school.id,
    "Fee structure updated",
    data.sessionId,
    userEmail
  );

  return {
    success: true,
    message: "Fee structure updated successfully."
  };

}

/**
 * Delete school fee structure.
 */
async function deleteFeeStructure(
  school,
  data,
  userEmail
) {

  requireFields(data, [
    "sessionId"
  ]);

  const ref = db.ref(
    `feeStructure/${school.id}/${data.sessionId}`
  );

  const snap = await ref.once("value");

  if (!snap.exists()) {
    throw new Error(
      "Fee structure not found."
    );
  }

  await ref.remove();

  await logAudit(
    school.id,
    "Fee structure deleted",
    data.sessionId,
    userEmail
  );

  return {
    success: true,
    message: "Fee structure deleted successfully."
  };

}

/**
 * Get school debtors.
 */
async function getDebtors(school, data) {

  requireFields(data, ["sessionId"]);

  const sessionId = sanitizeString(data.sessionId, 60);
  const classId = data.classId
    ? sanitizeString(data.classId, 60)
    : null;

  // Load fee structure
  const feeSnap = await db.ref(
    `feeStructure/${school.id}/${sessionId}`
  ).once("value");

  const feeStructure = feeSnap.exists()
    ? feeSnap.val()
    : {};

  const totalDue = Number(feeStructure.totalAmount) || 0;
  const currency = feeStructure.currency || "NGN";

  // Load students
  const studentSnap = await db.ref(
    `students/${school.id}`
  ).once("value");

  const students = studentSnap.exists()
    ? studentSnap.val()
    : {};

  const rows = [];

  let paidStudents = 0;
  let partialStudents = 0;
  let unpaidStudents = 0;
  let totalCollected = 0;
  let totalDebt = 0;

  for (const studentId of Object.keys(students)) {

    const student = students[studentId];

    if (
      classId &&
      student.classId !== classId
    ) {
      continue;
    }

    const paymentSnap = await db.ref(
      `studentFees/${studentId}/${school.id}/${sessionId}`
    ).once("value");

    const payment = paymentSnap.exists()
      ? paymentSnap.val()
      : {};

    const totalPaid =
      Number(payment.totalPaid) || 0;

    const balance =
      Math.max(0, totalDue - totalPaid);

    const percentPaid =
      totalDue > 0
        ? Math.round((totalPaid / totalDue) * 100)
        : 0;

    let status = "unpaid";

    if (balance <= 0) {
      status = "paid";
      paidStudents++;
    } else if (totalPaid > 0) {
      status = "partial";
      partialStudents++;
    } else {
      unpaidStudents++;
    }

    totalCollected += totalPaid;
    totalDebt += balance;

    rows.push({
      studentId,
      studentName:
        student.name ||
        `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      className: student.className || "",
      totalPaid,
      balance,
      percentPaid,
      status
    });

  }

  rows.sort((a, b) => b.balance - a.balance);

  return {
    success: true,
    students: rows,
    debtors: partialStudents + unpaidStudents,
    paidStudents,
    partialStudents,
    unpaidStudents,
    totalCollected,
    totalDebt,
    currency
  };

}

module.exports = {
  saveSettings,
  saveDirectoryProfile,
  getDirectoryProfile,
  addGalleryImage,
  removeGalleryImage,
  getSchoolProfile,
  saveFeeStructure,
  getFeeStructure,
  updateFeeStructure,
  deleteFeeStructure,
  getDebtors
};