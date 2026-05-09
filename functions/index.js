/**
 * Firebase Cloud Functions for EconSim
 * Håndterer e-postsending via Gmail SMTP
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors')({ origin: true });
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const {
  CLASSROOM_DATA_COLLECTIONS,
  chunkBatches,
  createBackup,
  deleteAllClassroomData,
  deleteClassroomStudents,
} = require('./lib/helpers');

admin.initializeApp();

// Gmail SMTP konfigurasjon
// Sett opp med: firebase functions:config:set gmail.email="econsim.no@gmail.com" gmail.password="txhp ghnl mhkh nvsl"
const gmailEmail = functions.config().gmail?.email || process.env.GMAIL_EMAIL;
const gmailPassword = functions.config().gmail?.password || process.env.GMAIL_PASSWORD;

// Opprett transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailEmail,
    pass: gmailPassword
  }
});

/**
 * Send e-post Cloud Function
 * Kan kalles fra frontend via HTTP
 */
exports.sendEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Kun POST-requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { to, subject, html } = req.body;

      // Validering
      if (!to || !subject || !html) {
        return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
      }

      // Send e-post
      const mailOptions = {
        from: `EconSim <${gmailEmail}>`,
        to: to,
        subject: subject,
        html: html
      };

      await transporter.sendMail(mailOptions);

      console.log('Email sent successfully to:', to);
      return res.status(200).json({ success: true, message: 'Email sent successfully' });

    } catch (error) {
      console.error('Error sending email:', error);
      return res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
  });
});

/**
 * Send verifiserings-e-post
 */
exports.sendVerificationEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { to, verifyUrl } = req.body;

      if (!to || !verifyUrl) {
        return res.status(400).json({ error: 'Missing required fields: to, verifyUrl' });
      }

      const mailOptions = {
        from: `EconSim <${gmailEmail}>`,
        to: to,
        subject: 'Bekreft e-postadressen din - EconSim',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Bekreft e-postadressen din</h2>
            <p>Klikk på knappen nedenfor for å bekrefte e-postadressen din:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Bekreft e-post
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">Eller kopier denne lenken:</p>
            <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">${verifyUrl}</p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">Lenken er gyldig i 24 timer.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);

      console.log('Verification email sent to:', to);
      return res.status(200).json({ success: true });

    } catch (error) {
      console.error('Error sending verification email:', error);
      return res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
  });
});

/**
 * Send nytt passord via e-post
 */
exports.sendPasswordResetEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { to, newPassword, appUrl } = req.body;

      if (!to || !newPassword) {
        return res.status(400).json({ error: 'Missing required fields: to, newPassword' });
      }

      const loginUrl = appUrl || 'https://econsim-5723c.web.app';

      const mailOptions = {
        from: `EconSim <${gmailEmail}>`,
        to: to,
        subject: 'Nytt passord - EconSim',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Nytt passord</h2>
            <p>Du har bedt om å tilbakestille passordet ditt.</p>
            <p>Ditt nye passord er:</p>
            <p style="text-align: center; margin: 20px 0;">
              <span style="font-size: 24px; font-weight: bold; background: #f3f4f6; padding: 10px 20px; border-radius: 6px; letter-spacing: 2px;">
                ${newPassword}
              </span>
            </p>
            <p>Logg inn med dette passordet og endre det gjerne til noe du husker bedre.</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Logg inn
              </a>
            </p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);

      console.log('Password reset email sent to:', to);
      return res.status(200).json({ success: true });

    } catch (error) {
      console.error('Error sending password reset email:', error);
      return res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
  });
});

/**
 * Firestore trigger: Notify admin when a new teacher request is submitted
 */
