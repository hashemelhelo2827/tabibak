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

    try { await db.execute('PRAGMA foreign_keys = ON'); } catch (e) { }

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
      FOREIGN KEY (medicationId) REFERENCES medications(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      medicationId TEXT NOT NULL,
      doseId INTEGER NOT NULL,
      doseTime TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'medication_reminder',
      sentAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (username) REFERENCES users(username),
      FOREIGN KEY (medicationId) REFERENCES medications(id) ON DELETE CASCADE,
      FOREIGN KEY (doseId) REFERENCES medication_doses(id)
    )`,
    `CREATE TABLE IF NOT EXISTS mentors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      mentorUsername TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
      FOREIGN KEY (mentorUsername) REFERENCES users(username) ON DELETE CASCADE,
      UNIQUE(username, mentorUsername)
    )`,
    `CREATE TABLE IF NOT EXISTS mentor_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL,
      mentorUsername TEXT NOT NULL,
      note TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS mentor_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      mentorUsername TEXT NOT NULL,
      message TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'mentor',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
      FOREIGN KEY (mentorUsername) REFERENCES users(username) ON DELETE CASCADE
    )`,
  ];
  for (const sql of statements) {
    await db.execute(sql);
  }
  try { await db.execute('ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT \'\''); } catch (e) { }
  try { await db.execute('ALTER TABLE sessions ADD COLUMN images TEXT DEFAULT \'\''); } catch (e) { }
  try { await db.execute('ALTER TABLE users ADD COLUMN timezoneOffset REAL DEFAULT 3'); } catch (e) { }
  try { await db.execute('ALTER TABLE users ADD COLUMN email TEXT DEFAULT \'\''); } catch (e) { }
  try { await db.execute('ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0'); } catch (e) { }
  try { await db.execute('ALTER TABLE users ADD COLUMN verificationCode TEXT DEFAULT \'\''); } catch (e) { }
  try { await db.execute('ALTER TABLE users ADD COLUMN verificationCodeExpires TEXT DEFAULT \'\''); } catch (e) { }
  try { await db.execute('ALTER TABLE users ADD COLUMN googleId TEXT DEFAULT \'\''); } catch (e) { }
  try { await db.execute('ALTER TABLE notification_log ADD COLUMN type TEXT NOT NULL DEFAULT \'medication_reminder\''); } catch (e) { }
}

module.exports = { getDb };
