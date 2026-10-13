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
| Repo | turbonzl/turbopantry, pinned to turboengine (`.turboengine.json`). |
| Website import | schema.org/Recipe JSON-LD first (covers most recipe sites, no LLM), then microdata, then a readability/heuristic fallback. |
| Osta share pages | Also import `ostarecipes.com/recipes/<id>` links (the user's example used `/s/recipes/<id>`; the saved page is `/recipes/<id>`, so `/s/` presumably redirects: unverified). INSPECTED a saved copy (fixture `packages/server/test/fixtures/osta-share-page.html`, from the user's .mht): it is a client-rendered React/MUI single-page app on Firebase. There is NO JSON-LD and the og: tags are generic site ones, so a plain HTTP fetch returns an empty shell and a JSON-LD parser finds nothing. The rendered DOM has title, creator, prep/cook time, servings, the cover image (Firebase Storage) and the ingredient list (quantity+unit span, then name, then a note in parentheses, with section headings such as "Cheese sauce"). The saved page showed NO method/steps ("View in the Osta app"), so imports from it are ingredients-only unless steps turn up. Plan: render with a headless browser (Playwright/Chromium, self-hosted, free) and read the DOM; class names are generated (`css-xxxx`), so select by structure/text, not class. Not verified: whether the app's Firestore data can be read directly (do not rely on it), and how it behaves for private recipes. |
| Shopping list model | AnyList-style (verified against AnyList release notes/help): typed items auto-categorised (Produce, Dairy...), categories reorderable per store; adding recipe ingredients merges similar items into one with a summed quantity and keeps the source ingredients viewable in item details; arbitrary units; scaling a recipe updates quantities already on the list; item properties (photo, store, price) are inherited from a matching favourite/recent item; favourites + recently used; real-time sync. Store assignment and location reminders are paid AnyList features: store assignment is in scope, location reminders are not. |
| Instagram import | Osta's real method is not public. User confirmed: Osta does NOT watch the video; it reads the caption AND the comments. So: caption + comments -> heuristic parser, free. Video transcription/OCR is a later, optional step. Fetching the caption without a login is NOT verified: Instagram blocks anonymous scraping and yt-dlp usually needs cookies. The sandbox cannot reach Instagram, so this must be proven on the user's own server before the design is locked. Always keep paste-the-caption and share-from-Instagram as the fallback that cannot break. |

## Repo layout
Not scaffolded yet (only docs and the engine pin exist). Planned: pnpm monorepo like Curator (`apps/web`, `apps/android`, `packages/server`, `packages/shared`).

## What exists and is tested
Nothing yet.

## Hard-won gotchas

## Session log
- 2026-10-13: Read turboengine, researched Osta/AnyList, got the decisions above from the user. Repo was empty; added engine pin, CLAUDE.md, PROJECT_BRIEF.md. Next: scaffold the monorepo, then prove the Instagram caption fetch from a network that can reach Instagram.
