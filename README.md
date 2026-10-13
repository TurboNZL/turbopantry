# TurboPantry

A self-hosted recipe box and shared shopping list. Import recipes from websites, Instagram and Osta links; keep them in one place; add a recipe's ingredients to a shopping list that stays in sync between the people who share it.

**Status: early.** The server, the web client (themes, settings, in-app guides), accounts and the release pipeline exist. Recipes, importing and shopping lists are the next milestones (see `PROJECT_BRIEF.md`).

- Free to run: no paid service is needed anywhere.
- Meant to sit behind a Cloudflare Tunnel: every API route except `/api/health` needs a token.
- Built on [turboengine](https://github.com/TurboNZL/turboengine) (pinned in `.turboengine.json`).

## Run it
**Docker** (from the latest release):
```
docker run -d --name turbopantry -p 47900:47900 -v turbopantry-data:/data ghcr.io/turbonzl/turbopantry:latest
docker exec turbopantry node server.mjs add-user YourName      # prints your token once
```
**Node 22.13 or newer:** download `turbopantry-server-<version>-node.tar.gz` from the releases page, unpack it, then `node server.mjs add-user YourName` and `node server.mjs`.

Open `http://<host>:47900`, then Settings → Server and paste the token. More: `docs/guides/SELF_HOSTING.md` (also inside the app, Settings → Guides).

## Develop
```
pnpm install
pnpm dev:server      # API on 47900, data in ./data
pnpm dev:web         # client on 5173, proxies /api to the server
pnpm typecheck && pnpm test && pnpm build
```
Read `CLAUDE.md` first (decisions and running log), then `PROJECT_BRIEF.md`.
