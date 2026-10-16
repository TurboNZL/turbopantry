# The Android app

TurboPantry has an Android app. It is the same app as the web page, in its own window, with two extras: it shows up in the **Share** menu, and it updates itself.

## Install
1. On the phone open the newest release on the project's GitHub page (the Releases list) and download the file ending in `-android.apk`.
2. Open it. Android asks once to allow installing apps from your browser or file manager: allow it. Android may also show a warning because the app does not come from the Play Store. That is expected.
3. Open TurboPantry, go to **Settings > Server**, type your server's address (for example `https://pantry.example.com`) and your token, and press Save. The app is only a window, so it always needs your own server.

If the server sits behind Cloudflare Access, fill in the service token in the same card. See the Cloudflare Tunnel guide.

## Add a recipe from another app
Find a recipe link in your browser, or an Instagram post, press **Share** and choose **TurboPantry**. The app opens on the import page with the address filled in. Look it over, then save.

Instagram posts need the Instagram importer on the server, which is not built yet. Until then, share the post's text instead, or paste the caption on the import page.

## Updates
When the app opens it looks for a newer release (at most every 6 hours). When one has been downloaded, it asks "Update ready". Press **Install**; Android asks you to confirm. The first time, Android sends you to a page where you allow TurboPantry to install apps; allow it and press back.

If the project's repository is private, the app cannot see its releases and will say so.

## If an update will not install
Android only installs an update that is signed with the same key as the installed app. If the owner changed the signing key, uninstall the app once and install the new file. Your recipes and pantry live on the server, so nothing is lost.
