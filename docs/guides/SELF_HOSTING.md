# Self-hosting

TurboPantry is one Node program that serves the API and the web app, with its data in one folder (a SQLite database). It runs on any Linux machine that stays on: a Raspberry Pi, a mini PC, a NAS that can run Node. It needs **Node 22.13 or newer**; the installer takes care of that.

## Install (Linux, one command)
On the machine, as a user with `sudo`:
```
curl -fsSL https://raw.githubusercontent.com/TurboNZL/turbopantry/main/scripts/install-pi.sh | sudo bash -s -- --data-dir /var/lib/turbopantry
```
Add `--dry-run` first to see exactly what it would do. It:
1. installs git and curl, Chromium (for Osta links; `--no-browser` skips it, about 300 MB) and Node 22 if the machine has none,
2. makes a service user called `turbopantry` and the data folder,
3. downloads the app into `/home/turbopantry/turbopantry` and builds the web client,
4. starts it as a systemd service (`turbopantry`) on port 47900,
5. makes the first account (the **owner**) and prints its **token** once, with the address to open.

Run it again at any time to repair or update. Options: `--no-browser`, `--port`, `--admin NAME` (the owner's name), `--user`, `--branch`, `--yes`. On a Raspberry Pi put `--data-dir` on an external drive rather than the SD card (the installer warns you).

Then open the address in a browser, go to **Settings → Server**, paste the token and press **Save and test**.

## Add the people you share it with
Each person has their own account and token. As a user with `sudo` on the server:
```
sudo -u turbopantry -H bash -c "cd /home/turbopantry/turbopantry/packages/server && TURBOPANTRY_DATA=/var/lib/turbopantry node --experimental-strip-types src/index.ts add-user Sam"
```
It prints Sam's token once. Replace `users` for `add-user Sam` to list the accounts. Everyone sees the same recipes; only the first account (the owner) can update the server.

## Running it by hand (no installer)
You need Node 22.13+, git and pnpm. `git clone https://github.com/TurboNZL/turbopantry.git`, then in it `pnpm install --ignore-scripts --filter @turbopantry/shared --filter @turbopantry/server --filter @turbopantry/web`, `pnpm --filter @turbopantry/web build`, and run `node --experimental-strip-types src/index.ts` from `packages/server`. This also works on Windows and macOS for trying it out; there is no Windows installer.

## Settings (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `TURBOPANTRY_PORT` | `47900` | Port to listen on |
| `TURBOPANTRY_HOST` | `0.0.0.0` | Address to listen on (`127.0.0.1` if only a tunnel on the same machine connects) |
| `TURBOPANTRY_DATA` | `./data` | Where the database lives. Back this folder up. |
| `TURBOPANTRY_WEB` | `apps/web/dist` in the checkout | The web app's folder |
| `TURBOPANTRY_CHROMIUM` | found on the `PATH` | The browser used to read Osta links (`chromium`, `google-chrome`). Without one, Osta links say the server has no browser; everything else works. |
| `TURBOPANTRY_BROWSER_NO_SANDBOX` | | `1` if Chromium will not start (some containers). Running the service as root already does this. |
| `TURBOPANTRY_UPDATE` | | `0` turns the Update server button off; `1` offers it without systemd |

The installer sets the data folder and the port in the service file (`/etc/systemd/system/turbopantry.service`).

## Backups
Copy the data folder (while the service is stopped, or idle). The database uses WAL mode: copy the `.db`, `.db-wal` and `.db-shm` files together.

## Osta links need a browser
On Debian or Raspberry Pi OS: `sudo apt install chromium`. Ubuntu has no usable `chromium` package (its `chromium-browser` is a snap that cannot run as a service): install Google Chrome from Google's `.deb`, or point `TURBOPANTRY_CHROMIUM` at any Chromium or Chrome binary. Check with `chromium --version` (or `google-chrome --version`) as the service user. The browser runs only for an Osta import, one at a time, and may only talk to Osta and the Google services Osta uses.

## Reaching it from outside
See [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md). Do not open the port on your router: every account is only protected by its token.

## Updating
See [UPDATING.md](UPDATING.md).

## If something does not work
| What you see | What to do |
|---|---|
| The server will not start | `journalctl -u turbopantry -n 50` |
| "Wrong token" | Use the token printed when the account was made. A lost token cannot be shown again; ask the owner to make a new account name. |
| The page loads but is empty or old | Hard-refresh; after an update open devices pick up the new client when they next load the page. |