exports.onTeacherRequestCreated = functions.firestore
  .document('teacherRequests/{requestId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    const adminEmail = gmailEmail || 'econsim.no@gmail.com';

    const mailOptions = {
      from: `EconSim <${adminEmail}>`,
      to: adminEmail,
      subject: `📬 Ny lærersøknad: ${data.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Ny lærersøknad mottatt</h2>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr><td style="padding:8px; font-weight:bold; background:#f3f4f6;">Navn</td><td style="padding:8px;">${data.name || '-'}</td></tr>
            <tr><td style="padding:8px; font-weight:bold; background:#f3f4f6;">Skole</td><td style="padding:8px;">${data.school || '-'}</td></tr>
            <tr><td style="padding:8px; font-weight:bold; background:#f3f4f6;">E-post</td><td style="padding:8px;"><a href="mailto:${data.email}">${data.email || '-'}</a></td></tr>
            <tr><td style="padding:8px; font-weight:bold; background:#f3f4f6;">Klasse</td><td style="padding:8px;">${data.className || '-'}</td></tr>
            <tr><td style="padding:8px; font-weight:bold; background:#f3f4f6;">Melding</td><td style="padding:8px;">${data.message || '-'}</td></tr>
            <tr><td style="padding:8px; font-weight:bold; background:#f3f4f6;">Tidspunkt</td><td style="padding:8px;">${new Date(data.createdAt).toLocaleString('nb-NO')}</td></tr>
          </table>
          <p style="margin-top:24px;">Logg inn på EconSim som superadmin for å godkjenne eller avslå søknaden.</p>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('Teacher request notification sent for:', data.name);
    } catch (error) {
      console.error('Failed to send teacher request notification:', error);
    }
  });

/**
 * Scheduled weekly trigger — Mandager kl. 08:00 (norsk tid, UTC+2)
 * Setter et trigger-dokument som klienten oppdager ved neste innlogging
 */
exports.scheduledWeeklyProcessing = functions.pubsub
  .schedule('0 6 * * 1')  // 06:00 UTC = 08:00 CET/CEST
  .timeZone('Europe/Oslo')
  .onRun(async () => {
    const now = new Date();
    const weekKey = `w${now.getFullYear()}-${getWeekNumber(now)}`;

    await admin.firestore().collection('schedulerTriggers').doc(weekKey).set({
      type: 'weekly',
      weekKey,
      triggeredAt: now.toISOString(),
      processed: false
    });

    console.log('Weekly processing trigger created:', weekKey);
    return null;
  });

/**
 * Scheduled monthly trigger — 1. hver måned kl. 08:00 (norsk tid)
 */
exports.scheduledMonthlyProcessing = functions.pubsub
  .schedule('0 6 1 * *')  // 06:00 UTC = 08:00 CET/CEST, 1. i måneden
  .timeZone('Europe/Oslo')
  .onRun(async () => {
    const now = new Date();
    const monthKey = `m${now.getFullYear()}-${now.getMonth() + 1}`;

    await admin.firestore().collection('schedulerTriggers').doc(monthKey).set({
      type: 'monthly',
      monthKey,
      triggeredAt: now.toISOString(),
      processed: false
    });

    console.log('Monthly processing trigger created:', monthKey);
    return null;
  });

/**
 * Scheduled weekly Firestore backup — Sunday 03:00 norsk tid
 *
 * Eksporterer hele Firestore-databasen til Cloud Storage-buckten
 * `gs://econsim-5723c-backups/firestore/<dato>`. Krever at bucken
 * eksisterer og at Cloud Functions service account har rollen
 * `Cloud Datastore Import Export Admin`.
 *
 * Manuell setup første gang:
 *   gsutil mb -l europe-west1 gs://econsim-5723c-backups
 *   gcloud projects add-iam-policy-binding econsim-5723c \
 *     --member="serviceAccount:econsim-5723c@appspot.gserviceaccount.com" \
 *     --role="roles/datastore.importExportAdmin"
 *   gsutil iam ch \
 *     "serviceAccount:econsim-5723c@appspot.gserviceaccount.com:roles/storage.admin" \
 *     gs://econsim-5723c-backups
 *
 * Restore via gcloud:
 *   gcloud firestore import gs://econsim-5723c-backups/firestore/<dato>
 */
exports.scheduledFirestoreBackup = functions.pubsub
  .schedule('0 1 * * 0')  // 01:00 UTC = 03:00 CET söndag
  .timeZone('Europe/Oslo')
  .onRun(async () => {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || 'econsim-5723c';
    const bucketName = `${projectId}-backups`;
    const date = new Date().toISOString().slice(0, 10);
    const outputPrefix = `gs://${bucketName}/firestore/${date}`;

    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/datastore'],
    });
    const authClient = await auth.getClient();
    const accessToken = (await authClient.getAccessToken()).token;

    // Bruk REST API direkte for å unngå ekstra avhengighet til @google-cloud/firestore-admin
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`;

    try {
      const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
      const response = await (await fetch)(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ outputUriPrefix: outputPrefix }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backup failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('Firestore backup started:', result.name, 'output:', outputPrefix);
      return { success: true, operation: result.name, output: outputPrefix };
    } catch (error) {
      console.error('Firestore backup error:', error);
      throw error;
    }
  });

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ============================================================================
// AUTH MIGRATION (2026-05-09): Firebase Auth + Custom Tokens
// ============================================================================

/**
 * One-time schema migration for the Firebase Auth cutover.
 * Idempotent — safe to re-run.
 *
 * Steps:
 *  1. users: rename `password` → `passwordHash`, lowercase `username`, add `locked: false`
 *  2. classrooms: add `locked: false` if missing
 *  3. create users/superadmin doc if missing
 *  4. write report to migrationLog
 *
 * Callable: superadmin (once a superadmin exists). On a fresh DB the call is
 * permitted without auth so the very first migration can run.
 */
exports.migrateAuthSchema = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (context.auth && context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }

    const db = admin.firestore();
    const report = {
      usersRenamedField: 0,
      usersLowercasedUsername: 0,
      usersAddedLocked: 0,
      classroomsAddedLocked: 0,
      superadminCreated: false,
      timestamp: new Date().toISOString(),
    };

    // 1. Users
    const usersSnap = await db.collection('users').get();
    for (const batchDocs of chunkBatches(usersSnap.docs, 500)) {
      const wb = db.batch();
      let ops = 0;
      for (const doc of batchDocs) {
        const u = doc.data();
        const update = {};
        if (u.password && !u.passwordHash) {
          update.passwordHash = u.password;
          update.password = admin.firestore.FieldValue.delete();
          report.usersRenamedField++;
        }
        if (typeof u.username === 'string' && u.username !== u.username.toLowerCase()) {
          update.username = u.username.toLowerCase();
          report.usersLowercasedUsername++;
        }
        if (u.locked === undefined) {
          update.locked = false;
          report.usersAddedLocked++;
        }
        if (Object.keys(update).length > 0) {
          wb.update(doc.ref, update);
          ops++;
        }
      }
      if (ops > 0) await wb.commit();
    }

    // 2. Classrooms
    const classroomsSnap = await db.collection('classrooms').get();
    for (const batchDocs of chunkBatches(classroomsSnap.docs, 500)) {
      const wb = db.batch();
      let ops = 0;
      for (const doc of batchDocs) {
        const c = doc.data();
        if (c.locked === undefined) {
          wb.update(doc.ref, { locked: false });
          report.classroomsAddedLocked++;
          ops++;
        }
      }
      if (ops > 0) await wb.commit();
    }

    // 3. Create users/superadmin if missing
    const superadminRef = db.collection('users').doc('superadmin');
    const superadminDoc = await superadminRef.get();
    if (!superadminDoc.exists) {
      await superadminRef.set({
        username: 'danielalexander',
        passwordHash: '2ab5e704c3ca5eaa7376aeb8faf9493a7baac6fab35b0264d9ff79f8c4804cdb',
        name: 'Superadmin',
        type: 'superadmin',
        classroomId: null,
        accountNumber: null,
        locked: false,
      });
      report.superadminCreated = true;
    }

    // 4. Audit log
    await db.collection('migrationLog').doc(`auth-${report.timestamp}`).set(report);
    return report;
  });

/**
 * Verify SHA-256 password hash against Firestore and issue a Firebase Custom Token
 * with userType / classroomId / accountNumber claims.
 *
 * Returns { token } only; client decodes claims via getIdTokenResult().
 *
 * minInstances: 1 — holder en varm instans alltid for å unngå kald-start
 * (~1-3s) ved første login etter inaktivitet. Koster ~$2-3/mnd.
 */
exports.authenticateUser = functions
  .region('europe-west1')
  .runWith({ minInstances: 1 })
  .https.onCall(async (data) => {
    const username = ((data && data.username) || '').trim().toLowerCase();
    const password = (data && data.password) || '';

    if (!username || !password) {
      throw new functions.https.HttpsError('invalid-argument', 'auth.missingCredentials');
    }

    const usersSnap = await admin.firestore()
      .collection('users')
      .where('username', '==', username)
      .limit(1)
      .get();

    const fail = () => new functions.https.HttpsError('permission-denied', 'auth.invalidCredentials');

    if (usersSnap.empty) {
      await new Promise(r => setTimeout(r, 1000));
      throw fail();
    }

    const userDoc = usersSnap.docs[0];
    const user = userDoc.data();

    if (user.locked === true) {
      throw new functions.https.HttpsError('permission-denied', 'auth.accountLocked');
    }

    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    if (inputHash !== user.passwordHash) {
      await new Promise(r => setTimeout(r, 1000));
      throw fail();
    }

    const claims = {
      userType: user.type,
      classroomId: user.classroomId || null,
      accountNumber: user.accountNumber || null,
    };

    const token = await admin.auth().createCustomToken(userDoc.id, claims);
    return { token };
  });

/**
 * Idempotent demo classroom creation. Public callable — safe because it only
 * writes if the demo classroom doesn't exist yet.
 */
exports.ensureDemoData = functions
  .region('europe-west1')
  .https.onCall(async () => {
    const db = admin.firestore();
    const demoRef = db.collection('classrooms').doc('demo-classroom');
    const existing = await demoRef.get();
    if (existing.exists) return { created: false };

    const initialPath = path.join(__dirname, 'data', 'initial-data.json');
    let initial = { users: [], settings: {} };
    if (fs.existsSync(initialPath)) {
      initial = JSON.parse(fs.readFileSync(initialPath, 'utf8'));
    }

    const batch = db.batch();

    batch.set(demoRef, {
      id: 'demo-classroom',
      teacherId: 't1',
      className: '7A Demo',
      currencyName: 'KlasseKrone',
      currencySymbol: 'KKr',
      startingBalance: 1000,
      locked: false,
      lockedAt: null,
      lockedBy: null,
      lastResetAt: null,
      settings: initial.settings || {},
      createdAt: new Date().toISOString(),
    });

    const teacherHash = crypto.createHash('sha256').update('passord').digest('hex');
    batch.set(db.collection('users').doc('t1'), {
      id: 't1',
      username: 'laerer',
      passwordHash: teacherHash,
      name: 'Demo Lærer',
      accountNumber: '100',
      type: 'teacher',
      balance: 0,
      classroomId: 'demo-classroom',
      locked: false,
    });

    const demoStudents = (initial.users || []).filter(u => u.type === 'student' && u.classroomId === 'demo-classroom');

    if (!demoStudents.find(s => s.username === 'kari123')) {
      demoStudents.push({
        id: 's1', username: 'kari123', password: 'passord123',
        name: 'Kari Nordmann', accountNumber: '101',
        type: 'student', balance: 1000, classroomId: 'demo-classroom',
      });
    }

    for (const s of demoStudents) {
      const hash = crypto.createHash('sha256').update(s.password || 'passord123').digest('hex');
      const studentDoc = {
        id: s.id,
        username: s.username.toLowerCase(),
        passwordHash: hash,
        name: s.name,
        accountNumber: s.accountNumber,
        type: 'student',
        balance: s.balance ?? 1000,
        classroomId: 'demo-classroom',
        locked: false,
      };
      batch.set(db.collection('users').doc(s.id), studentDoc);
    }

    await batch.commit();
    return { created: true, studentsCreated: demoStudents.length };
  });

/**
 * Reset a classroom: snapshot to classroomBackups, then delete all data
 * (transactions, jobs, applications, businesses, loans, savings, funds,
 * notifications, messages, weeklySnapshots) and all student users.
 * Classroom doc and teacher are preserved.
 *
 * Auth: superadmin OR the teacher of that classroom.
 */
exports.resetClassroom = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 180 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'auth.required');
    }
    const { classroomId } = data || {};
    if (!classroomId) {
      throw new functions.https.HttpsError('invalid-argument', 'classroom.idRequired');
    }
    const callerType = context.auth.token.userType;
    const callerClassroom = context.auth.token.classroomId;
    if (callerType !== 'superadmin' && !(callerType === 'teacher' && callerClassroom === classroomId)) {
      throw new functions.https.HttpsError('permission-denied', 'auth.notClassroomTeacher');
    }

    const backupId = await createBackup(classroomId, context.auth.uid, 'reset');
    await deleteAllClassroomData(classroomId);
    const deletedStudents = await deleteClassroomStudents(classroomId);
    await admin.firestore().collection('classrooms').doc(classroomId).update({
      nextStudentNumber: 101,
      nextBusinessNumber: 501,
      lastResetAt: new Date().toISOString(),
    });

    return { backupId, deletedStudents };
  });

/**
 * Reset the demo classroom: backup, delete, reseed from initial-data.json.
 * Only callable by superadmin or the demo teacher (uid === 't1').
 */
exports.resetDemoClassroom = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 300 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'auth.required');
    }
    const callerType = context.auth.token.userType;
    const isDemoTeacher = context.auth.uid === 't1';
    if (callerType !== 'superadmin' && !isDemoTeacher) {
      throw new functions.https.HttpsError('permission-denied', 'demo.onlyDemoTeacherOrSuperadmin');
    }

    const db = admin.firestore();
    const classroomId = 'demo-classroom';
    const backupId = await createBackup(classroomId, context.auth.uid, 'demo-reset');
    await deleteAllClassroomData(classroomId);
    await deleteClassroomStudents(classroomId);

    const initialPath = path.join(__dirname, 'data', 'initial-data.json');
    let initial = { users: [], settings: {} };
    if (fs.existsSync(initialPath)) {
      initial = JSON.parse(fs.readFileSync(initialPath, 'utf8'));
    }

    const demoStudents = (initial.users || []).filter(u => u.type === 'student' && u.classroomId === classroomId);
    if (!demoStudents.find(s => s.username === 'kari123')) {
      demoStudents.push({
        id: 's1', username: 'kari123', password: 'passord123',
        name: 'Kari Nordmann', accountNumber: '101', type: 'student',
        balance: 1000, classroomId,
      });
    }

    const batch = db.batch();
    for (const s of demoStudents) {
      const hash = crypto.createHash('sha256').update(s.password || 'passord123').digest('hex');
      batch.set(db.collection('users').doc(s.id), {
        id: s.id,
        username: s.username.toLowerCase(),
        passwordHash: hash,
        name: s.name,
        accountNumber: s.accountNumber,
        type: 'student',
        balance: s.balance ?? 1000,
        classroomId,
        locked: false,
      });
    }
    if (initial.settings) {
      batch.update(db.collection('classrooms').doc(classroomId), {
        settings: { ...(initial.settings) },
        lastResetAt: new Date().toISOString(),
      });
    }
    await batch.commit();

    return { backupId, studentsRecreated: demoStudents.length };
  });

/**
 * Restore a classroom from a backup. Takes a pre-restore backup of current
 * state first so the operation is reversible. Superadmin only.
 */
exports.restoreClassroom = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const { backupId } = data || {};
    if (!backupId) {
      throw new functions.https.HttpsError('invalid-argument', 'backup.idRequired');
    }

    const db = admin.firestore();
    const backupSnap = await db.collection('classroomBackups').doc(backupId).get();
    if (!backupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'backup.notFound');
    }
    const backup = backupSnap.data();
    const classroomId = backup.classroomId;

    const preRestoreBackupId = await createBackup(classroomId, context.auth.uid, 'pre-restore');

    await deleteAllClassroomData(classroomId);
    await deleteClassroomStudents(classroomId);

    for (const col of CLASSROOM_DATA_COLLECTIONS) {
      const docs = backup[col] || [];
      for (const batchDocs of chunkBatches(docs, 500)) {
        const wb = db.batch();
        batchDocs.forEach(d => {
          const { id, ...rest } = d;
          wb.set(db.collection(col).doc(id), rest);
        });
        if (batchDocs.length > 0) await wb.commit();
      }
    }
    const users = backup.users || [];
    for (const batchDocs of chunkBatches(users, 500)) {
      const wb = db.batch();
      batchDocs.forEach(d => {
        const { id, ...rest } = d;
        wb.set(db.collection('users').doc(id), rest);
      });
      if (batchDocs.length > 0) await wb.commit();
    }
    if (backup.classroom) {
      const { id, ...rest } = backup.classroom;
      await db.collection('classrooms').doc(id).set(rest);
    }

    return { restoredFromBackup: backupId, preRestoreBackupId };
  });

/**
 * List backups (metadata only). Superadmin only.
 * Optional filter by classroomId.
 */
exports.listBackups = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const filter = data && data.classroomId;
    let q;
    if (filter) {
      q = admin.firestore().collection('classroomBackups')
        .where('classroomId', '==', filter)
        .orderBy('createdAt', 'desc')
        .limit(200);
    } else {
      q = admin.firestore().collection('classroomBackups')
        .orderBy('createdAt', 'desc')
        .limit(200);
    }
    const snap = await q.get();
    return {
      backups: snap.docs.map(d => {
        const b = d.data();
        return {
          id: d.id,
          classroomId: b.classroomId,
          createdAt: b.createdAt,
          createdBy: b.createdBy,
          reason: b.reason,
          counts: {
            users: (b.users || []).length,
            transactions: (b.transactions || []).length,
            jobs: (b.jobs || []).length,
            businesses: (b.businesses || []).length,
          },
        };
      }),
    };
  });

/**
 * Return full backup document for preview. Superadmin only.
 */
exports.previewBackup = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const { backupId } = data || {};
    const snap = await admin.firestore().collection('classroomBackups').doc(backupId).get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'backup.notFound');
    return snap.data();
  });

/**
 * Delete a backup. Superadmin only.
 */
exports.deleteBackup = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const { backupId } = data || {};
    await admin.firestore().collection('classroomBackups').doc(backupId).delete();
    return { deleted: backupId };
  });

/**
 * Lock or unlock a classroom + its teacher. Superadmin only.
 * Locking also revokes the teacher's Firebase Auth refresh tokens.
 */
exports.setClassroomLocked = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const { classroomId, locked } = data || {};
    if (!classroomId || typeof locked !== 'boolean') {
      throw new functions.https.HttpsError('invalid-argument', 'lock.argsRequired');
    }

    const db = admin.firestore();
    const classroomRef = db.collection('classrooms').doc(classroomId);
    const classroomDoc = await classroomRef.get();
    if (!classroomDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'classroom.notFound');
    }
    const teacherId = classroomDoc.data().teacherId;

    const batch = db.batch();
    batch.update(classroomRef, {
      locked,
      lockedAt: locked ? new Date().toISOString() : null,
      lockedBy: locked ? context.auth.uid : null,
    });
    if (teacherId) {
      batch.update(db.collection('users').doc(teacherId), { locked });
    }
    await batch.commit();

    if (locked && teacherId) {
      try {
        await admin.auth().revokeRefreshTokens(teacherId);
      } catch (err) {
        console.warn('revokeRefreshTokens failed (user may not exist in Firebase Auth yet):', err.message);
      }
    }

    return { classroomId, teacherId, locked };
  });

/**
 * Scheduled cleanup of classroomBackups older than 90 days.
 * Sunday 04:00 norwegian time (02:00 UTC).
 */
exports.cleanOldBackups = functions
  .region('europe-west1')
  .pubsub.schedule('0 2 * * 0')
  .timeZone('Europe/Oslo')
  .onRun(async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const snap = await admin.firestore()
      .collection('classroomBackups')
      .where('createdAt', '<', cutoff)
      .get();
    const batch = admin.firestore().batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    if (snap.size > 0) await batch.commit();
    console.log(`cleanOldBackups: removed ${snap.size} backups older than 90 days`);
    return null;
  });
