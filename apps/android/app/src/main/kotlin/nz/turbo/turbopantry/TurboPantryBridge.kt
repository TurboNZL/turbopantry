package nz.turbo.turbopantry

import android.content.Context
import android.view.View
import android.webkit.JavascriptInterface
import nz.turbo.turbopantry.update.AppUpdater

/** `window.TurboPantryAndroid` in the web client. Java interfaces carry strings only, so results are JSON and changes arrive as events. */
class TurboPantryBridge(private val context: Context, @Suppress("unused") private val view: View) {
    private val prefs = ServerPrefs(context)

    @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
    @JavascriptInterface fun updateState(): String = AppUpdater.state.json()
    @JavascriptInterface fun checkForUpdate() = AppUpdater.check(context)
    @JavascriptInterface fun installUpdate() = AppUpdater.install(context)
    @JavascriptInterface fun hasUpdateToken(): Boolean = prefs.updateToken.isNotEmpty()
    @JavascriptInterface fun setUpdateToken(token: String) { prefs.updateToken = token }
    /** the web client tells the native side which server it uses, so the Cloudflare Access proxy knows which requests to add the service token to */
    @JavascriptInterface fun setServer(url: String, token: String) { runCatching { prefs.serverUrl = url; prefs.token = token } }

    /** the Cloudflare Access service token the server needs, if it sits behind Cloudflare Access */
    @JavascriptInterface fun setAccess(id: String, secret: String) { runCatching { prefs.cfId = id; prefs.cfSecret = secret } }
    @JavascriptInterface fun accessInjected(): Boolean = true
}
