import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp, VERSION } from './app.ts';
import { addUser, openDb } from './db.ts';

/**
 * Configuration is by environment variable (Docker, systemd and a plain shell all do that):
 *   TURBOPANTRY_PORT (47900)   TURBOPANTRY_HOST (0.0.0.0)   TURBOPANTRY_DATA (./data)   TURBOPANTRY_WEB (the web client's folder; found next to this file when bundled)
 * Accounts: `node server.mjs add-user <name>` prints that person's access token once.
 */
const dataDir = resolve(process.env.TURBOPANTRY_DATA ?? 'data');
const db = openDb(resolve(dataDir, 'turbopantry.db'));

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'add-user') {
  const name = rest.join(' ');
  if (!name) { console.error('Usage: add-user <name>'); process.exit(2); }
  try { console.log(`Token for ${name} (shown once, keep it safe):\n${addUser(db, name)}`); }
  catch (e) { console.error((e as Error).message.includes('UNIQUE') ? `There is already a user called ${name}.` : (e as Error).message); process.exit(1); }
  process.exit(0);
}
if (cmd) { console.error(`Unknown command "${cmd}". Run with no command to start the server, or: add-user <name>`); process.exit(2); }

const here = fileURLToPath(new URL('.', import.meta.url));
const candidates = [process.env.TURBOPANTRY_WEB, resolve(here, 'web'), resolve(here, '../../../apps/web/dist')].filter((p): p is string => !!p);
const webDir = candidates.map((p) => resolve(p)).find((p) => existsSync(resolve(p, 'index.html')));

const port = Number(process.env.TURBOPANTRY_PORT ?? 47900);
const host = process.env.TURBOPANTRY_HOST ?? '0.0.0.0';
createApp({ db, webDir }).listen(port, host, () => {
  console.log(`TurboPantry ${VERSION} on http://${host}:${port}  data: ${dataDir}  web: ${webDir ?? 'not found (API only)'}`);
});
