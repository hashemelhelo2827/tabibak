const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const medsResult = await db.execute({
      sql: 'SELECT * FROM medications WHERE username = ? ORDER BY createdAt DESC',
      args: [req.user.username],
    });
    const dosesResult = await db.execute({
      sql: 'SELECT * FROM medication_doses WHERE medicationId IN (SELECT id FROM medications WHERE username = ?)',
      args: [req.user.username],
    });
    const doses = dosesResult.rows;
    const result = medsResult.rows.map(m => ({
      ...m,
      urgent: !!m.urgent,
      doses: doses.filter(d => d.medicationId === m.id).map(d => ({ time: d.time })),
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id, name, dose, form, food, urgent, note, icon, color, doses } = req.body;
    if (!name || !dose) {
      return res.status(400).json({ error: 'Name and dose are required' });
    }
    const db = getDb();
    const medId = id || String(Date.now());
    await db.execute({
      sql: 'INSERT OR REPLACE INTO medications (id, username, name, dose, form, food, urgent, note, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [medId, req.user.username, name, dose, form || 'Pill', food || '', urgent ? 1 : 0, note || '', icon || '', color || ''],
    });
    await db.execute({
      sql: 'DELETE FROM medication_doses WHERE medicationId = ?',
      args: [medId],
    });
    if (doses && Array.isArray(doses)) {
      for (const d of doses) {
        await db.execute({
          sql: 'INSERT INTO medication_doses (medicationId, time) VALUES (?, ?)',
          args: [medId, d.time],
        });
      }
    }
    const saved = await db.execute({ sql: 'SELECT * FROM medications WHERE id = ?', args: [medId] });
    const med = saved.rows[0];
    const io = req.app.get('io');
    io.to(`user:${req.user.username}`).emit('medications:updated', { action: 'created', medication: { ...med, urgent: !!med.urgent } });
    res.status(201).json({ ...med, urgent: !!med.urgent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const med = await db.execute({
      sql: 'SELECT * FROM medications WHERE id = ? AND username = ?',
      args: [req.params.id, req.user.username],
    });
    if (!med.rows[0]) {
      return res.status(404).json({ error: 'Medication not found' });
    }
    await db.execute({ sql: 'DELETE FROM medications WHERE id = ?', args: [req.params.id] });
    const io = req.app.get('io');
    io.to(`user:${req.user.username}`).emit('medications:updated', { action: 'deleted', id: req.params.id });
    res.json({ message: 'Medication deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/log', async (req, res) => {
  try {
    const { medicationId, doseIdx, date } = req.body;
    if (!medicationId || doseIdx === undefined || !date) {
      return res.status(400).json({ error: 'medicationId, doseIdx, and date are required' });
    }
    const db = getDb();
    const existing = await db.execute({
      sql: 'SELECT id FROM medication_log WHERE username = ? AND medicationId = ? AND doseIdx = ? AND date = ?',
      args: [req.user.username, medicationId, doseIdx, date],
    });
    if (existing.rows[0]) {
      return res.json({ message: 'Already logged', id: existing.rows[0].id });
    }
    const result = await db.execute({
      sql: 'INSERT INTO medication_log (username, medicationId, doseIdx, date) VALUES (?, ?, ?, ?)',
      args: [req.user.username, medicationId, doseIdx, date],
    });
    const io = req.app.get('io');
    io.to(`user:${req.user.username}`).emit('medications:dose-logged', { medicationId, doseIdx, date });
    res.status(201).json({ message: 'Logged', id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/log/:date', async (req, res) => {
  try {
    const db = getDb();
    const logs = await db.execute({
      sql: 'SELECT * FROM medication_log WHERE username = ? AND date = ?',
      args: [req.user.username, req.params.date],
    });
    res.json(logs.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
