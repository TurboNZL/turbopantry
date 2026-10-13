# Self-hosting

TurboPantry is one Node program that serves the API and the web app, with its data in one folder (a SQLite database). Nothing else needs to be installed.

## Docker
```
docker run -d --name turbopantry --restart unless-stopped \
  -p 47900:47900 -v turbopantry-data:/data \
  ghcr.io/turbonzl/turbopantry:latest
docker exec turbopantry node server.mjs add-user Alex
```
`add-user` prints a token. Keep it: it is shown once.

To update: pull the new image and run the same `docker run` again (the data volume keeps everything).

## Without Docker
You need Node 22.13 or newer (the built-in SQLite module is required).
1. Download `turbopantry-server-<version>-node.tar.gz` from the [releases page](https://github.com/TurboNZL/turbopantry/releases) and unpack it somewhere.
2. `TURBOPANTRY_DATA=/var/lib/turbopantry node server.mjs add-user Alex`
3. `TURBOPANTRY_DATA=/var/lib/turbopantry node server.mjs`

## Settings
| Variable | Default | Meaning |
|---|---|---|
| `TURBOPANTRY_PORT` | `47900` | Port to listen on |
| `TURBOPANTRY_HOST` | `0.0.0.0` | Address to listen on (`127.0.0.1` if only a tunnel on the same machine connects) |
| `TURBOPANTRY_DATA` | `./data` (`/data` in Docker) | Where the database lives. Back this folder up. |
| `TURBOPANTRY_WEB` | next to the program | The web app's folder |

## Backups
Stop the server (or copy while it is idle) and copy the data folder. The database uses WAL mode: copy the `.db`, `.db-wal` and `.db-shm` files together.

## Reaching it from outside
See [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md). Do not open the port on your router: every account is only protected by its token.
