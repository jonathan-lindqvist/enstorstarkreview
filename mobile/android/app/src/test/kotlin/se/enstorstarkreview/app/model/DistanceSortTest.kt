package se.enstorstarkreview.app.model

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Headers.Companion.headersOf
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import se.enstorstarkreview.api.models.ReviewMap
import se.enstorstarkreview.api.models.ReviewSort
import kotlin.math.PI
import kotlin.math.abs

class DistanceSortTest {
    private val server = MockWebServer()
    private lateinit var api: ApiClient
    private val origin = GeoPoint(57.7, 11.95)

    @Before fun start() {
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
    }

    @After fun stop() = server.close()

    /** A point [metres] north of the origin. */
    private fun north(metres: Double) = GeoPoint(57.7 + metres / 1000 / 6371 * 180 / PI, 11.95)

    /** Reviews newest first, like the API's `latest` sort. */
    private suspend fun list(slugs: List<String>): ReviewListModel {
        val base = Fixtures.json("review")
        val reviews = slugs.mapIndexed { index, slug ->
            JsonObject(base + mapOf(
                "slug" to JsonPrimitive(slug), "id" to JsonPrimitive("id-$slug"),
                "createdAt" to JsonPrimitive("2026-10-%02dT12:00:00.000Z".format(20 - index)),
            ))
        }
        server.enqueue(MockResponse.Builder().headers(headersOf("Content-Type", "application/json"))
            .body(JsonObject(mapOf("reviews" to JsonArray(reviews))).toString()).build())
        return ReviewListModel(api).apply { load() }
    }

    @Test fun distanceIsTheWebsHaversineInKilometres() {
        val km = ReviewDistance.kilometres(origin, north(1234.0))!!
        assertTrue(abs(km - 1.234) < 0.001)
        assertNull(ReviewDistance.kilometres(origin, GeoPoint(91.0, 0.0)))
    }

    /** Nearest first; equal distances stay newest first; reviews without a position go last. */
    @Test fun nearestSortsByDistanceWithUnknownLast() = runTest {
        val list = list(listOf("newest-unknown", "far", "tie-newer", "tie-older", "near", "oldest-unknown"))
        list.positions = mapOf("far" to north(3000.0), "tie-newer" to north(800.0), "tie-older" to north(800.0), "near" to north(100.0))
        list.origin = origin
        list.nearest = true
        assertEquals(listOf("near", "tie-newer", "tie-older", "far", "newest-unknown", "oldest-unknown"), list.visibleReviews.map { it.slug })
        assertTrue(abs(list.distanceKm("near")!! - 0.1) < 0.001)
        assertNull(list.distanceKm("newest-unknown"))
    }

    /** Without a location, Närmast stays selected and shows the newest first. */
    @Test fun withoutALocationNearestShowsTheNewestFirst() = runTest {
        val list = list(listOf("a", "b", "c"))
        list.positions = mapOf("c" to north(10.0))
        list.nearest = true
        assertEquals(listOf("a", "b", "c"), list.visibleReviews.map { it.slug })
        assertNull(list.distanceKm("c"))
    }

    /** The API has no nearest sort: Närmast asks for the newest first and orders on the device. */
    @Test fun nearestLoadsTheLatestFromTheAPI() = runTest {
        val list = list(listOf("a"))
        server.takeRequest()
        list.sort = ReviewSort.score
        list.nearest = true
        server.enqueue(MockResponse.Builder().headers(headersOf("Content-Type", "application/json")).body("""{"reviews":[]}""").build())
        list.load()
        assertEquals("latest", server.takeRequest().url.queryParameter("sort"))
    }

    @Test fun choosingAnAPISortLeavesNearest() = runTest {
        val list = list(listOf("a"))
        list.nearest = true
        list.choose(ReviewSort.score)
        assertFalse(list.nearest)
        assertEquals(ReviewSort.score, list.sort)
    }

    /** The device location stays in memory: the map markers give the positions. */
    @Test fun positionsComeFromTheMapMarkers() {
        val map = ApiJson.decodeFromString<ReviewMap>(
            """{"markers":[{"slug":"majornas-bryggeri","title":"M","overallRating":2,"location":"K","latitude":57.69,"longitude":11.92,"beer":null,"attributes":[]}]}""",
        )
        assertEquals(mapOf("majornas-bryggeri" to GeoPoint(57.69, 11.92)), ReviewDistance.positions(map))
    }

    /** Like the web: a review matches when it has any selected attribute. */
    @Test fun attributeFilterMatchesAny() = runTest {
        val list = list(listOf("a"))
        list.attributeFilter = setOf(se.enstorstarkreview.api.models.BarAttributeKey.karaoke)
        assertTrue(list.visibleReviews.isEmpty() || list.visibleReviews.all { se.enstorstarkreview.api.models.BarAttributeKey.karaoke in it.attributes })
    }
}
