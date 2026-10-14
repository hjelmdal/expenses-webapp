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
      kind TEXT NOT NULL DEFAULT 'expense',          -- expense | credit | income | withdrawal | deposit
      occurred_at TEXT NOT NULL,                     -- YYYY-MM-DD
      merchant TEXT,
      description TEXT,
      amount REAL,                                   -- i alt i currency (inkl. drikkepenge)
      tip REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL,
      base_amount REAL,                              -- kun når kursen er givet (hævning/manuelt)
      method TEXT NOT NULL DEFAULT 'card',           -- card | cash | room (på hotelregningen)
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
    -- Betalinger der ikke er selve posten: delbetalinger på "betales senere"-poster
    -- (entry_id sat) og resten af en hotelregning efter modregnet depositum (entry_id NULL).
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'card',           -- card | cash
      paid_by INTEGER REFERENCES participants(id) ON DELETE SET NULL,
      occurred_at TEXT NOT NULL,
      note TEXT,
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
  // Kolonner tilføjet efter første udgave (2026-10-10). ALTER er idempotent via tjekket.
  const cols = new Set((d.prepare('PRAGMA table_info(entries)').all() as any[]).map(c => c.name))
  const add = (name: string, def: string) => { if (!cols.has(name)) d.exec(`ALTER TABLE entries ADD COLUMN ${name} ${def}`) }
  add('tip_cash', 'INTEGER NOT NULL DEFAULT 0')     // drikkepenge betalt kontant, selvom resten er kort/regning
  add('settled_at', 'TEXT')                        // regning: dato hvor hotelregningen blev betalt (NULL = åben)
  add('settled_method', 'TEXT')                    // regning: card | cash
  add('refunded', 'REAL NOT NULL DEFAULT 0')        // depositum: beløb der er kommet retur (fuldt ved "fået tilbage", rest ved modregning)
  add('service', 'REAL NOT NULL DEFAULT 0')         // service charge (stedets valg) — adskilt fra tip (vores valg); del af amount
  add('category', 'TEXT')                          // se shared/utils/categories.ts; NULL = ikke kategoriseret endnu
  add('client_id', 'TEXT')                         // telefonens id for posten (udbakken) — et nyt forsøg giver ikke en dobbeltpost
  d.exec('CREATE UNIQUE INDEX IF NOT EXISTS entries_client ON entries(project_id, client_id) WHERE client_id IS NOT NULL')
  add('stay_id', 'INTEGER')                         // hotel (stays.id) for regningsposter/depositum; NULL = foreslås ud fra datoen
  // Hotelophold: deler hotelregningen op pr. hotel. Regningsposter og depositum
  // placeres ud fra datoen (server/utils/stays.ts), medmindre posten har et stay_id.
  d.exec(`CREATE TABLE IF NOT EXISTS stays (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    check_in TEXT NOT NULL,                        -- YYYY-MM-DD
    check_out TEXT,                                -- YYYY-MM-DD; NULL = åbent
    settled_at TEXT                                -- regningen betalt (checket ud)
  )`)
  // Turens standardfordeling for nye udgifter: NULL (senere) | equal | weights (deltagernes vægte).
  const pcols = new Set((d.prepare('PRAGMA table_info(projects)').all() as any[]).map(c => c.name))
  if (!pcols.has('default_split')) d.exec('ALTER TABLE projects ADD COLUMN default_split TEXT')
}
