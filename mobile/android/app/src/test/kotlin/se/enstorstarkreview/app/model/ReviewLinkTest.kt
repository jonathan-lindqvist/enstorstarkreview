package se.enstorstarkreview.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The `slug` of a tapped notification. */
class ReviewLinkTest {
    @Test fun aSlugOpensTheReview() {
        assertEquals("ivans-pilsnerbar", ReviewLink.slug("ivans-pilsnerbar"))
    }

    @Test fun aMissingSlugIsIgnored() {
        assertNull(ReviewLink.slug(null))
    }

    @Test fun aBlankSlugIsIgnored() {
        assertNull(ReviewLink.slug(""))
        assertNull(ReviewLink.slug("  "))
    }

    @Test fun anOverlongSlugIsIgnored() {
        assertEquals(200, ReviewLink.slug("a".repeat(200))?.length)
        assertNull(ReviewLink.slug("a".repeat(201)))
    }
}
