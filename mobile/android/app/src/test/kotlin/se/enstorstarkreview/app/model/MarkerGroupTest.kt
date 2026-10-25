package se.enstorstarkreview.app.model

import org.junit.Assert.assertEquals
import org.junit.Test
import se.enstorstarkreview.api.models.MapMarker

class MarkerGroupTest {
    private fun marker(slug: String, title: String, latitude: Double, longitude: Double) =
        MapMarker(slug, title, 1.0, "Gatan 1", latitude, longitude, null, emptySet())

    /** Bars at one address (about one metre apart) share a marker, sorted by Swedish title order. */
    @Test fun groupsBarsAtOneAddress() {
        val groups = MarkerGroup.groups(listOf(
            marker("b", "Ölstugan", 57.700001, 11.950001),
            marker("c", "Ensam", 57.71, 11.96),
            marker("a", "Arken", 57.700004, 11.950002),
            marker("d", "Zeppelin", 57.700002, 11.95),
        ))
        assertEquals(2, groups.size)
        assertEquals(listOf("Arken", "Zeppelin", "Ölstugan"), groups[0].markers.map { it.title })
        assertEquals(listOf("c"), groups[1].markers.map { it.slug })
    }

    /** Groups keep the order of their first marker, so the map does not reshuffle on reload. */
    @Test fun keepsFirstSeenOrder() {
        val groups = MarkerGroup.groups(listOf(marker("x", "X", 1.0, 1.0), marker("y", "Y", 2.0, 2.0), marker("z", "Z", 1.0, 1.0)))
        assertEquals(listOf("1.00000,1.00000", "2.00000,2.00000"), groups.map { it.id })
    }
}
