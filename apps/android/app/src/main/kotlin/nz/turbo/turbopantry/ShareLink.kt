package nz.turbo.turbopantry

import java.net.URLEncoder

/**
 * What the share sheet hands us. Other apps share a whole sentence, not a bare address ("Look at this recipe https://www.instagram.com/p/AbC/?igsh=x"),
 * so the first web address in the text is taken. No Android classes here, so it is tested on the JVM.
 */
object ShareLink {
    private val web = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE)

    /** The first http(s) address in the shared text, without sentence punctuation stuck to its end; null when there is none. */
    fun extract(text: String?): String? {
        val m = web.find(text ?: return null) ?: return null
        return m.value.trimEnd('.', ',', ';', ':', '!', '?', ')', ']', '}')
    }

    /** The page of the web client that imports this address (App.tsx route recipes/import, which reads ?url=). */
    fun importPath(url: String): String = "/recipes/import?url=" + URLEncoder.encode(url, "UTF-8")
}
