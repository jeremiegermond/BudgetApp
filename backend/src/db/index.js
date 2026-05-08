const path = require('path')
const fs   = require('fs')
const { Database: WasmDB } = require('node-sqlite3-wasm')
require('dotenv').config()

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../budget.db')

// Clean up stale lock directory left by a previous crashed process.
// node-sqlite3-wasm uses `<dbPath>.lock` as a mutex; orphaned dirs block startup.
try { fs.rmSync(`${dbPath}.lock`, { recursive: true, force: true }) } catch {}

// ── Compatibility layer: expose better-sqlite3-style API on top of node-sqlite3-wasm
class Statement {
  constructor(stmt) { this.stmt = stmt }
  _params(args) { return args.length ? args : undefined }
  get(...args)  { return this.stmt.get(this._params(args)) }
  all(...args)  { return this.stmt.all(this._params(args)) }
  run(...args)  { return this.stmt.run(this._params(args)) }
}

class Database {
  constructor(file) {
    this.raw = new WasmDB(file)
    this.cache = new Map()
  }
  exec(sql)   { this.raw.exec(sql); return this }
  pragma(s)   { this.raw.exec(`PRAGMA ${s}`); return this }
  prepare(sql) {
    let stmt = this.cache.get(sql)
    if (!stmt) {
      stmt = this.raw.prepare(sql)
      this.cache.set(sql, stmt)
    }
    return new Statement(stmt)
  }
  transaction(fn) {
    const raw = this.raw
    return (...args) => {
      raw.exec('BEGIN')
      try {
        const r = fn(...args)
        raw.exec('COMMIT')
        return r
      } catch (e) {
        try { raw.exec('ROLLBACK') } catch {}
        throw e
      }
    }
  }
  close() {
    for (const s of this.cache.values()) s.finalize()
    this.cache.clear()
    this.raw.close()
  }
}

const db = new Database(dbPath)

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

const hasTransfer = db.prepare("SELECT id FROM categories WHERE is_transfer = 1").get()
if (!hasTransfer) {
  db.prepare("INSERT INTO categories (name, icon, is_transfer) VALUES ('Virements', '↔️', 1)").run()
}

const hasSalaire = db.prepare("SELECT id FROM categories WHERE name = 'Salaire'").get()
if (!hasSalaire) {
  db.prepare("INSERT INTO categories (name, icon, is_transfer) VALUES ('Salaire', '💼', 0)").run()
}

module.exports = db
