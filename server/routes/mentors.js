const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { getMessaging } = require('firebase-admin/messaging');

async function sendFcmPush(app, token, title, body, data) {
  if (!app || !token) return;
  try {
    await getMessaging(app).send({ token, data: { title, body, type: 'mentor_message', ...data } });
  } catch (err) {
    if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
      const db = await getDb();
      await db.execute({ sql: "UPDATE users SET fcmToken = '' WHERE fcmToken = ?", args: [token] });
    }
    console.error('[mentors] FCM send failed:', err.message);
  }
}

async function checkMentorAuth(username, mentorUsername) {
  const db = await getDb();
  const row = await db.execute({
    sql: 'SELECT 1 FROM mentors WHERE username = ? AND mentorUsername = ?',
    args: [username, mentorUsername],
  });
  return row.rows.length > 0;
}

// Add a mentor
router.post('/', async (req, res) => {
  try {
    const { mentorUsername } = req.body;
    if (!mentorUsername) return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم للمرشد' });
    if (mentorUsername === req.user.username) return res.status(400).json({ error: 'لا يمكنك إضافة نفسك كمرشد' });

    const db = await getDb();
    const exists = await db.execute({ sql: 'SELECT username FROM users WHERE username = ?', args: [mentorUsername] });
    if (exists.rows.length === 0) return res.status(404).json({ error: 'المستخدم غير موجود' });

    await db.execute({
      sql: 'INSERT INTO mentors (username, mentorUsername) VALUES (?, ?)',
      args: [req.user.username, mentorUsername],
    });
    res.json({ success: true });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'المرشد مضاف مسبقاً' });
    res.status(500).json({ error: e.message });
  }
});

