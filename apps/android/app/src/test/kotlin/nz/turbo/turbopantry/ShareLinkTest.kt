package nz.turbo.turbopantry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ShareLinkTest {
    @Test fun takesTheAddressOutOfASentence() {
        assertEquals("https://www.instagram.com/p/AbC123/?igsh=xyz", ShareLink.extract("Look at this recipe https://www.instagram.com/p/AbC123/?igsh=xyz"))
    }
    @Test fun leavesAPlainAddressAlone() {
        assertEquals("https://example.com/pancakes", ShareLink.extract("https://example.com/pancakes"))
    }
    @Test fun dropsPunctuationStuckToTheEnd() {
        assertEquals("https://example.com/a-b", ShareLink.extract("(see https://example.com/a-b)."))
        assertEquals("https://example.com/a", ShareLink.extract("Try https://example.com/a, it is good"))
    }
    @Test fun takesTheFirstOfSeveral() {
        assertEquals("https://a.example/x", ShareLink.extract("https://a.example/x and https://b.example/y"))
    }
    @Test fun nothingWhenThereIsNoAddress() {
        assertNull(ShareLink.extract("just words"))
        assertNull(ShareLink.extract(null))
        assertNull(ShareLink.extract("ftp://example.com/x"))
    }
    @Test fun importPathEncodesTheAddress() {
        assertEquals("/recipes/import?url=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2", ShareLink.importPath("https://example.com/a?x=1&y=2"))
    }
}
