package se.enstorstarkreview.app.model

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class NearbyReviewsModelTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private lateinit var api: ApiClient
    private val address = "Karl Johansgatan 88, 414 55 Göteborg"

    @Before fun start() {
        server.dispatcher = routes
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
    }

    @After fun stop() = server.close()

    private fun query(index: Int = 0) = routes.sent.filter { it.url.encodedPath.endsWith("/nearby-reviews") }.getOrNull(index)?.url

    @Test fun countsComeFromTheSavedAddress() = runTest {
        routes.json("GET /nearby-reviews", Fixtures.text("nearby-reviews"))
        val nearby = NearbyReviewsModel(api, excluding = null)
        nearby.load(address)
        val result = (nearby.state as NearbyReviewsModel.State.Results).result
        assertEquals(listOf(250, 500, 1000), result.radiiMetres)
        assertEquals(listOf(2, 2, 5), result.counts)
        assertEquals("Majornas bryggeri", result.nearest.first().title)
        assertEquals(50, result.locatedCount)
        assertEquals(51, result.totalCount)
        assertEquals(address, query()!!.queryParameter("address"))
        assertEquals(listOf("address"), query()!!.queryParameterNames.toList())
    }

    /** An edited review leaves itself out of its own counts. */
    @Test fun anEditExcludesItself() = runTest {
        routes.json("GET /nearby-reviews", Fixtures.text("nearby-reviews"))
        NearbyReviewsModel(api, excluding = "majornas-bryggeri").load(address)
        assertEquals("majornas-bryggeri", query()!!.queryParameter("exclude"))
    }

    @Test fun anAddressWithoutAPositionSaysSo() = runTest {
        routes.json("GET /nearby-reviews", """{"addressKnown":false,"radiiMetres":[250,500,1000],"summary":null}""")
        val nearby = NearbyReviewsModel(api, null)
        nearby.load("Okänd gata 1")
        assertEquals(NearbyReviewsModel.State.NoPosition, nearby.state)
    }

    @Test fun noOtherLocatedReviewsSaysSo() = runTest {
        routes.json("GET /nearby-reviews", """{"addressKnown":true,"radiiMetres":[250,500,1000],"summary":null}""")
        val nearby = NearbyReviewsModel(api, null)
        nearby.load(address)
        assertEquals(NearbyReviewsModel.State.NoneLocated, nearby.state)
    }

    @Test fun aFailureCanBeRetried() = runTest {
        routes.problem("GET /nearby-reviews", 503, "service_unavailable")
        routes.json("GET /nearby-reviews", Fixtures.text("nearby-reviews"))
        val nearby = NearbyReviewsModel(api, null)
        nearby.load(address)
        assertEquals(NearbyReviewsModel.State.Unavailable, nearby.state)
        nearby.retry()
        assertTrue(nearby.state is NearbyReviewsModel.State.Results)
    }

    /** Moving between rating screens must not repeat the request. */
    @Test fun theSameAddressLoadsOnce() = runTest {
        routes.json("GET /nearby-reviews", Fixtures.text("nearby-reviews"))
        val nearby = NearbyReviewsModel(api, null)
        nearby.load(address)
        nearby.load("  $address ")
        assertEquals(1, routes.count("GET /nearby-reviews"))
    }

    /** The server would reject these, so the app does not ask. */
    @Test fun anUnusableAddressSendsNothing() = runTest {
        for (unusable in listOf("", "   ", "a".repeat(301))) {
            val nearby = NearbyReviewsModel(api, null)
            nearby.load(unusable)
            assertEquals(NearbyReviewsModel.State.NoPosition, nearby.state)
        }
        assertEquals(0, routes.count("GET /nearby-reviews"))
    }

    /** A slow answer for an old address must not replace the current one. */
    @Test fun aStaleAnswerIsIgnored() = runTest {
        val release = CountDownLatch(1)
        val first = CountDownLatch(1)
        server.dispatcher = object : mockwebserver3.Dispatcher() {
            override fun dispatch(request: mockwebserver3.RecordedRequest): mockwebserver3.MockResponse {
                if (request.url.queryParameter("address") == "Gamla gatan 1") {
                    first.countDown()
                    release.await(5, TimeUnit.SECONDS)
                    return mockwebserver3.MockResponse.Builder().code(200).addHeader("Content-Type", "application/json")
                        .body("""{"addressKnown":false,"radiiMetres":[250],"summary":null}""").build()
                }
                return mockwebserver3.MockResponse.Builder().code(200).addHeader("Content-Type", "application/json").body(Fixtures.text("nearby-reviews")).build()
            }
        }
        val nearby = NearbyReviewsModel(api, null)
        val old = async(start = kotlinx.coroutines.CoroutineStart.UNDISPATCHED) { nearby.load("Gamla gatan 1") }
        first.await(5, TimeUnit.SECONDS)
        nearby.load(address)
        release.countDown()
        old.await()
        assertTrue(nearby.state is NearbyReviewsModel.State.Results)
    }
}
