import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

let db: DatabaseSync | null = null

export function dataDir() {
  return resolve(useRuntimeConfig().dataDir as string)
}

export function uploadsDir() {
  const dir = join(dataDir(), 'uploads')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function useDb() {
  if (db) return db
  mkdirSync(dataDir(), { recursive: true })
  db = new DatabaseSync(join(dataDir(), 'expenses.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

function migrate(d: DatabaseSync) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'DKK',
      base_currency TEXT NOT NULL DEFAULT 'DKK',
      archived INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      PRIMARY KEY (project_id, email)
    );
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'expense',          -- expense | income | withdrawal
      occurred_at TEXT NOT NULL,                     -- YYYY-MM-DD
      merchant TEXT,
      description TEXT,
      amount REAL,                                   -- i alt i currency (inkl. drikkepenge)
      tip REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL,
      base_amount REAL,                              -- kun når kursen er givet (hævning/manuelt)
      method TEXT NOT NULL DEFAULT 'card',           -- card | cash
      paid_by INTEGER REFERENCES participants(id) ON DELETE SET NULL,
      split TEXT,                                    -- JSON {mode, pids?, shares?} — NULL = ikke fordelt
      status TEXT NOT NULL DEFAULT 'ready',          -- ready | reading | failed
      ai_note TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS entries_project ON entries(project_id, occurred_at);
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      file TEXT NOT NULL,
      mime TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rates (
      currency TEXT NOT NULL,
      base TEXT NOT NULL,
      date TEXT NOT NULL,
      rate REAL NOT NULL,                            -- base pr. 1 currency
      PRIMARY KEY (currency, base, date)
    );
  `)
}