// List my mentors
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.execute({
      sql: `SELECT m.mentorUsername, u.name, u.mobile, m.createdAt
            FROM mentors m JOIN users u ON u.username = m.mentorUsername
            WHERE m.username = ? ORDER BY m.createdAt DESC`,
      args: [req.user.username],
    });
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove a mentor
router.delete('/:mentorUsername', async (req, res) => {
  try {
    const db = await getDb();
    await db.execute({
      sql: 'DELETE FROM mentors WHERE username = ? AND mentorUsername = ?',
      args: [req.user.username, req.params.mentorUsername],
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List my mentees
router.get('/mentees', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.execute({
      sql: `SELECT m.username, u.name, u.mobile, u.age, u.gender, m.createdAt
            FROM mentors m JOIN users u ON u.username = m.username
            WHERE m.mentorUsername = ? ORDER BY m.createdAt DESC`,
      args: [req.user.username],
    });
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get mentee's sessions
router.get('/mentee/:user/sessions', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });

    const db = await getDb();
    const rows = await db.execute({
      sql: `SELECT s.*, mn.id AS noteId, mn.note AS mentorNote, mn.createdAt AS noteDate
            FROM sessions s
            LEFT JOIN mentor_notes mn ON mn.sessionId = s.id AND mn.mentorUsername = ?
            WHERE s.username = ? ORDER BY s.createdAt DESC`,
      args: [req.user.username, req.params.user],
    });

    // Group notes into sessions
    const sessionMap = new Map();
    for (const row of rows.rows) {
      if (!sessionMap.has(row.id)) {
        sessionMap.set(row.id, { ...row, notes: [] });
      }
      if (row.noteId) {
        sessionMap.get(row.id).notes.push({ id: row.noteId, note: row.mentorNote, createdAt: row.noteDate });
      }
    }

    res.json([...sessionMap.values()]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get mentee's medications
router.get('/mentee/:user/meds', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });

    const db = await getDb();
    const meds = await db.execute({
      sql: 'SELECT * FROM medications WHERE username = ? ORDER BY createdAt DESC',
      args: [req.params.user],
    });
    for (const med of meds.rows) {
      const doses = await db.execute({
        sql: 'SELECT * FROM medication_doses WHERE medicationId = ? ORDER BY id',
        args: [med.id],
      });
      med.doses = doses.rows;
    }
    res.json(meds.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get mentee's medication log for a date
router.get('/mentee/:user/meds/log/:date', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });

    const db = await getDb();
    const rows = await db.execute({
      sql: 'SELECT * FROM medication_log WHERE username = ? AND date = ?',
      args: [req.params.user, req.params.date],
    });
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get mentee's latest nutrition
router.get('/mentee/:user/nutrition', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });

    const db = await getDb();
    const rows = await db.execute({
      sql: "SELECT * FROM sessions WHERE username = ? AND type = 'nutrition' ORDER BY createdAt DESC LIMIT 1",
      args: [req.params.user],
    });
    if (rows.rows.length === 0) return res.json(null);
    const session = rows.rows[0];
    if (session.result && typeof session.result === 'string') {
      try { session.result = JSON.parse(session.result); } catch (e) {}
    }
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add note to mentee's session
router.post('/mentee/:user/note', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });
    const { sessionId, note } = req.body;
    if (!sessionId || !note) return res.status(400).json({ error: 'sessionId و note مطلوبان' });

    const db = await getDb();
    const r = await db.execute({
      sql: 'INSERT INTO mentor_notes (sessionId, mentorUsername, note) VALUES (?, ?, ?)',
      args: [sessionId, req.user.username, note],
    });
    res.json({ id: r.lastInsertRowid, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark mentee's medication as taken
router.post('/mentee/:user/med-log', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });
    const { medicationId, doseIdx, date } = req.body;
    if (!medicationId || doseIdx === undefined || !date) return res.status(400).json({ error: 'بيانات ناقصة' });

    const db = await getDb();
    const existing = await db.execute({
      sql: 'SELECT id FROM medication_log WHERE username = ? AND medicationId = ? AND doseIdx = ? AND date = ?',
      args: [req.params.user, medicationId, doseIdx, date],
    });
    if (existing.rows.length > 0) return res.json({ alreadyLogged: true });

    await db.execute({
      sql: 'INSERT INTO medication_log (username, medicationId, doseIdx, date) VALUES (?, ?, ?, ?)',
      args: [req.params.user, medicationId, doseIdx, date],
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add medication for mentee
router.post('/mentee/:user/meds', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });
    const { id, name, dose, form, food, urgent, note, icon, color, doses } = req.body;
    if (!id || !name || !dose) return res.status(400).json({ error: 'id, name, dose مطلوبون' });

    const db = await getDb();
    await db.execute({
      sql: 'INSERT OR REPLACE INTO medications (id, username, name, dose, form, food, urgent, note, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, req.params.user, name, dose, form || 'Pill', food || '', urgent ? 1 : 0, note || '', icon || '', color || ''],
    });

    if (doses && Array.isArray(doses)) {
      await db.execute({ sql: 'DELETE FROM medication_doses WHERE medicationId = ?', args: [id] });
      for (const d of doses) {
        await db.execute({
          sql: 'INSERT INTO medication_doses (medicationId, time) VALUES (?, ?)',
          args: [id, d.time || '08:00'],
        });
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete mentee's medication
router.delete('/mentee/:user/meds/:medId', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });

    const db = await getDb();
    await db.execute({ sql: 'DELETE FROM notification_log WHERE medicationId = ? AND username = ?', args: [req.params.medId, req.params.user] });
    await db.execute({ sql: 'DELETE FROM medication_log WHERE medicationId = ? AND username = ?', args: [req.params.medId, req.params.user] });
    await db.execute({ sql: 'DELETE FROM medication_doses WHERE medicationId = ?', args: [req.params.medId] });
    await db.execute({ sql: 'DELETE FROM medications WHERE id = ? AND username = ?', args: [req.params.medId, req.params.user] });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send message to mentee
router.post('/mentee/:user/chat', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصري لك بالوصول' });
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message مطلوب' });

    const db = await getDb();
    const r = await db.execute({
      sql: 'INSERT INTO mentor_messages (username, mentorUsername, message, role) VALUES (?, ?, ?, ?)',
      args: [req.params.user, req.user.username, message, 'mentor'],
    });

    // Send FCM notification to mentee
    const mentee = await db.execute({
      sql: 'SELECT fcmToken, name FROM users WHERE username = ?',
      args: [req.params.user],
    });
    if (mentee.rows.length > 0) {
      const menteeName = req.user.name || req.user.username;
      await sendFcmPush(
        req.app.get('fcmApp'),
        mentee.rows[0].fcmToken,
        `📩 رسالة من المشرف ${menteeName}`,
        message.length > 100 ? message.slice(0, 100) + '…' : message,
        { mentorUsername: req.user.username, username: req.params.user }
      );
    }

    res.json({ id: r.lastInsertRowid, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get chat messages with mentee
router.get('/mentee/:user/chat', async (req, res) => {
  try {
    const isAuth = await checkMentorAuth(req.params.user, req.user.username);
    if (!isAuth) return res.status(403).json({ error: 'غير مصرح لك بالوصول' });

    const db = await getDb();
    const rows = await db.execute({
      sql: 'SELECT * FROM mentor_messages WHERE username = ? AND mentorUsername = ? ORDER BY createdAt ASC',
      args: [req.params.user, req.user.username],
    });
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mentee replies to a mentor
router.post('/reply', async (req, res) => {
  try {
    const { mentorUsername, message } = req.body;
    if (!mentorUsername || !message) return res.status(400).json({ error: 'mentorUsername و message مطلوبان' });

    // Verify this user is actually a mentee of this mentor
    const db = await getDb();
    const rel = await db.execute({
      sql: 'SELECT 1 FROM mentors WHERE username = ? AND mentorUsername = ?',
      args: [req.user.username, mentorUsername],
    });
    if (rel.rows.length === 0) return res.status(403).json({ error: 'هذا المستخدم ليس مرشدًا لك' });

    const r = await db.execute({
      sql: 'INSERT INTO mentor_messages (username, mentorUsername, message, role) VALUES (?, ?, ?, ?)',
      args: [req.user.username, mentorUsername, message, 'mentee'],
    });

    // Send FCM notification to mentor
    const mentor = await db.execute({
      sql: 'SELECT fcmToken FROM users WHERE username = ?',
      args: [mentorUsername],
    });
    const menteeName = req.user.name || req.user.username;
    if (mentor.rows.length > 0) {
      await sendFcmPush(
        req.app.get('fcmApp'),
        mentor.rows[0].fcmToken,
        `📩 رد من ${menteeName}`,
        message.length > 100 ? message.slice(0, 100) + '…' : message,
        { menteeUsername: req.user.username, mentorUsername }
      );
    }

    res.json({ id: r.lastInsertRowid, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get my messages from all mentors (for the mentee)
router.get('/messages', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.execute({
      sql: `SELECT mm.*, u.name AS mentorName
            FROM mentor_messages mm
            JOIN users u ON u.username = mm.mentorUsername
            WHERE mm.username = ?
            ORDER BY mm.createdAt DESC
            LIMIT 100`,
      args: [req.user.username],
    });
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
