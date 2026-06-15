const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const sessions = await db.execute({
      sql: 'SELECT * FROM sessions WHERE username = ? ORDER BY createdAt DESC',
      args: [req.user.username],
    });
    res.json(sessions.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { type, result, details } = req.body;
    if (!result) {
      return res.status(400).json({ error: 'Result is required' });
    }
    const db = await getDb();
    const info = await db.execute({
      sql: 'INSERT INTO sessions (username, type, result, details) VALUES (?, ?, ?, ?)',
      args: [req.user.username, type || 'triage', result, details || ''],
    });
    const session = await db.execute({
      sql: 'SELECT * FROM sessions WHERE id = ?',
      args: [Number(info.lastInsertRowid)],
    });
    const io = req.app.get('io');
    io.to(`user:${req.user.username}`).emit('sessions:created', session.rows[0]);
    res.status(201).json(session.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const session = await db.execute({
      sql: 'SELECT * FROM sessions WHERE id = ? AND username = ?',
      args: [req.params.id, req.user.username],
    });
    if (!session.rows[0]) {
      return res.status(404).json({ error: 'Session not found' });
    }
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
