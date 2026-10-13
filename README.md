# TurboPantry

A self-hosted recipe box and shared shopping list. Import recipes from websites, Instagram and Osta links; keep them in one place; add a recipe's ingredients to a shopping list that stays in sync between the people who share it.

**Status: early.** Working: accounts, recipes (write, edit, search, scale servings), import from recipe websites, themes and settings, in-app guides, the release pipeline. Next: Osta link import, shopping lists, Instagram import, the Android app (see `PROJECT_BRIEF.md`).

- Free to run: no paid service is needed anywhere.
- Meant to sit behind a Cloudflare Tunnel: every API route except `/api/health` needs a token.
- Installs as one Node file; Docker is optional.
- Built on [turboengine](https://github.com/TurboNZL/turboengine) (pinned in `.turboengine.json`).

## Run it
You need **Node 22.13 or newer** and nothing else (the database is built into Node).
```
# download turbopantry-server-<version>-node.tar.gz from the releases page and unpack it
node server.mjs add-user YourName      # prints your token once
node server.mjs                        # serves on http://<host>:47900
```
Open the address, then Settings → Server and paste the token. Running it as a service, backups and the settings: `docs/guides/SELF_HOSTING.md` (also inside the app, Settings → Guides).

**Docker is optional.** If you prefer it there is an image: `docker run -d -p 47900:47900 -v turbopantry-data:/data ghcr.io/turbonzl/turbopantry:latest`.

## Develop
```
pnpm install
pnpm dev:server      # API on 47900, data in ./data
pnpm dev:web         # client on 5173, proxies /api to the server
pnpm typecheck && pnpm test && pnpm build
```
Read `CLAUDE.md` first (decisions and running log), then `PROJECT_BRIEF.md`.
