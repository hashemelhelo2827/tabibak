const cron = require('node-cron');
const admin = require('firebase-admin');
const { getDb } = require('./db');

let schedulerStarted = false;

function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined,
  };

  let fcmReady = false;
  if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
    try {
      if (admin.apps && admin.apps.length === 0) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      }
      fcmReady = true;
      console.log('Firebase Admin initialized for push notifications');
    } catch (err) {
      console.error('Firebase Admin init failed:', err.message);
    }
  } else {
    // IMPORTANT: if you see this on every boot, push notifications can NEVER
    // be delivered while the tab is closed, no matter what the client does.
    // Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
    // in Railway -> Variables using the values from your service account JSON.
    console.warn('[scheduler] Firebase credentials not set — push notifications are DISABLED. ' +
      'Reminders will only work while a browser tab is open.');
  }

  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const db = await getDb();

      // Get all users with FCM tokens for timezone-aware comparison
      const sql = `
        SELECT md.id AS doseId, md.time AS doseTime,
               m.id AS medicationId, m.name AS medName, m.dose AS medDose,
               u.username, u.fcmToken, COALESCE(u.timezoneOffset, 0) AS tzOffset
        FROM medication_doses md
        JOIN medications m ON m.id = md.medicationId
        JOIN users u ON u.username = m.username
        WHERE u.fcmToken IS NOT NULL
          AND u.fcmToken != ''
      `;
      const allRows = await db.execute(sql);

      const targetUtc = new Date(now.getTime() + 5 * 60000);

      for (const row of allRows.rows) {
        const tz = Number(row.tzOffset);
        // Convert target UTC time to user's local time
        const targetLocal = new Date(targetUtc.getTime() + tz * 3600000);
        const targetHH = String(targetLocal.getHours()).padStart(2, '0');
        const targetMM = String(targetLocal.getMinutes()).padStart(2, '0');
        const targetTime = `${targetHH}:${targetMM}`;

        if (row.doseTime !== targetTime) continue;

        const alreadySent = await db.execute({
          sql: 'SELECT id FROM notification_log WHERE username = ? AND medicationId = ? AND doseId = ? AND date = ?',
          args: [row.username, row.medicationId, row.doseId, today],
        });

        if (alreadySent.rows.length > 0) continue;

        if (!fcmReady) {
          // Firebase isn't configured at all — don't pretend we tried.
          // Skip without writing to notification_log so a retry is still
          // possible once credentials are fixed (within the 5-minute window).
          continue;
        }

        if (!row.fcmToken) {
          // Shouldn't happen given the WHERE clause above, but guard anyway.
          continue;
        }

        let sendSucceeded = false;
        try {
          await admin.messaging().send({
            token: row.fcmToken,
            data: {
              title: 'تذكير بالدواء',
              body: `حان موعد ${row.medName} (${row.medDose}) بعد 5 دقائق`,
              medicationId: row.medicationId,
              doseTime: row.doseTime,
              type: 'medication_reminder',
            },
          });
          console.log(`FCM sent to ${row.username} for ${row.medName} at ${row.doseTime}`);
          sendSucceeded = true;
        } catch (err) {
          console.error(`FCM failed for ${row.username}:`, err.message);
          if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
            await db.execute({
              sql: "UPDATE users SET fcmToken = '' WHERE username = ?",
              args: [row.username],
            });
          }
          // Do NOT write to notification_log on failure — this lets the
          // next cron tick (still within the 5-minute window) retry instead
          // of silently treating the dose as "handled" forever.
          continue;
        }

        if (sendSucceeded) {
          await db.execute({
            sql: 'INSERT INTO notification_log (username, medicationId, doseId, doseTime, date) VALUES (?, ?, ?, ?, ?)',
            args: [row.username, row.medicationId, row.doseId, row.doseTime, today],
          });
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  });

  console.log('Notification scheduler started (every minute)');
}

module.exports = { startScheduler };
