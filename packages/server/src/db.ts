import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Each entry runs once, in order; the index + 1 is stored in PRAGMA user_version. Never edit an entry that has shipped: add a new one. */
const MIGRATIONS: string[] = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     token_hash TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );`,
  `CREATE TABLE recipes (
     id INTEGER PRIMARY KEY,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     image_url TEXT,
     source_url TEXT,
     source_name TEXT,
     servings REAL,
     prep_minutes REAL,
     cook_minutes REAL,
     total_minutes REAL,
     ingredients TEXT NOT NULL DEFAULT '[]',
     steps TEXT NOT NULL DEFAULT '[]',
     tags TEXT NOT NULL DEFAULT '[]',
     notes TEXT NOT NULL DEFAULT '',
     search_text TEXT NOT NULL DEFAULT '',
     created_by TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE INDEX recipes_updated ON recipes (updated_at DESC);`,
  // the first account ever made is the owner and may update the server; others are household members
  `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
   UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users);`,
  // the pantry (what the household keeps), the shared shopping list, and a log of every change to the stock (for undo and, later, predictions)
  `CREATE TABLE items (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     key TEXT NOT NULL,
     aliases TEXT NOT NULL DEFAULT '[]',
     category TEXT NOT NULL DEFAULT 'Other',
     unit TEXT,
     qty REAL NOT NULL DEFAULT 0,
     step REAL NOT NULL DEFAULT 1,
     default_qty REAL NOT NULL DEFAULT 1,
     min_qty REAL NOT NULL DEFAULT 0,
     staple INTEGER NOT NULL DEFAULT 0,
     tracked INTEGER NOT NULL DEFAULT 0,
     grams_per_cup REAL,
     place TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE UNIQUE INDEX items_key ON items (key);
   CREATE TABLE list_items (
     id INTEGER PRIMARY KEY,
     item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
     name TEXT NOT NULL,
     qty REAL,
     unit TEXT,
     note TEXT NOT NULL DEFAULT '',
     checked INTEGER NOT NULL DEFAULT 0,
     stock_applied REAL NOT NULL DEFAULT 0,
     category TEXT NOT NULL DEFAULT 'Other',
     added_by TEXT NOT NULL,
     recipe_id INTEGER,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     checked_at TEXT
   );
   CREATE TABLE stock_log (
     id INTEGER PRIMARY KEY,
     item_id INTEGER NOT NULL,
     delta REAL NOT NULL,
     reason TEXT NOT NULL,
     user TEXT NOT NULL,
     recipe_id INTEGER,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE INDEX stock_log_item ON stock_log (item_id, created_at);`,
];

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[v]!); db.exec(`PRAGMA user_version = ${v + 1}`); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return db;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates an account and returns its access token. The token is shown once; only its hash is stored. */
export function addUser(db: Db, name: string): string {
  const clean = name.trim();
  if (!clean) throw new Error('A user needs a name.');
  const first = countUsers(db) === 0;
  const token = `tp_${randomBytes(24).toString('base64url')}`;
  db.prepare('INSERT INTO users (name, token_hash, is_admin) VALUES (?, ?, ?)').run(clean, hash(token), first ? 1 : 0);
  return token;
}

export interface User { id: number; name: string; isAdmin: boolean }

export const listUsers = (db: Db): User[] => (db.prepare('SELECT id, name, is_admin FROM users ORDER BY id').all() as { id: number; name: string; is_admin: number }[]).map((r) => ({ id: r.id, name: r.name, isAdmin: !!r.is_admin }));

export function userForToken(db: Db, token: string): User | null {
  const want = Buffer.from(hash(token));
  const rows = db.prepare('SELECT id, name, token_hash, is_admin FROM users').all() as { id: number; name: string; token_hash: string; is_admin: number }[];
  for (const r of rows) {
    const have = Buffer.from(r.token_hash);
    if (have.length === want.length && timingSafeEqual(have, want)) return { id: r.id, name: r.name, isAdmin: !!r.is_admin };
  }
  return null;
}

export const countUsers = (db: Db) => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;

let savepoints = 0;
/**
 * Runs `fn` as one all-or-nothing unit. Uses a SAVEPOINT, so units can nest (ticking a shopping line changes stock, which is a unit of its own):
 * if anything throws, everything inside rolls back and the error carries on.
 */
export function atomically<T>(db: Db, fn: () => T): T {
  const name = `sp${++savepoints}`;
  db.exec(`SAVEPOINT ${name}`);
  try { const out = fn(); db.exec(`RELEASE ${name}`); return out; }
  catch (e) { db.exec(`ROLLBACK TO ${name}`); db.exec(`RELEASE ${name}`); throw e; }
}
