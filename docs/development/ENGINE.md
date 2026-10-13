# Engine

TurboPantry is pinned to [TurboNZL/turboengine](https://github.com/TurboNZL/turboengine) (`.turboengine.json`). The engine is a reference: modules are copied, not installed, apart from the `turbothemes` package, which is installed from the engine's `themes/` folder.

| Module | State | Where |
|---|---|---|
| `release-pipeline` | adapted (no Electron/desktop jobs; server tarball and Docker image instead) | `.github/workflows/` |
| `appearance` | in, renamed (storage prefix `turbopantry`, bridge names `turbopantryDesktop` / `TurboPantryAndroid`); layouts `toolbar` and the player rules dropped | `apps/web/src/lib/appearance.ts`, `layout.ts`, `layouts.css`, `components/AppearanceCard.tsx`, `ThemeUpdates.tsx` |
| `guides-and-docs` | in; guide table in `lib/guides.ts` lists TurboPantry's guides | `apps/web/src/lib/guides.ts`, `markdown.ts`, `components/GuidesTab.tsx`, `docs/guides/` |
| `settings-shell` | partly: wrapping tab strip and `Section` only; no pairing code yet | `pages/SettingsPage.tsx`, `components/Section.tsx` |
| `updaters` | not yet (Android only, comes with the Android shell) | |
| `android-shell` | not yet | |
| `editions`, `window-frame` | deliberately skipped (no Electron) | |

Changes made to copied files (candidates to port back to the engine): see the session log in `CLAUDE.md`.
