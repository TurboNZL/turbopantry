# Turbopantry: project brief

The long-lived "why and what". `CLAUDE.md` is the running log; this file changes rarely.

## Goal and user
A self-hosted recipe box and shared shopping list for a few people (one household/friends), reached through a Cloudflare tunnel from phone and browser. Replaces Osta (recipe import) and AnyList (shopping list) without a subscription or ads.

## Feature inventory
Recipes (from Osta):
- Import by URL: websites (schema.org/Recipe) and Instagram posts/reels (caption, plus top comments where the caption has no recipe).
- Import by pasting text, and by Android share-sheet (share a link or caption straight into the app).
- Clean cooking view (no clutter), folders/collections, shared across accounts.
- Edit, scale servings, tags, photo.

Shopping list (from AnyList):
- Several lists; items auto-sorted into store categories; categories reorderable per list/store.
- One tap adds a recipe's ingredients (scaled), merging duplicates and units.
- Real-time sync between accounts, works offline and catches up.
- Check-off, recently used / favourite items, quantities and notes.

Later: meal-plan calendar, video transcript/OCR import, photo-of-recipe import, nutrition.

## Rules that must not be broken
- Free to run. No required paid service. Any LLM is optional.
- Every request authenticated; the server sits behind a public tunnel.
- Importing never silently drops data: if parsing is unsure, keep the raw text and let the user fix it.
- Engine rules (turboengine `CLAUDE.md`): versions `vYYYY.M.N`, lowercase asset names, `docs/guides` vs `docs/development`, themes on by default, one hook-class vocabulary.

## Architecture
Planned, same shape as Curator: pnpm monorepo. `packages/server` (Node 22, `node:sqlite`, HTTP + SSE/WebSocket), `apps/web` (React, Tailwind, turbothemes), `apps/android` (Kotlin WebView shell from the engine, share-sheet intent added here), `packages/shared`. Import pipeline = pluggable fetchers (site, instagram, text) -> parser (JSON-LD, then heuristics) -> normalised recipe.

## Roadmap (with done-criteria)
1. Scaffold + release pipeline: a merge to main produces a tagged release. Done when a release exists with the web build.
2. Recipes CRUD + website import: done when 10 varied real recipe URLs import with correct ingredients and steps.
3. Shopping lists with categories, add-from-recipe, live sync: done when two logged-in browsers see each other's changes through the tunnel.
4. Instagram import: done when 10 real food posts/reels import (or fail cleanly to paste) from the user's server.
5. Android shell + share-sheet + updater.
6. Meal plan, video transcript, polish.

## Glossary
- Engine: turboengine, the reference repo this app is pinned to.
