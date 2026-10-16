package nz.turbo.turbopantry.update

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReleasesTest {
    @Test fun comparesVersionsNumberByNumber() {
        assertTrue(Releases.isNewer("v2026.10.10", "2026.10.9"))
        assertTrue(Releases.isNewer("v2026.11.0", "2026.10.31"))
        assertFalse(Releases.isNewer("v2026.10.3", "2026.10.3"))
        assertFalse(Releases.isNewer("v2026.10.3", "2026.10.4-debug"))
    }

    @Test fun picksTheNewestPublishedReleaseWithAnApk() {
        val list = JSONArray("""[
          {"tag_name":"v2026.10.4","draft":true,"assets":[{"name":"turbopantry-2026.10.4-android.apk","url":"https://api/draft"}]},
          {"tag_name":"v2026.10.3","draft":false,"assets":[]},
          {"tag_name":"v2026.10.2","draft":false,"prerelease":true,"assets":[{"name":"notes.txt","url":"https://api/n"},{"name":"turbopantry-2026.10.2-android.apk","url":"https://api/apk2"}]},
          {"tag_name":"v2026.10.1","draft":false,"assets":[{"name":"turbopantry-2026.10.1-android.apk","url":"https://api/apk1"}]}
        ]""")
        assertEquals("v2026.10.2" to "https://api/apk2", Releases.newestWithApk(list))
    }

    @Test fun nullWhenNoReleaseHasAnApk() {
        assertNull(Releases.newestWithApk(JSONArray("""[{"tag_name":"v1","draft":false,"assets":[]}]""")))
    }
}
