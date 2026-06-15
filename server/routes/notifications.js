const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.post('/store-token', async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken is required' });
    }
    const db = await getDb();
    await db.execute({
      sql: 'UPDATE users SET fcmToken = ? WHERE username = ?',
      args: [fcmToken, req.user.username],
    });
    res.json({ status: 'success', message: 'FCM registration token stored successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
