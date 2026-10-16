# TurboPantry: project brief

The long-lived "why and what". `CLAUDE.md` is the running log; this file changes rarely.

## Goal and user
A self-hosted **kitchen brain** for a household: recipes (Osta's import), a shared shopping list (AnyList's feel), and **a tracker of what is in the house** that ties them together. A few people (one household/friends) use it from their phones, reached through a Cloudflare tunnel. Replaces Osta and AnyList without a subscription or ads.

The point of the stock tracker (owner's words, 2026-10-14): quantities of what we have are stored, so when a recipe or the list needs something we already have (or have *enough* of) it is left off the list, and when we have *some but not enough* only the shortfall is added.

## Mobile first (a rule, not a nicety)
The app is used standing in a kitchen or a shop, one-handed. Design every screen at 390 px wide first; desktop is the roomier second layout.
- Bottom navigation within thumb reach; 44 px minimum touch targets; no tiny controls.
- Steppers (+ / −) and one-tap choices instead of typing; typing only for names and notes.
- Predictive: the next likely action is already offered (after cooking: "update the stock?"; after shopping: "put these away?"; a low item: "add to the list?"; frequent and recent items first).
- Few taps, few screens, no modal chains; undo instead of "are you sure" where possible.
- Fast and offline-tolerant: the list and stock work with a bad signal and catch up; screens render from cache first.

## Feature inventory
Recipes (from Osta):
- Import by URL: websites (schema.org/Recipe), Osta share pages (`ostarecipes.com/recipes/<id>`, rendered in a headless browser; ingredients, and the method where the page shows it) and Instagram posts/reels (caption and comments, as Osta does; not built yet).
- Import by pasting text, and by Android share-sheet (share a link or caption straight into the app).
- Clean cooking view (no clutter), folders/collections, shared across accounts.
- Edit, scale servings, tags, photo.

Shopping list (from AnyList):
- Several lists; items auto-sorted into store categories; categories reorderable per list/store.
- One tap adds a recipe's ingredients (scaled), merging duplicates and units.
- Real-time sync between accounts, works offline and catches up.
- Check-off, recently used / favourite items, quantities and notes.

House stock ("Pantry", the owner's full vision; designed before the shopping list so both share one item model):
- Items with a quantity and unit each (2 kg flour, 6 eggs, 1 can tomatoes), optionally a place (fridge, freezer, pantry), a "staple" flag (always have it: salt, oil; never add to the list) and a "keep at least" level.
- A recipe shows, per ingredient, **have enough / have some (3 of 5) / missing**, and "add what is missing" adds only the shortfall; staples and enough-in-stock items are skipped, and a tap overrides any of it.
- Ticking an item off the shopping list as bought puts it in stock (one tap, the bought quantity); "I cooked this" subtracts what the recipe used (a confirm-and-adjust screen, never silent).
- Units convert only inside one kind (weight with weight, volume with volume, counts with counts); weight to volume (cups of flour to grams) needs a per-item density, taken from a small built-in table or asked once and remembered.
- Matching a recipe's wording to a stock item ("fresh fettuccine pasta", "Coles Australian Free Range Eggs") is the hard part: plural/brand/adjective normalisation, a confirmed match is remembered, and an unsure match is asked once, never guessed silently.
- Later: expiry dates, barcode/receipt scan, "what can I cook with what we have".

Later: meal-plan calendar, video transcript/OCR import, photo-of-recipe import, nutrition.

## Rules that must not be broken
- Mobile first (see above): every new screen is designed and checked at 390 px before desktop.
- The stock is never changed silently: anything that adds to or subtracts from it is shown, confirmable and undoable.
- Free to run. No required paid service. Any LLM is optional.
- Every request authenticated; the server sits behind a public tunnel.
- Importing never silently drops data: if parsing is unsure, keep the raw text and let the user fix it.
- Engine rules (turboengine `CLAUDE.md`): versions `vYYYY.M.N`, lowercase asset names, `docs/guides` vs `docs/development`, themes on by default, one hook-class vocabulary.

## Architecture
Planned, same shape as Curator: pnpm monorepo. `packages/server` (Node 22, `node:sqlite`, HTTP + SSE/WebSocket), `apps/web` (React, Tailwind, turbothemes), `apps/android` (Kotlin WebView shell from the engine, share-sheet intent added here), `packages/shared`. Import pipeline = pluggable fetchers (site, instagram, text) -> parser (JSON-LD, then heuristics) -> normalised recipe.

## Roadmap (with done-criteria)
1. Scaffold + release pipeline: a merge to main produces a tagged release. Done when a release exists with the web build.
2. Recipes CRUD + website import: done when 10 varied real recipe URLs import with correct ingredients and steps.
3. **DONE (first version, 2026-10-15; the owner iterates on it).** **Stock + shopping list together** (they share the item model), mobile first: stock items with quantities and units, recipe-vs-stock status, add-the-shortfall-to-the-list, categories, live sync. Done when: a phone-width run adds a recipe's missing ingredients in at most 3 taps with in-stock items skipped; ticking bought items updates stock; two logged-in browsers see each other's changes through the tunnel.
4. Instagram import: **built (2026-10-16), unproven on live Instagram.** Done when 10 real food posts/reels import (or fail cleanly to paste) from the user's server.
5. Android shell + share-sheet + updater: **built (2026-10-16), first CI build pending.**
6. Meal plan, video transcript, polish.

## Glossary
- Engine: turboengine, the reference repo this app is pinned to.
