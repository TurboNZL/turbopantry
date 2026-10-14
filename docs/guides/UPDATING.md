# Updating the server

**Easiest:** sign in as the owner (the first account), open **Settings → Server → Update server**. It downloads the newest version from the project, rebuilds the web client and restarts the server; the page waits for it to come back. Your recipes and lists are not touched (they live in the data folder, not in the program folder). The button appears only when the server can do it: it runs from the installer's git checkout under systemd (or with `TURBOPANTRY_UPDATE=1`), and `TURBOPANTRY_UPDATE=0` turns it off.

**From a terminal**, as a user with `sudo` on the server (use the install folder you chose; the program is in its `app/` folder):
```
sudo -u turbopantry -H bash /mnt/data/turbopantry/app/scripts/update.sh
```
What it does, in order (it prints each step and stops at the first one that fails):
1. stops the `turbopantry` service,
2. `git pull --ff-only`,
3. `pnpm install` for the shared, server and web packages,
4. builds the web client,
5. starts the service again and checks it is running.

If a step fails after the service was stopped, it stays stopped: fix the cause and run the command again (the script is safe to re-run).

## Things to know
- The program is updated from the `main` branch of the project. A change reaches your server when it is merged there.
- The terminal command needs passwordless `systemctl` for the service user. The installer sets that up (`/etc/sudoers.d/turbopantry`: stop, start and is-active for this one service, nothing else).
- Node is the one on the `PATH` (the installer puts it in `/usr/local/bin`). `TURBOPANTRY_NODE_BIN=/path/to/node/bin` forces one.

## Check it worked
```
sudo systemctl status turbopantry --no-pager
curl -s http://localhost:47900/api/health          # {"ok":true,...,"version":"v2026.10.0"}
```
