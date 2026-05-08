/**
 * Firebase Cloud Functions for EconSim
 * Håndterer e-postsending via Gmail SMTP
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors')({ origin: true });

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
