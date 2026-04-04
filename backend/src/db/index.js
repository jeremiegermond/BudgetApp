const Database = require('better-sqlite3')
const path     = require('path')
require('dotenv').config()

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../budget.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    icon       TEXT    DEFAULT '🏷️',
    created_at TEXT    DEFAULT (datetime('now'))
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

  CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
  CREATE INDEX IF NOT EXISTS idx_budget_month          ON budget(month);
`)

const count = db.prepare('SELECT COUNT(*) as c FROM categories').get()
if (count.c === 0) {
  const ins = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)')
  ;[
    ['Alimentation','🛒'],['Transport','🚗'],['Loisirs','🎮'],
    ['Logement','🏠'],['Santé','💊'],['Abonnements','📱'],
    ['Épargne','💰'],['Restaurants','🍽️'],
  ].forEach(([n,i]) => ins.run(n,i))
}

module.exports = db
