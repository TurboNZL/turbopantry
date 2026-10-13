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
  const token = `tp_${randomBytes(24).toString('base64url')}`;
  db.prepare('INSERT INTO users (name, token_hash) VALUES (?, ?)').run(clean, hash(token));
  return token;
}

export function userForToken(db: Db, token: string): { id: number; name: string } | null {
  const want = Buffer.from(hash(token));
  const rows = db.prepare('SELECT id, name, token_hash FROM users').all() as { id: number; name: string; token_hash: string }[];
  for (const r of rows) {
    const have = Buffer.from(r.token_hash);
    if (have.length === want.length && timingSafeEqual(have, want)) return { id: r.id, name: r.name };
  }
  return null;
}

export const countUsers = (db: Db) => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
