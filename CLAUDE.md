# Turbopantry: project handoff

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
| What | Self-hosted recipe box + shared shopping list. Recipe import modelled on Osta (websites and Instagram); shopping list modelled on AnyList (store categories, one-tap "add recipe ingredients", live sync). |
| Cost | Must be free to run: no paid API anywhere in the default path. A paid/keyed LLM may only ever be an optional add-on. |
| Clients | Web/PWA first, then the engine's Android shell (WebView, share-sheet target, self-update). No Electron. |
| Users | A few accounts on one server (not multi-household SaaS). Exposed through a Cloudflare tunnel, so real auth on every request, HTTPS assumed, WebSocket/SSE must survive the tunnel. |
| Repo | turbonzl/turbopantry, pinned to turboengine (`.turboengine.json`). |
| Website import | schema.org/Recipe JSON-LD first (covers most recipe sites, no LLM), then microdata, then a readability/heuristic fallback. |
| Instagram import | Osta's real method is not public. Evidence (reviews, a competitor's comparison, both unverified) says it reads the caption and possibly comments, not the video. So: caption (+ top comments) -> heuristic parser, free. Video transcription/OCR is a later, optional step. Fetching the caption without a login is NOT verified: Instagram blocks anonymous scraping and yt-dlp usually needs cookies. The sandbox cannot reach Instagram, so this must be proven on the user's own server before the design is locked. Always keep paste-the-caption and share-from-Instagram as the fallback that cannot break. |

## Repo layout
Not scaffolded yet (only docs and the engine pin exist). Planned: pnpm monorepo like Curator (`apps/web`, `apps/android`, `packages/server`, `packages/shared`).

## What exists and is tested
Nothing yet.

## Hard-won gotchas

## Session log
- 2026-10-13: Read turboengine, researched Osta/AnyList, got the decisions above from the user. Repo was empty; added engine pin, CLAUDE.md, PROJECT_BRIEF.md. Next: scaffold the monorepo, then prove the Instagram caption fetch from a network that can reach Instagram.
