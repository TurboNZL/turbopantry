import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { addUser, listUsers, openDb, resetUserToken } from './db.ts';
import { Updater } from './update.ts';
import { createBrowserRenderer } from './import/browser.ts';
import { cacheAllRecipeImages } from './images.ts';
import { safeFetchPicture } from './import/safeFetch.ts';

/**
 * Configuration is by environment variable (systemd, a plain shell and the installer all do that):
 *   TURBOPANTRY_PORT (47900)   TURBOPANTRY_HOST (0.0.0.0)   TURBOPANTRY_DATA (./data)   TURBOPANTRY_WEB (the web client's folder; found in the checkout by default)
 *   TURBOPANTRY_CHROMIUM  path of the browser used for Osta links (default: chromium / google-chrome on the PATH)   TURBOPANTRY_BROWSER_NO_SANDBOX=1 if it will not start
 *   TURBOPANTRY_UPDATE  0 turns the in-app "Update server" button off, 1 offers it even without systemd
 * Accounts (run from packages/server, with the same TURBOPANTRY_DATA as the service):
 *   node --experimental-strip-types src/index.ts add-user <name>   makes an account and prints its token once; the first one is the owner
 *   node --experimental-strip-types src/index.ts users             lists the accounts
 *   node --experimental-strip-types src/index.ts new-token <name>  a lost token: prints a new one for that account (the old one stops working); nothing else is lost
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
if (cmd === 'new-token') {
  const name = rest.join(' ');
  if (!name) { console.error('Usage: new-token <name>'); process.exit(2); }
  const t = resetUserToken(db, name);
  if (!t) { console.error(`There is no user called ${name}. See: users`); process.exit(1); }
  console.log(`New token for ${name} (shown once, keep it safe; the old one no longer works):\n${t}`);
  process.exit(0);
}
if (cmd === 'users') { for (const u of listUsers(db)) console.log(u.isAdmin ? `${u.name} (owner)` : u.name); process.exit(0); }
if (cmd) { console.error(`Unknown command "${cmd}". Run with no command to start the server, or: add-user <name> | new-token <name> | users`); process.exit(2); }

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../../..');
const candidates = [process.env.TURBOPANTRY_WEB, resolve(repoRoot, 'apps/web/dist')].filter((p): p is string => !!p);
const webDir = candidates.map((p) => resolve(p)).find((p) => existsSync(resolve(p, 'index.html')));

function gitVersion(): string {
  try { return execFileSync('git', ['-C', repoRoot, 'describe', '--tags', '--always'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'dev'; } catch { return 'dev'; }
}

// "Update server" is offered only from a git checkout that has the script, under systemd (INVOCATION_ID) or when asked for (UPDATE=1)
const script = resolve(repoRoot, 'scripts/update.sh');
const underSystemd = !!process.env.INVOCATION_ID;
const offered = process.env.TURBOPANTRY_UPDATE !== '0' && existsSync(script) && existsSync(resolve(repoRoot, '.git')) && (underSystemd || process.env.TURBOPANTRY_UPDATE === '1');
const updater = offered ? new Updater({ script, restart: underSystemd, exit: () => process.exit(1) }) : undefined;

const version = gitVersion();
const port = Number(process.env.TURBOPANTRY_PORT ?? 47900);
const host = process.env.TURBOPANTRY_HOST ?? '0.0.0.0';
const imagesDir = resolve(dataDir, 'images');
createApp({ db, webDir, imagesDir, updater, version, render: createBrowserRenderer() }).listen(port, host, () => {
  console.log(`TurboPantry ${version} on http://${host}:${port}  data: ${dataDir}  web: ${webDir ?? 'not found (API only)'}  self-update: ${updater ? 'on' : 'off'}`);
});
// photos saved before caching existed are fetched once, quietly, in the background
void cacheAllRecipeImages(db, imagesDir, safeFetchPicture).then((n) => n && console.log(`Saved ${n} recipe photo${n === 1 ? '' : 's'} on this server.`)).catch(() => {});
