/**
 * Shared helpers for EconSim Cloud Functions.
 * Used by reset/restore/backup operations.
 */
const admin = require('firebase-admin');

const CLASSROOM_DATA_COLLECTIONS = [
  'transactions', 'jobs', 'applications', 'businesses',
  'loans', 'savings', 'funds', 'notifications', 'messages',
  'weeklySnapshots',
];

/**
 * Splits an array into chunks of given size (Firestore batch limit is 500).
 */
function chunkBatches(items, size = 500) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Take a snapshot of a classroom's data into the classroomBackups collection.
 * Returns the new backup id.
 *
 * @param {string} classroomId
 * @param {string} createdByUid
 * @param {'reset'|'pre-restore'|'demo-reset'} reason
 */
async function createBackup(classroomId, createdByUid, reason) {
  const db = admin.firestore();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = reason === 'pre-restore'
    ? `pre-restore_${classroomId}_${ts}`
    : `${classroomId}_${ts}`;

  const backup = {
    classroomId,
    createdAt: new Date().toISOString(),
    createdBy: createdByUid,
    reason,
  };

  for (const col of CLASSROOM_DATA_COLLECTIONS) {
    const snap = await db.collection(col).where('classroomId', '==', classroomId).get();
    backup[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Users (typically students) for this classroom
  const usersSnap = await db.collection('users').where('classroomId', '==', classroomId).get();
  backup.users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Classroom doc itself
  const classroomDoc = await db.collection('classrooms').doc(classroomId).get();
  backup.classroom = classroomDoc.exists ? { id: classroomDoc.id, ...classroomDoc.data() } : null;

  await db.collection('classroomBackups').doc(backupId).set(backup);
  return backupId;
}

/**
 * Delete all classroom data (transactions, jobs, etc.) for a classroomId.
 * Skips users — caller decides whether to delete students.
 */
async function deleteAllClassroomData(classroomId) {
  const db = admin.firestore();
  for (const col of CLASSROOM_DATA_COLLECTIONS) {
    const snap = await db.collection(col).where('classroomId', '==', classroomId).get();
    for (const batchDocs of chunkBatches(snap.docs, 500)) {
      const wb = db.batch();
      batchDocs.forEach(doc => wb.delete(doc.ref));
      await wb.commit();
    }
  }
}

/**
 * Delete all students for a classroom. Returns count.
 */
async function deleteClassroomStudents(classroomId) {
  const db = admin.firestore();
  const snap = await db.collection('users')
    .where('classroomId', '==', classroomId)
    .where('type', '==', 'student')
    .get();
  for (const batchDocs of chunkBatches(snap.docs, 500)) {
    const wb = db.batch();
    batchDocs.forEach(doc => wb.delete(doc.ref));
    await wb.commit();
  }
  return snap.size;
}

module.exports = {
  CLASSROOM_DATA_COLLECTIONS,
  chunkBatches,
  createBackup,
  deleteAllClassroomData,
  deleteClassroomStudents,
};
