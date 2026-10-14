# Engine

TurboPantry is pinned to [TurboNZL/turboengine](https://github.com/TurboNZL/turboengine) (`.turboengine.json`). The engine is a reference: modules are copied, not installed, apart from the `turbothemes` package, which is installed from the engine's `themes/` folder.

| Module | State | Where |
|---|---|---|
| `release-pipeline` | adapted: only the `release` job (tag + GitHub release); the server is not a release asset. The APK job joins with Android | `.github/workflows/` |
| `appearance` | in, renamed (storage prefix `turbopantry`, bridge names `turbopantryDesktop` / `TurboPantryAndroid`); layout `toolbar` and the player rules dropped | `apps/web/src/lib/appearance.ts`, `layout.ts`, `layouts.css`, `components/AppearanceCard.tsx`, `ThemeUpdates.tsx` |
| `guides-and-docs` | in; the guide table in `lib/guides.ts` lists TurboPantry's guides | `apps/web/src/lib/guides.ts`, `markdown.ts`, `components/GuidesTab.tsx`, `docs/guides/` |
| `settings-shell` | partly: wrapping tab strip and `Section`; pairing is `device-pairing`, planned | `pages/SettingsPage.tsx`, `components/Section.tsx` |
| `self-hosted-server` | the mandatory set for an app with its own server; satisfied by the four rows below | |
| `server-install-update` | in. `scripts/install-pi.sh` and `scripts/update.sh` renamed (service/user/folder `turbopantry`, `TURBOPANTRY_*`, no ffmpeg/yt-dlp; the installer also makes the first account, and takes `--install-dir` so all of TurboPantry lives in one chosen folder: a candidate to port back to the engine). `update.ts` verbatim. `ServerUpdate.tsx` uses `useApi`. Differences from TurboMusic: accounts, so only the owner (first account) may update; the version shown comes from `git describe` | `packages/server/src/update.ts`, `index.ts`, `scripts/`, `apps/web/src/components/ServerUpdate.tsx`, `docs/guides/` |
| `cloudflare-access` | partly: `accessHeaders` in `lib/api.ts` and the Settings fields. `accessMedia.ts` and `sse.ts` come with live list sync; `AccessProxy.kt` with Android | `apps/web/src/lib/api.ts`, `components/ServerCard.tsx` |
| `updaters`, `android-shell`, `device-pairing`, `termux-server` | not yet: they arrive with the Android app (listed under `planned`) | |
| `logos` | in (engine fca5507): the shared TurboEngine mark with a **jar** emblem on the plate (a pantry jar with a slanted label band). Config `branding/logo.json`, emblem `branding/emblems/jar.json`, generator `scripts/gen-icons.mjs` + `scripts/logo/lib.mjs` (verbatim). Regenerate: `PLAYWRIGHT_MODULE=<playwright index.mjs> node scripts/gen-icons.mjs --png` (look at `--sheet`). Web only: no Android block yet | `apps/web/public/icon*.png/svg`, `branding/` |
| `editions`, `window-frame`, `gpu-modes`, `discord-presence` | deliberately skipped (no Electron) | |

Changes made to copied files (candidates to port back to the engine): see the session log in `CLAUDE.md`.
