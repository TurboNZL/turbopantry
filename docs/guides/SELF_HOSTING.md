# Self-hosting

TurboPantry is one Node program that serves the API and the web app, with its data in one folder (a SQLite database). You need **Node 22.13 or newer** and nothing else. Docker is optional (last section).

## Install
1. Download `turbopantry-server-<version>-node.tar.gz` from the [releases page](https://github.com/TurboNZL/turbopantry/releases) and unpack it into a folder, for example `/opt/turbopantry`.
2. Make an account for each person (it prints a token, once):
   ```
   TURBOPANTRY_DATA=/var/lib/turbopantry node server.mjs add-user Alex
   ```
3. Start it:
   ```
   TURBOPANTRY_DATA=/var/lib/turbopantry node server.mjs
   ```
4. Open `http://<the machine>:47900`, go to Settings → Server and paste the token.

## Keep it running (Linux, systemd)
Save as `/etc/systemd/system/turbopantry.service` (change the user and paths to yours):
```
[Unit]
Description=TurboPantry
After=network.target

[Service]
User=turbopantry
WorkingDirectory=/opt/turbopantry
Environment=TURBOPANTRY_DATA=/var/lib/turbopantry
ExecStart=/usr/bin/node /opt/turbopantry/server.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
Then `sudo systemctl daemon-reload && sudo systemctl enable --now turbopantry`. Make sure the user can write to the data folder.

To update: stop the service, unpack the new tarball over the old files, start it. Your data folder is separate and stays as it is.

## Settings
| Variable | Default | Meaning |
|---|---|---|
| `TURBOPANTRY_PORT` | `47900` | Port to listen on |
| `TURBOPANTRY_HOST` | `0.0.0.0` | Address to listen on (`127.0.0.1` if only a tunnel on the same machine connects) |
| `TURBOPANTRY_DATA` | `./data` | Where the database lives. Back this folder up. |
| `TURBOPANTRY_WEB` | next to the program | The web app's folder |

## Backups
Stop the server (or copy while it is idle) and copy the data folder. The database uses WAL mode: copy the `.db`, `.db-wal` and `.db-shm` files together.

## Reaching it from outside
See [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md). Do not open the port on your router: every account is only protected by its token.

## Optional: Docker
If you would rather use a container, each release also publishes an image:
```
docker run -d --name turbopantry --restart unless-stopped \
  -p 47900:47900 -v turbopantry-data:/data \
  ghcr.io/turbonzl/turbopantry:latest
docker exec turbopantry node server.mjs add-user Alex
```
The data lives in the `turbopantry-data` volume. To update, pull the new image and run the same command again.
