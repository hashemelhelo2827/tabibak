// routes/notif-debug.js
//
// Temporary diagnostic route — mount this in index.js to self-check why
// push notifications aren't reaching a closed tab:
//
//   const notifDebugRoutes = require('./routes/notif-debug');
//   app.use('/api/notif-debug', authenticateToken, notifDebugRoutes);
//
// Then, while logged in, visit (with your JWT attached, e.g. via the
// app's own fetch helper in devtools console):
//
//   await api('GET', '/api/notif-debug')
//
// It reveals (without leaking secret values):
//   - whether FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//     are present in the server's environment at all
//   - whether the current user has a non-empty fcmToken saved in the DB
//   - the user's stored timezoneOffset (a common source of "reminders
//     fire at the wrong time" bugs)
//
// Remove this route once you've diagnosed the issue — it's for
// debugging only and should not stay in a production deployment.

const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.execute({
      sql: 'SELECT fcmToken, timezoneOffset FROM users WHERE username = ?',
      args: [req.user.username],
    });
    const user = result.rows[0];

    res.json({
      firebaseEnvVarsPresent: {
        FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
      },
      yourAccount: {
        hasFcmToken: !!(user && user.fcmToken),
        fcmTokenPreview: user && user.fcmToken ? user.fcmToken.slice(0, 12) + '\u2026' : null,
        timezoneOffset: user ? user.timezoneOffset : null,
      },
      note: 'If firebaseEnvVarsPresent has any false value, push to a closed tab can never work \u2014 set the missing Railway variable(s). If hasFcmToken is false, re-open the app, log in, and click "Enable Notifications" again.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
