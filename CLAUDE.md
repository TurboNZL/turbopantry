# TurboPantry: project handoff

Read this first, then `PROJECT_BRIEF.md`. This file is the running state and decision log: update it whenever a decision or the state changes.

## Engine
This app is pinned to TurboNZL/turboengine (see `.turboengine.json`; `docs/development/ENGINE.md` says which modules and where they live). The engine is a **reference, not a dependency**: its modules are working code copied into apps. Before building something that every app would want (updates, release naming, the theme picker, window chrome, settings layout, guides), look in the engine's `modules/` first and copy from it rather than inventing a new one. If you improve a module here, say so in the session log so it can be ported back to the engine.

## User preferences (how to work with them)
- Don't waste their usage. Fact-check and double-check yourself; use web search liberally.
- They write casually; reply in normal capitalised prose.
- Put effort into verifying against real runs, not only unit tests.
- A merged PR cannot take new work: restart the branch from main for follow-up changes. Commit trailers as the harness gives them.

## Decisions made (don't re-ask)
| Topic | Decision |
|---|---|
| Naming | The product is written **TurboPantry** (title case) in all docs and UI text. Repositories, packages and file names stay lowercase (`turbopantry`, `.turboengine.json`, lowercase release assets). |
| What | Self-hosted recipe box + shared shopping list. Recipe import modelled on Osta (websites and Instagram); shopping list modelled on AnyList (store categories, one-tap "add recipe ingredients", live sync). |
| Cost | Must be free to run: no paid API anywhere in the default path. A paid/keyed LLM may only ever be an optional add-on. |
| Clients | Web/PWA first, then the engine's Android shell (WebView, share-sheet target, self-update). No Electron. |
| Users | A few accounts on one server (not multi-household SaaS). Exposed through a Cloudflare tunnel, so real auth on every request, HTTPS assumed, WebSocket/SSE must survive the tunnel. |
| Install | The engine's way for any app with its own server (module `self-hosted-server`): `scripts/install-pi.sh` (git checkout under a `turbopantry` service user, systemd, runs `node --experimental-strip-types src/index.ts`), `scripts/update.sh`, and the owner-only "Update server" button. Not a release asset, no tarball, no Docker (the user dislikes Docker; an earlier tarball/Docker pipeline was removed when the engine's update arrived). Do not reintroduce Docker as a default. |
| Owner | The first account made is the owner and the only one who may use `/api/admin/*` (server update). `is_admin` column, migration 3. |
| Cloudflare | Tunnel plus optional Access service token; the web client sends `CF-Access-Client-Id/Secret` on every request when set (Settings > Server). Same-origin web needs no CORS. When the Android shell arrives the server needs CORS for the page origin `http://localhost` (see the engine's cloudflare-access module) and its `AccessProxy`. |
| Repo | turbonzl/turbopantry, pinned to turboengine (`.turboengine.json`). |
| Website import | schema.org/Recipe JSON-LD first (covers most recipe sites, no LLM), then microdata, then a readability/heuristic fallback. |
| Osta share pages | Also import `ostarecipes.com/recipes/<id>` links (the user's example used `/s/recipes/<id>`; the saved page is `/recipes/<id>`, so `/s/` presumably redirects: unverified). INSPECTED a saved copy (fixture `packages/server/test/fixtures/osta-share-page.html`, from the user's .mht): it is a client-rendered React/MUI single-page app on Firebase. There is NO JSON-LD and the og: tags are generic site ones, so a plain HTTP fetch returns an empty shell and a JSON-LD parser finds nothing. The rendered DOM has title, creator, prep/cook time, servings, the cover image (Firebase Storage) and the ingredient list (quantity+unit span, then name, then a note in parentheses, with section headings such as "Cheese sauce"). The saved page showed NO method/steps ("View in the Osta app"), so imports from it are ingredients-only unless steps turn up. Plan: render with a headless browser (Playwright/Chromium, self-hosted, free) and read the DOM; class names are generated (`css-xxxx`), so select by structure/text, not class. Not verified: whether the app's Firestore data can be read directly (do not rely on it), and how it behaves for private recipes. |
| Shopping list model | AnyList-style (verified against AnyList release notes/help): typed items auto-categorised (Produce, Dairy...), categories reorderable per store; adding recipe ingredients merges similar items into one with a summed quantity and keeps the source ingredients viewable in item details; arbitrary units; scaling a recipe updates quantities already on the list; item properties (photo, store, price) are inherited from a matching favourite/recent item; favourites + recently used; real-time sync. Store assignment and location reminders are paid AnyList features: store assignment is in scope, location reminders are not. |
| Recipes are shared | Every account on a server sees and can edit every recipe (a household, like Osta's shared folders); `created_by` records who added it. No per-user recipe privacy yet. |
| Website import | Implemented: schema.org Recipe JSON-LD only (handles @graph, type lists, HowToSection/HowToStep, string steps, ISO times, broken JSON). Microdata and a readability fallback are NOT built. The import returns a DRAFT; the user reviews it and saves. Photos are hotlinked, not downloaded (download+cache is a later job). |
| Fetching pages | `packages/server/src/import/safeFetch.ts` is the only code that fetches user-supplied URLs: SSRF-guarded (public addresses only, checked at connect time, redirects re-checked, 5 MB / 15 s caps). Never add another fetch path for user URLs; reuse it. |
| Instagram import | Osta's real method is not public. User confirmed: Osta does NOT watch the video; it reads the caption AND the comments. So: caption + comments -> heuristic parser, free. Video transcription/OCR is a later, optional step. Fetching the caption without a login is NOT verified: Instagram blocks anonymous scraping and yt-dlp usually needs cookies. The sandbox cannot reach Instagram, so this must be proven on the user's own server before the design is locked. Always keep paste-the-caption and share-from-Instagram as the fallback that cannot break. |

## Repo layout
pnpm monorepo (pnpm 10, Node 22.13+). Names are `@turbopantry/*`.
```
apps/web/              React 19 + Vite + Tailwind 3 + turbothemes. src/lib (appearance, settings, store, api, guides, markdown), src/components (Layout, AppearanceCard, ThemeUpdates, GuidesTab, ServerCard, Section, Select), src/pages (Recipes, Shopping: empty shells; Settings)
packages/server/       node:http + node:sqlite, run directly by Node's type stripping (no build step). src/app.ts (routes, static web client), src/db.ts (migrations, users/tokens), src/recipes.ts, src/import/ (safe fetcher, JSON-LD), src/update.ts (self-update), src/index.ts (env config, `add-user` and `users` commands)
packages/shared/       types shared by both (Health, Status)
docs/guides/           user guides, bundled into Settings > Guides
docs/development/      ENGINE.md (which engine modules are in), APPEARANCE.md (from the engine)
.github/workflows/     auto-pr.yml (PR for every pushed branch), check.yml (push to main), release.yml (push to main: tag vYYYY.M.N and the GitHub release)
scripts/                install-pi.sh (installer), update.sh (updater): from the engine's server-install-update module
```
Not there yet: shopping lists, the Osta and Instagram importers, `apps/android` (and the `updaters` + `android-shell` engine modules, listed under `planned` in `.turboengine.json`).

## What exists and is tested
- Server: `/api/health` (public), `/api/status` (token), unknown `/api/*` 404, SPA fallback, immutable caching for `/assets/*`, no path escape, accounts with hashed tokens and an `add-user` command. 8 tests (`packages/server/test`).
- Recipes: table + API (create/read/update/delete/search, validation with size limits), import endpoint, ingredient parser (quantity/unit/name/note, fractions, ranges, sections, Osta-style plurals), serving scaler. Tests: shared 44, server 64 (SSRF guard, fetcher against a local server incl. gzip/charset/redirect/size cap, JSON-LD fixtures, API), web 3.
- Web: recipes list/search, recipe page (scale servings, tick ingredients), import page with review, write/edit form, plus shell with 4 layouts, theme picker + wallpaper + theme updates, Server card (sign in, tested against a real server), in-app guides, markdown renderer (3 tests).
- Verified in a real run (bundle from `pnpm build` served by `node server.mjs`, Chromium via Playwright): pages load with no console errors, token sign-in shows "Signed in as", layout choice survives a reload, no sideways scroll at 390 px wide.
- Verified in a real browser against a built bundle: sign-in notice when signed out, sign-in, empty state, import failure messages, import draft -> save -> view -> scale -> search by ingredient -> edit -> delete, no React warnings. The importer was fed fixture pages (the sandbox cannot reach recipe sites).
- Verified: `scripts/install-pi.sh --dry-run` prints the right plan; `bash -n` on both scripts; the Updater class with fake scripts (success, failure, double start, owner-only). End-to-end update test, run for real: a clone of the committed repo ran under a restart loop standing in for systemd (`INVOCATION_ID` set, restarts on exit); a new commit was pushed to a local bare origin; the owner pressed Update (API): 202, `update.sh --live` pulled, installed and built, the server exited 1, the loop restarted it, `/api/health` showed the new commit, the new web build contained the change, accounts and data were intact; a non-owner got 403 and no card; the owner sees the Update server card in Settings > Server.
- NOT verified: the installer for real (no apt/systemd/root here), importing from REAL recipe websites (none reachable from the sandbox; the fixtures are modelled on common JSON-LD shapes, not copied from live sites), the GitHub workflows (cannot run here), the Docker image (no Docker in the sandbox), anything Android, a Cloudflare tunnel.

## Hard-won gotchas
- The engine's web files do not compile under `noUncheckedIndexedAccess` (markdown.ts etc.): leave it off (`tsconfig.base.json`). Worth a line in the engine's `guides-and-docs` MODULE.md.
- `test` in `vite.config.ts` needs `defineConfig` from `vitest/config`, not `vite`.
- `pnpm add "github:TurboNZL/turboengine#path:/themes"` writes a codeload.github.com tarball (pinned to a commit) into the lockfile, so CI installs it over HTTPS with no SSH. It works because turboengine is public.
- The `Check` workflow runs on pushes to main only (engine convention), and `Release` runs in parallel with it, so a broken main still releases. Deliberate engine behaviour; revisit if it bites.
- `pnpm install --ignore-scripts` is fine: esbuild ships its binary as an optional dependency.
- Screenshots taken right after navigation catch the page-enter fade and look washed out; wait about 1 s.
- The server runs under `node --experimental-strip-types` in dev AND in production (the installer's service file does the same), so it has no build step: no constructor parameter properties, enums or namespaces in `packages/server`. `erasableSyntaxOnly` in its tsconfig enforces it (it was broken once, caught by a real run).
- Do not `pkill -f server.mjs` from the same shell command line: the pattern matches the shell itself.

## Session log
- 2026-10-13: Read turboengine, researched Osta/AnyList, got the decisions above from the user. Repo was empty; added engine pin, CLAUDE.md, PROJECT_BRIEF.md. Next: scaffold the monorepo, then prove the Instagram caption fetch from a network that can reach Instagram.
- 2026-10-13 (2): Created `main` (docs only). Scaffolded the monorepo on the working branch following the engine: workflows (auto-pr, check, release), server + web shell, appearance/guides/settings modules copied and renamed, user guides, Dockerfile. The release ships a server tarball and a GHCR image instead of the engine's Electron installers (no Electron). Nothing to port back to the engine yet. Deviations from the module files: the Curator-only layout `toolbar`, the player CSS and the music-specific Layout/preview markup were removed; the theme group title was renamed.
- 2026-10-13 (3): User does not like Docker. Made it optional: release.yml has the Docker image in its own `docker` job, README and SELF_HOSTING lead with the Node tarball plus a systemd unit, Docker is the last section.
- 2026-10-13 (4): Recipes and website import. Shared parsers (ingredients, durations, servings), recipes table + API, JSON-LD importer behind an SSRF-guarded fetcher, web pages (list, view with scaling, import, edit). Found and fixed: parameter properties break `pnpm dev:server`. Known rough edges: scaled quantities show decimals when no common fraction fits (0.6 cup); no unit conversion; photos hotlinked. Next: Osta share-page importer (headless browser), then shopping lists.
- 2026-10-13 (5): The engine got a big update (mandatory `self-hosted-server` set, new-app checklist). Adopted: MIT `LICENSE` + `license` in every package.json + README from the template; `server-install-update` (installer, updater, update button, owner account); `cloudflare-access` header support and Settings fields. Removed the tarball/Docker release jobs, Dockerfile and the esbuild bundle (the server runs from source). Pin moved to engine 3787668. Still to do for the engine's checklist: nothing in files; the user must do the GitHub settings (Actions enabled, workflow permissions read+write and "Allow GitHub Actions to create and approve pull requests", add the repo to the Claude connection if access is limited, default branch main).
