# Android app (apps/android)

A WebView shell around the built web client, from the engine's `android-shell`, `updaters` (Android half) and `cloudflare-access` (`AccessProxy`) modules, with the music parts left out. Package and application id `nz.turbo.turbopantry` (debug builds add `.debug`). It is not a pnpm package; Gradle builds it.

## How it works
- `pnpm --filter @turbopantry/web build`, then Gradle's `copyWeb` task copies `apps/web/dist` into the app's assets. `MainActivity` serves them from `http://localhost` with `WebViewAssetLoader` (a secure context; every route gets `index.html`; `/api/*` gets a 404 so a missing server address fails cleanly).
- The page talks to the user's server over the address in Settings > Server (`serverUrl` in `lib/settings.ts`). Because the page origin is `http://localhost`, **the server allows that origin in CORS**: `corsHeaders` / `DEFAULT_CORS_ORIGINS` in `packages/server/src/app.ts` (preflight answered before the token check, `CF-Access-Client-*` allowed, never `*`). Pass `corsOrigins` to `createApp` to change it. Same-origin web needs none of this.
- Cloudflare Access: for the server's origin `AccessProxy` answers preflights itself and adds the service token to GET/HEAD requests, but only after the web client has told the shell the address and token with `window.TurboPantryAndroid.setServer(url, token)` and `.setAccess(id, secret)`. The Access application also needs "Bypass options requests to origin" for requests that have a body.
- Share target: `ACTION_SEND text/plain` in the manifest; `ShareLink.extract` takes the first http(s) address out of the shared text and `MainActivity` loads `/recipes/import?url=<encoded>` (also from `onNewIntent`, the activity is `singleTop`).
- Updates: `AppUpdater` lists the repository's releases (pre-releases included), takes the newest with an `.apk`, downloads it to `cache/updates` and opens Android's installer through the `FileProvider`. `MainActivity` checks on start (at most every 6 hours) and shows a native "Update ready" dialog, once per version. It also emits `turbopantry-update` events and exposes `updateState / checkForUpdate / installUpdate / setUpdateToken` on the bridge for a Settings card later.

## Web client follow-ups (not done here, `apps/web` was off limits)
1. `ImportPage` must read `?url=`: with `useSearchParams`, `useEffect(() => { const u = params.get('url'); if (u) { setUrl(u); void fetchDraft(undefined, u); } }, [])`. Without it the share opens the import page empty.
2. Call the bridge when Settings > Server is saved (the engine's `updaters/files/apps/web/src/lib/native.ts` `syncNativeServer`, renamed to `TurboPantryAndroid` and `turbopantry-update`). Only needed for Cloudflare Access.
3. Optional: the Settings "App updates" card (engine `AppSettings.tsx`) and `ANDROID: ['The Android app', 'Apps']` in `lib/guides.ts`.

## Building
- Needs JDK 17+, Gradle 8.9+ (no wrapper, like the engine; CI uses `gradle/actions/setup-gradle`) and the Android SDK 35 (`ANDROID_HOME`). `pnpm --filter @turbopantry/web build && gradle -p apps/android :app:assembleDebug -PappVersion=2026.10.3`. Plugins: AGP 8.7.3, Kotlin 2.0.21 (`apps/android/build.gradle.kts`). Unit tests: `gradle -p apps/android :app:testDebugUnitTest` (`ShareLinkTest`, `ReleasesTest`).
- The icon comes from `branding/logo.json` (`out.android`): `node scripts/gen-icons.mjs` rewrites `res/drawable/ic_launcher_foreground.xml`, `ic_stat_app.xml` and `res/values/colors.xml`. Never hand-edit those.

## Release and signing
`.github/workflows/release.yml` job `android` (after `release`) builds `assembleRelease` with `-PappVersion=<tag without v>` and uploads `turbopantry-<version>-android.apk` to the release. `versionCode = year*10000 + month*100 + counter`.
Android refuses an update signed with a different key, so the key must never change by accident:
- Default: `apps/android/turbopantry.keystore` (alias `turbopantry`, password `turbopantry-personal`) is committed on purpose, like the engine's. Anyone with the repository can sign an APK with it; this only matters if the repository is public AND someone could get you to install their file. For a public repository use secrets.
- Secrets (all four, or none): `ANDROID_KEYSTORE_BASE64` (`base64 -w0 my.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Gradle reads them as `TURBOPANTRY_KEYSTORE*`. Switching between the committed key and secrets (or to new secrets) needs a one-time uninstall on every phone. Debug builds use the same key with the `.debug` id suffix, so they install beside the real app.

## Not verified in the sandbox
The Android SDK and AGP (dl.google.com) are unreachable, so nothing here was compiled with Gradle. Verified: `ShareLink` and its 6 tests on the JVM with a downloaded `kotlinc` 2.0.21; the other Kotlin files parse (only unresolved Android references); the workflow parses as YAML; the CORS tests run in the server suite. First real run: the first release after merging.
