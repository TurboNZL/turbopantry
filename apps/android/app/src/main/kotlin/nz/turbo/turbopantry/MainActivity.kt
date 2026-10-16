package nz.turbo.turbopantry

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import nz.turbo.turbopantry.update.AppUpdater

/**
 * Shows the web client (bundled in the app's assets, served from http://localhost, a secure context, so IndexedDB and fetch behave like on the
 * web) full screen. Everything else is the web app; this class only supplies what a browser cannot: being a share-sheet target (a recipe link
 * or an Instagram post shared from another app opens the import page with the address), opening other links outside, file picking and the
 * update of the app itself.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var promptedFor: String? = null
    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        // Android 15 draws apps edge to edge, and a WebView does not apply its own padding to the page, so the insets go on a
        // container around it (status bar, navigation bar/buttons, display cutout and keyboard).
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val root = FrameLayout(this).apply { setBackgroundColor(BACKGROUND) }
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        // the app is always dark behind the bars: light icons
        WindowCompat.getInsetsController(window, root).apply { isAppearanceLightStatusBars = false; isAppearanceLightNavigationBars = false }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // the page is http://localhost, the user's server is often plain http on the home network
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = false
            allowContentAccess = false
        }
        web.setBackgroundColor(BACKGROUND)
        // the autofill framework has crashed WebViews on some phones when a page shows a password field (Settings > Server has two): the app has no use for it
        web.importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        web.addJavascriptInterface(TurboPantryBridge(this, web), "TurboPantryAndroid")

        val accessProxy = AccessProxy(ServerPrefs(this))
        val loader = WebViewAssetLoader.Builder().setDomain(HOST).setHttpAllowed(true).addPathHandler("/", SpaAssets(this)).build()
        web.webViewClient = object : WebViewClient() {
            // only the app's own pages are answered here; requests for the TurboPantry server go straight to it through Chromium's own network stack,
            // with a Cloudflare Access service token set they get the token added here (AccessProxy)
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url) ?: accessProxy.handle(request)
            // when the page's renderer process dies (out of memory, a driver crash) Android kills the whole app unless the client says it handled
            // it: show the app again instead (the page reloads from its saved state)
            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                runCatching { (view.parent as? FrameLayout)?.removeView(view); view.destroy() }
                runOnUiThread { recreate() }
                return true
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try { chooser.launch(params.createIntent()); true } catch (e: Exception) { fileCallback = null; false }
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })

        AppUpdater.listener = { s ->
            runOnUiThread {
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('turbopantry-update',{detail:${s.json()}}))", null)
                if (s.status == "ready") offerUpdate(s.version)
            }
        }

        if (savedInstanceState == null) web.loadUrl("http://$HOST${sharedPath(intent) ?: "/"}") else web.restoreState(savedInstanceState)
    }

    /** The app is already open and something is shared to it (launchMode singleTop). */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        sharedPath(intent)?.let { web.loadUrl("http://$HOST$it") }
    }

    override fun onStart() {
        super.onStart()
        // look for a new version when the app opens, at most every 6 hours
        if (System.currentTimeMillis() - ServerPrefs(this).lastUpdateCheck > 6 * 3600_000L) AppUpdater.check(this)
        if (AppUpdater.state.status == "ready") offerUpdate(AppUpdater.state.version)
    }

    /** The web client is not told about updates yet, so the app asks itself, once per version, before it opens Android's installer. */
    private fun offerUpdate(version: String?) {
        if (isFinishing || version == null || promptedFor == version) return
        promptedFor = version
        AlertDialog.Builder(this)
            .setTitle("Update ready")
            .setMessage("TurboPantry $version has been downloaded. Install it now? Android will ask you to confirm.")
            .setPositiveButton("Install") { _, _ -> AppUpdater.install(this) }
            .setNegativeButton("Later", null)
            .show()
    }

    /** The page to open for something shared to this app (ACTION_SEND with text), or null when this launch is not a share. */
    private fun sharedPath(i: Intent?): String? {
        if (i?.action != Intent.ACTION_SEND) return null
        val url = ShareLink.extract(i.getStringExtra(Intent.EXTRA_TEXT)) ?: ShareLink.extract(i.getStringExtra(Intent.EXTRA_SUBJECT))
        if (url == null) { Toast.makeText(this, "No link found in what you shared.", Toast.LENGTH_LONG).show(); return null }
        return ShareLink.importPath(url)
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }

    override fun onDestroy() {
        AppUpdater.listener = null
        web.destroy()
        super.onDestroy()
    }

    /**
     * Serves the bundled web client. The stock AssetsPathHandler answers a missing file (and the bare "/") with an empty
     * response, which the WebView reports as ERR_INVALID_RESPONSE, so "/" and every route of the app (/recipes/12, /pantry) get index.html.
     * Paths under /api/ are never the app: with no server address set the page asks http://localhost/api/..., which gets a clean 404 here.
     */
    private class SpaAssets(private val context: android.content.Context) : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            val name = path.trimStart('/').ifEmpty { "index.html" }
            val notFound = { WebResourceResponse("application/json", "utf-8", 404, "Not Found", emptyMap(), java.io.ByteArrayInputStream("{\"error\":\"No server address set\"}".toByteArray())) }
            if (name.startsWith("api/")) return notFound()
            val stream = try { context.assets.open(name) } catch (e: java.io.IOException) { null }
            if (stream != null) return WebResourceResponse(mime(name), null, stream)
            if (name.substringAfterLast('/').contains('.'))
                return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
            return WebResourceResponse("text/html", "utf-8", context.assets.open("index.html"))
        }

        private fun mime(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "webmanifest" -> "application/manifest+json"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "ico" -> "image/x-icon"
            "woff2" -> "font/woff2"
            "woff" -> "font/woff"
            "ttf" -> "font/ttf"
            "wasm" -> "application/wasm"
            else -> "application/octet-stream"
        }
    }

    private companion object {
        /**
         * The page is served from http://localhost (answered by the asset loader, never sent anywhere). Chromium treats localhost as a
         * secure context (crypto.subtle, IndexedDB all work) but, unlike an https page, it applies no mixed-content rules, so a plain-http
         * home server is reachable directly. The server must allow this origin in CORS (packages/server/src/app.ts).
         */
        const val HOST = "localhost"
        const val BACKGROUND = 0xFF0B0B10.toInt()
    }
}
