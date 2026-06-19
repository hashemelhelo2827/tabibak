const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { getDb } = require('../db');
const { generateToken, authenticateToken } = require('../auth');
const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/register', async (req, res) => {
  try {
    const { username, password, name, age, gender, mobile, history, timezoneOffset } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }
    // Strong password regex check
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long, contain at least one lowercase letter, one uppercase letter, one number, and one special character.' });
    }
    const db = await getDb();
    const existing = await db.execute({ sql: 'SELECT username FROM users WHERE username = ?', args: [username] });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    await db.execute({
      sql: 'INSERT INTO users (username, passwordHash, name, age, gender, mobile, history, timezoneOffset) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [username, passwordHash, name, age || null, gender || null, mobile || null, history || '', timezoneOffset ?? 0],
    });
    const token = generateToken(username);
    res.status(201).json({ token, username, name, timezoneOffset: timezoneOffset ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password, timezoneOffset } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const db = await getDb();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (timezoneOffset !== undefined) {
      await db.execute({
        sql: 'UPDATE users SET timezoneOffset = ? WHERE username = ?',
        args: [timezoneOffset, username],
      });
    }
    const token = generateToken(username);
    const { passwordHash, ...profile } = user;
    profile.timezoneOffset = timezoneOffset ?? user.timezoneOffset ?? 0;
    res.json({ token, ...profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential required' });
    }
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Google account has no email' });
    }

    const db = await getDb();
    const existing = await db.execute({
      sql: 'SELECT * FROM users WHERE googleId = ? OR email = ?',
      args: [googleId, email],
    });

    let username;
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      username = user.username;
      await db.execute({
        sql: 'UPDATE users SET emailVerified = 1 WHERE username = ?',
        args: [username],
      });
    } else {
      let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      username = baseUsername;
      let suffix = 1;
      while (true) {
        const check = await db.execute({
          sql: 'SELECT username FROM users WHERE username = ?',
          args: [username],
        });
        if (check.rows.length === 0) break;
        username = `${baseUsername}${suffix}`;
        suffix++;
      }
      const passwordHash = bcrypt.hashSync(googleId, 10);
      await db.execute({
        sql: 'INSERT INTO users (username, passwordHash, name, email, googleId, emailVerified) VALUES (?, ?, ?, ?, ?, 1)',
        args: [username, passwordHash, name || email.split('@')[0], email, googleId],
      });
    }

    const token = generateToken(username);
    const fullUser = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username],
    });
    const user = fullUser.rows[0];
    const { passwordHash, verificationCode, verificationCodeExpires, ...profile } = user;
    res.json({ token, ...profile });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(401).json({ error: err.message || 'Invalid Google credential' });
  }
});

router.post('/verify-code', async (req, res) => {
  try {
    const { username, code } = req.body;
    if (!username || !code) {
      return res.status(400).json({ error: 'Username and code are required' });
    }
    const db = await getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username],
    });
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.verificationCode || !user.verificationCodeExpires) {
      return res.status(400).json({ error: 'No verification code sent. Please login again.' });
    }
    if (user.verificationCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    if (new Date(user.verificationCodeExpires) < new Date()) {
      return res.status(400).json({ error: 'Verification code expired. Please login again.' });
    }

    await db.execute({
      sql: 'UPDATE users SET emailVerified = 1, verificationCode = \'\', verificationCodeExpires = \'\' WHERE username = ?',
      args: [username],
    });

    const token = generateToken(username);
    const { passwordHash, verificationCode, verificationCodeExpires, ...profile } = user;
    profile.emailVerified = 1;
    res.json({ token, ...profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
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
    const { name, age, gender, mobile, history, timezoneOffset } = req.body;
    const db = await getDb();
    await db.execute({
      sql: 'UPDATE users SET name = ?, age = ?, gender = ?, mobile = ?, history = ?, timezoneOffset = COALESCE(?, timezoneOffset) WHERE username = ?',
      args: [name, age || null, gender || null, mobile || null, history || '', timezoneOffset !== undefined ? timezoneOffset : null, req.user.username],
    });
    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/avatar', authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    const db = await getDb();
    await db.execute({
      sql: 'UPDATE users SET avatar = ? WHERE username = ?',
      args: [avatar || '', req.user.username],
    });
    res.json({ message: 'Avatar updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
