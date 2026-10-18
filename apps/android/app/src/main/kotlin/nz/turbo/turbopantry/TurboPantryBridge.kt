package nz.turbo.turbopantry

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
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

    // ---- the full-screen recipe: while it is open, leaving the app shrinks it into a floating window (picture in picture) with step buttons
    @JavascriptInterface fun cookMode(on: Boolean) { (context as? MainActivity)?.let { a -> a.runOnUiThread { a.setCookMode(on) } } }
    @JavascriptInterface fun enterPip() { (context as? MainActivity)?.let { a -> a.runOnUiThread { a.enterPip() } } }

    // ---- opt-in notifications when someone else changes the shopping list (the page decides when; Settings > Server > Notifications turns it on)
    @JavascriptInterface fun notificationsAllowed(): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    /** asks Android for the notification permission (Android 13 and later); the page reads `notificationsAllowed()` again afterwards */
    @JavascriptInterface fun requestNotifications() {
        val a = context as? Activity ?: return
        if (Build.VERSION.SDK_INT >= 33 && !notificationsAllowed()) a.runOnUiThread { a.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7) }
    }
    @JavascriptInterface fun notify(title: String, text: String) {
        if (!notificationsAllowed()) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("list", "Shopping list changes", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(context, "list").setSmallIcon(R.drawable.ic_stat_app).setContentTitle(title.take(80)).setContentText(text.take(200)).setStyle(NotificationCompat.BigTextStyle().bigText(text.take(400)))
            .setContentIntent(open).setAutoCancel(true).build()
        nm.notify(4242, n) // one slot: a newer change replaces the last one
    }
}
