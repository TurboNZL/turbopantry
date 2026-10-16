package nz.turbo.turbopantry

import android.content.Context

/**
 * What the native side needs to know. The web client pushes the server address and the Cloudflare Access service token here whenever its
 * Settings change (the bridge's setServer / setAccess); the GitHub token for updates is only needed while the repository is private.
 */
class ServerPrefs(context: Context) {
    private val p = context.applicationContext.getSharedPreferences("turbopantry", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = p.getString("serverUrl", "") ?: ""
        set(v) { p.edit().putString("serverUrl", v.trim().trimEnd('/')).apply() }
    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) { p.edit().putString("token", v.trim()).apply() }
    /** a Cloudflare Access service token (CF-Access-Client-Id / -Secret), for a server behind Cloudflare Access; blank when none */
    var cfId: String
        get() = p.getString("cfId", "") ?: ""
        set(v) { p.edit().putString("cfId", v.trim()).apply() }
    var cfSecret: String
        get() = p.getString("cfSecret", "") ?: ""
        set(v) { p.edit().putString("cfSecret", v.trim()).apply() }
    /** the headers every request to the server carries; empty unless both halves of the service token are set */
    fun accessHeaders(): Map<String, String> =
        if (cfId.isNotEmpty() && cfSecret.isNotEmpty()) mapOf("CF-Access-Client-Id" to cfId, "CF-Access-Client-Secret" to cfSecret) else emptyMap()
    /** a GitHub token with read access, only needed while the repository is private */
    var updateToken: String
        get() = p.getString("updateToken", "") ?: ""
        set(v) { p.edit().putString("updateToken", v.trim()).apply() }
    var lastUpdateCheck: Long
        get() = p.getLong("lastUpdateCheck", 0L)
        set(v) { p.edit().putLong("lastUpdateCheck", v).apply() }
}
