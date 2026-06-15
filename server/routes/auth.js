const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { generateToken, authenticateToken } = require('../auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password, name, age, gender, mobile, history } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }
    const db = getDb();
    const existing = await db.execute({ sql: 'SELECT username FROM users WHERE username = ?', args: [username] });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    await db.execute({
      sql: 'INSERT INTO users (username, passwordHash, name, age, gender, mobile, history) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [username, passwordHash, name, age || null, gender || null, mobile || null, history || ''],
    });
    const token = generateToken(username);
    res.status(201).json({ token, username, name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = generateToken(username);
    const { passwordHash, ...profile } = user;
    res.json({ token, ...profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [req.user.username] });
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { passwordHash, ...profile } = user;
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, age, gender, mobile, history } = req.body;
    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET name = ?, age = ?, gender = ?, mobile = ?, history = ? WHERE username = ?',
      args: [name, age || null, gender || null, mobile || null, history || '', req.user.username],
    });
    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
