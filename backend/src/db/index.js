const Database = require('better-sqlite3')
const path     = require('path')
require('dotenv').config()

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../budget.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    icon        TEXT    DEFAULT '🏷️',
    is_transfer INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    label        TEXT    NOT NULL,
    amount       REAL    NOT NULL,
    date         TEXT    NOT NULL,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    source       TEXT    DEFAULT 'manual',
    external_id  TEXT    UNIQUE,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budget (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month       TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    UNIQUE(category_id, month)
  );

  CREATE TABLE IF NOT EXISTS bank_connections (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    backend_id        TEXT    NOT NULL,
    bank_name         TEXT    NOT NULL,
    login             TEXT    NOT NULL,
    password          TEXT    NOT NULL,
    extra             TEXT    DEFAULT '{}',
    last_sync         TEXT,
    transaction_count INTEGER DEFAULT 0,
    created_at        TEXT    DEFAULT (datetime('now')),
    UNIQUE(backend_id, login)
  );

  CREATE TABLE IF NOT EXISTS eb_sessions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        TEXT    NOT NULL UNIQUE,
    bank_name         TEXT    NOT NULL,
    country           TEXT    DEFAULT 'FR',
    accounts          TEXT    DEFAULT '[]',
    valid_until       TEXT,
    last_sync         TEXT,
    transaction_count INTEGER DEFAULT 0,
    created_at        TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recurring_payments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    amount        REAL    NOT NULL,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    day_of_month  INTEGER NOT NULL,
    label_pattern TEXT,
    active        INTEGER DEFAULT 1,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions(category_id);
  CREATE INDEX IF NOT EXISTS idx_budget_month           ON budget(month);
`)

// Add is_transfer column if it doesn't exist yet (migration for existing DBs)
try { db.exec('ALTER TABLE categories ADD COLUMN is_transfer INTEGER DEFAULT 0') } catch {}

// Clean up old-format eb external_ids without -C/-D suffix (duplicates from before the indicator fix)
try {
  db.exec(`DELETE FROM transactions WHERE source = 'bank' AND external_id LIKE 'eb-%' AND external_id NOT LIKE '%-C' AND external_id NOT LIKE '%-D'`)
} catch {}

const count = db.prepare('SELECT COUNT(*) as c FROM categories').get()
if (count.c === 0) {
  const ins = db.prepare('INSERT INTO categories (name, icon, is_transfer) VALUES (?, ?, ?)')
  ;[
    ['Alimentation','🛒',0],['Transport','🚗',0],['Loisirs','🎮',0],
    ['Logement','🏠',0],['Santé','💊',0],['Abonnements','📱',0],
    ['Épargne','💰',0],['Restaurants','🍽️',0],['Virements','↔️',1],
    ['Prêt étudiant','↔️',1],
  ].forEach(([n,i,t]) => ins.run(n,i,t))
}

// Ensure the Virements transfer category exists
const hasTransfer = db.prepare("SELECT id FROM categories WHERE is_transfer = 1").get()
if (!hasTransfer) {
  db.prepare("INSERT INTO categories (name, icon, is_transfer) VALUES ('Virements', '↔️', 1)").run()
}

// Ensure Salaire category exists
const hasSalaire = db.prepare("SELECT id FROM categories WHERE name = 'Salaire'").get()
if (!hasSalaire) {
  db.prepare("INSERT INTO categories (name, icon, is_transfer) VALUES ('Salaire', '💼', 0)").run()
}

module.exports = db
