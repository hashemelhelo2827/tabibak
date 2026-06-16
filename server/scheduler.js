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
    console.log('Firebase credentials not set — notifications will be server-logged only');
  }

  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const target = new Date(now.getTime() + 5 * 60000);
      const targetHH = String(target.getHours()).padStart(2, '0');
      const targetMM = String(target.getMinutes()).padStart(2, '0');
      const targetTime = `${targetHH}:${targetMM}`;
      const today = now.toISOString().slice(0, 10);

      const db = await getDb();
      const rows = await db.execute({
        sql: `
          SELECT md.id AS doseId, md.time AS doseTime,
                 m.id AS medicationId, m.name AS medName, m.dose AS medDose,
                 u.username, u.fcmToken
          FROM medication_doses md
          JOIN medications m ON m.id = md.medicationId
          JOIN users u ON u.username = m.username
          WHERE md.time = ?
            AND u.fcmToken IS NOT NULL
            AND u.fcmToken != ''
        `,
        args: [targetTime],
      });

      for (const row of rows.rows) {
        const alreadySent = await db.execute({
          sql: 'SELECT id FROM notification_log WHERE username = ? AND medicationId = ? AND doseId = ? AND date = ?',
          args: [row.username, row.medicationId, row.doseId, today],
        });

        if (alreadySent.rows.length > 0) continue;

        if (fcmReady && row.fcmToken) {
          try {
            await admin.messaging().send({
              token: row.fcmToken,
              notification: {
                title: 'تذكير بالدواء',
                body: `حان موعد ${row.medName} (${row.medDose}) بعد 5 دقائق`,
              },
              data: {
                medicationId: row.medicationId,
                doseTime: row.doseTime,
                type: 'medication_reminder',
              },
            });
            console.log(`FCM sent to ${row.username} for ${row.medName} at ${row.doseTime}`);
          } catch (err) {
            console.error(`FCM failed for ${row.username}:`, err.message);
            if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
              await db.execute({
                sql: 'UPDATE users SET fcmToken = \'\' WHERE username = ?',
                args: [row.username],
              });
            }
            continue;
          }
        }

        await db.execute({
          sql: 'INSERT INTO notification_log (username, medicationId, doseId, doseTime, date) VALUES (?, ?, ?, ?, ?)',
          args: [row.username, row.medicationId, row.doseId, row.doseTime, today],
        });
      }
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  });

  console.log('Notification scheduler started (every minute)');
}

module.exports = { startScheduler };
