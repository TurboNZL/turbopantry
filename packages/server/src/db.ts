import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { GROUPS, guessCategory } from '@turbopantry/shared';
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
  // one list and one pantry: how an item is counted (amounts / weight in chunks / weight), "always have" removed, a list line can say that buying it
  // leaves the pantry count alone, shop layouts (the order of the shopping groups), and a token per device so a lost one is simply replaced
  `ALTER TABLE items DROP COLUMN staple;
   ALTER TABLE items ADD COLUMN count_mode TEXT NOT NULL DEFAULT 'weight';
   UPDATE items SET count_mode = CASE WHEN unit IS NULL OR unit NOT IN ('g','kg','ml','l') THEN 'amount' ELSE 'weight' END;
   ALTER TABLE list_items ADD COLUMN adds_stock INTEGER NOT NULL DEFAULT 1;
   CREATE TABLE stores (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     group_order TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE TABLE device_tokens (
     id INTEGER PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL UNIQUE,
     label TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
     last_used TEXT
   );`,
  // items made only by linking a recipe are IN the pantry now (at none): `from_recipe` remembers where they came from, so "only in a recipe" can
  // be filtered; recipe groups (collections of recipes); layouts (the faux-3D kitchen and shop maps: a block list as JSON)
  `ALTER TABLE items ADD COLUMN from_recipe INTEGER NOT NULL DEFAULT 0;
   UPDATE items SET from_recipe = 1, tracked = 1 WHERE tracked = 0;
   CREATE TABLE recipe_groups (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE TABLE recipe_group_members (
     recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
     group_id INTEGER NOT NULL REFERENCES recipe_groups(id) ON DELETE CASCADE,
     PRIMARY KEY (recipe_id, group_id)
   );
   CREATE TABLE layouts (
     id INTEGER PRIMARY KEY,
     kind TEXT NOT NULL CHECK (kind IN ('pantry', 'store')),
     store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
     data TEXT NOT NULL DEFAULT '{"blocks":[]}',
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   );
   CREATE UNIQUE INDEX layouts_one ON layouts (kind, ifnull(store_id, 0));`,
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
  regroup(db);
  return db;
}

/** The shopping groups became precise (Vegetables, Cheese ... instead of Produce, Dairy): items and lines still carrying an old broad name get a fresh guess. Does nothing once they are all current. */
function regroup(db: Db) {
  for (const table of ['items', 'list_items']) {
    const rows = db.prepare(`SELECT id, name, category FROM ${table}`).all() as { id: number; name: string; category: string }[];
    const set = db.prepare(`UPDATE ${table} SET category = ? WHERE id = ?`);
    for (const r of rows) if (!GROUPS.includes(r.category)) set.run(guessCategory(r.name), r.id);
  }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates an account and returns its access token. The token is shown once; only its hash is stored. */
export function addUser(db: Db, name: string): string {
  const clean = name.trim();
  if (!clean) throw new Error('A user needs a name.');
  const first = countUsers(db) === 0;
  const token = newToken();
  db.prepare('INSERT INTO users (name, token_hash, is_admin) VALUES (?, ?, ?)').run(clean, hash(token), first ? 1 : 0);
  return token;
}

export interface User { id: number; name: string; isAdmin: boolean }

export const listUsers = (db: Db): User[] => (db.prepare('SELECT id, name, is_admin FROM users ORDER BY id').all() as { id: number; name: string; is_admin: number }[]).map((r) => ({ id: r.id, name: r.name, isAdmin: !!r.is_admin }));

export function userForToken(db: Db, token: string): User | null {
  const want = Buffer.from(hash(token));
  const same = (h: string) => { const have = Buffer.from(h); return have.length === want.length && timingSafeEqual(have, want); };
  const rows = db.prepare('SELECT id, name, token_hash, is_admin FROM users').all() as { id: number; name: string; token_hash: string; is_admin: number }[];
  for (const r of rows) if (same(r.token_hash)) return { id: r.id, name: r.name, isAdmin: !!r.is_admin };
  const dev = db.prepare('SELECT d.id AS did, d.token_hash, u.id, u.name, u.is_admin FROM device_tokens d JOIN users u ON u.id = d.user_id').all() as { did: number; token_hash: string; id: number; name: string; is_admin: number }[];
  for (const r of dev) if (same(r.token_hash)) {
    db.prepare("UPDATE device_tokens SET last_used = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(r.did);
    return { id: r.id, name: r.name, isAdmin: !!r.is_admin };
  }
  return null;
}

const newToken = () => `tp_${randomBytes(24).toString('base64url')}`;

export interface DeviceToken { id: number; label: string; createdAt: string; lastUsed: string | null }

/** Makes another token for an account (one per phone or computer, named). Shown once; only its hash is kept. A lost one is revoked and replaced, the account never needs remaking. */
export function addDeviceToken(db: Db, userId: number, label: string): string {
  const token = newToken();
  db.prepare('INSERT INTO device_tokens (user_id, token_hash, label) VALUES (?, ?, ?)').run(userId, hash(token), label.trim().slice(0, 60));
  return token;
}
export const listDeviceTokens = (db: Db, userId: number): DeviceToken[] =>
  (db.prepare('SELECT id, label, created_at, last_used FROM device_tokens WHERE user_id = ? ORDER BY id').all(userId) as { id: number; label: string; created_at: string; last_used: string | null }[])
    .map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsed: r.last_used }));
export const revokeDeviceToken = (db: Db, userId: number, id: number): boolean => db.prepare('DELETE FROM device_tokens WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;

/** Owner recovery from the server's own shell: replaces an account's main token (the old one stops working) and prints the new one. */
export function resetUserToken(db: Db, name: string): string | null {
  const token = newToken();
  return db.prepare('UPDATE users SET token_hash = ? WHERE name = ?').run(hash(token), name.trim()).changes ? token : null;
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
