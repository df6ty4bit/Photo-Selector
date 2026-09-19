const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Uses Node's built-in SQLite module (available in Node 22.5+, no flag needed
// from Node ~23.4+) instead of a native npm package like better-sqlite3.
// This avoids needing a prebuilt binary or a compiler toolchain entirely,
// so it works unmodified on any platform Node runs on, phones included.
const db = new DatabaseSync(path.join(__dirname, 'data', 'app.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON'); // required for ON DELETE CASCADE to actually cascade

db.exec(`
  CREATE TABLE IF NOT EXISTS galleries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    otp TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    submitted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    preview_filename TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS selections (
    photo_id INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
    selected INTEGER NOT NULL DEFAULT 0
  );
`);

// Migration: add preview_filename to databases created before this column existed.
const photoColumns = db.prepare('PRAGMA table_info(photos)').all().map((c) => c.name);
if (!photoColumns.includes('preview_filename')) {
  db.exec('ALTER TABLE photos ADD COLUMN preview_filename TEXT');
}

// Helper: generate a random 6-digit one-time code as a string, e.g. "042817"
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// node:sqlite has no built-in `.transaction()` helper like better-sqlite3 did,
// so this wraps a function in BEGIN/COMMIT, rolling back if it throws.
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, generateOtp, transaction };
