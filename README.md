# TurboPantry

A self-hosted recipe box and shared shopping list. Import recipes from websites (Instagram and Osta links are next), keep them in one place, and add a recipe's ingredients to a shopping list that stays in sync between the people who share it.

## Features
- Recipes: write, edit, search (title, tags, ingredient names), scale servings, tick ingredients off.
- Import from recipe websites (schema.org recipe data); you review the draft before it is saved.
- A few accounts on one server, each with its own token; built to sit behind a Cloudflare Tunnel (Cloudflare Access service tokens supported).
- Themes, UI styles and layouts from turbothemes; guides inside the app (Settings → Guides).
- Free to run: nothing needs a paid service.
- Coming: shopping lists with live sync, Osta link and Instagram import, an Android app.

## Running it
**A home server (Linux or a Raspberry Pi), one command:**
```
curl -fsSL https://raw.githubusercontent.com/TurboNZL/turbopantry/main/scripts/install-pi.sh | sudo bash -s -- --data-dir /var/lib/turbopantry
```
It installs Node, makes a service user, downloads and builds the app, starts it, makes the owner account and prints the address and token. Details, other machines and backups: `docs/guides/SELF_HOSTING.md`.

**To develop:**
```
pnpm install
pnpm dev:server      # API on 47900, data in ./data
pnpm dev:web         # client on 5173, proxies /api to the server
pnpm typecheck && pnpm test && pnpm build
```
Read `CLAUDE.md` first (decisions and running log), then `PROJECT_BRIEF.md`.

## Releases and updates
Every merge to `main` becomes a release (`vYYYY.M.N`). The server updates itself from `main` (Settings → Server → Update server, or `scripts/update.sh`); see `docs/guides/UPDATING.md`.

## Engine
Built on [TurboNZL/turboengine](https://github.com/TurboNZL/turboengine) (`.turboengine.json` says which commit and modules).

## License
MIT, see `LICENSE`.
