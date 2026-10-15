# TurboPantry

A self-hosted recipe box, pantry and shared shopping list. Import recipes from websites (Osta links work; Instagram is next), keep them in one place, and add a recipe's ingredients to a shopping list that stays in sync between the people who share it.

## Features
- Recipes: write, edit, search (title, tags, ingredient names), scale servings, bold amounts and ingredients, amounts on/off, three unit modes (as written, metric + cups, metric + grams), "I cooked this".
- A pantry of what is in the house, with amounts, and a shared shopping list that updates live on every phone. A recipe shows what you have and adds only what is missing; ticking things off the list puts them in the pantry.
- Built for the phone first: bottom navigation, big touch targets, steppers instead of typing.
- Import from recipe websites (schema.org recipe data) and Osta share links (ingredients only: Osta's pages have no method); you review the draft before it is saved.
- A few accounts on one server, each with its own token; built to sit behind a Cloudflare Tunnel (Cloudflare Access service tokens supported).
- Themes, UI styles and layouts from turbothemes; guides inside the app (Settings → Guides).
- Free to run: nothing needs a paid service.
- Coming: Instagram import, an Android app, editing offline.

## Running it
**A home server (Linux or a Raspberry Pi), one command:**
```
curl -fsSL https://raw.githubusercontent.com/TurboNZL/turbopantry/main/scripts/install-pi.sh | sudo bash -s -- --install-dir /mnt/data/turbopantry
```
Pick the folder with `--install-dir` (or leave it out and the installer asks): the program, your data and the service user's files all go in that one folder. It installs Node if needed, makes a service user, downloads and builds the app, starts it, makes the owner account and prints the address and token. Details, other machines and backups: `docs/guides/SELF_HOSTING.md`.

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
