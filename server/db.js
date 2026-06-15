const { createClient } = require('@libsql/client');
const path = require('path');

let db;
let initPromise = null;

async function getDb() {
  if (!db) {
    const url = process.env.TURSO_DB_URL;
    const authToken = process.env.TURSO_DB_TOKEN;

    if (url && authToken) {
      db = createClient({ url, authToken });
    } else {
      const filePath = path.join(__dirname, 'tabibak.db');
      db = createClient({ url: `file:${filePath}` });
    }

    initPromise = initSchema();
    await initPromise;
  } else if (initPromise) {
    await initPromise;
  }
  return db;
}

async function initSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      mobile TEXT,
      history TEXT DEFAULT '',
      fcmToken TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'triage',
      result TEXT NOT NULL,
      details TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (username) REFERENCES users(username)
    )`,
    `CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      name TEXT NOT NULL,
      dose TEXT NOT NULL,
      form TEXT NOT NULL DEFAULT 'Pill',
      food TEXT DEFAULT '',
      urgent INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      color TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (username) REFERENCES users(username)
    )`,
    `CREATE TABLE IF NOT EXISTS medication_doses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicationId TEXT NOT NULL,
      time TEXT NOT NULL,
      FOREIGN KEY (medicationId) REFERENCES medications(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS medication_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      medicationId TEXT NOT NULL,
      doseIdx INTEGER NOT NULL,
      date TEXT NOT NULL,
      takenAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (username) REFERENCES users(username),
      FOREIGN KEY (medicationId) REFERENCES medications(id)
    )`,
  ];
  for (const sql of statements) {
    await db.execute(sql);
  }
}

module.exports = { getDb };
