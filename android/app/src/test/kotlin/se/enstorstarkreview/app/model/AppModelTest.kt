package se.enstorstarkreview.app.model

import kotlinx.coroutines.test.runTest
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.rules.TemporaryFolder
import org.junit.Rule
import org.junit.Before
import org.junit.Test
import se.enstorstarkreview.api.models.Review

class AppModelTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private lateinit var api: ApiClient
    private val review = ApiJson.decodeFromString<Review>(Fixtures.text("review"))
    private val metadata = ApiJson.decodeFromString<se.enstorstarkreview.api.models.ReviewMetadata>(Fixtures.text("review-metadata"))

    @Before fun start() {
        server.dispatcher = routes
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
        routes.json("GET /reviews", "[${Fixtures.text("review")}]")
        routes.json("GET /statistics", Fixtures.text("statistics"))
        routes.json("GET /map", """{"markers":[],"unresolvedCount":0}""")
    }

    @After fun stop() = server.close()

    @get:Rule val folder = TemporaryFolder()

    /** The unsaved review holds draft data: signing out removes it, so the next user never sees it. */
    @Test fun signingOutRemovesTheUnsavedReview() = runTest {
        routes.on("DELETE /sessions/current", mockwebserver3.MockResponse.Builder().code(204).build())
        val storage = MemoryStorage().also { CredentialStore(it).save(Credentials("test", "tok")) }
        val app = AppModel(api, storage, backgroundScope, folder.root)
        val form = app.reviewForm(metadata, null)
        form.draft = form.draft.copy(title = "Hemlig bar")
        form.saveLocalCopy(ReviewWizardStep.Bar)
        assertNotNull(app.unsavedReviews.load("test"))
        app.session.signOut()
        assertNull(app.unsavedReviews.load("test"))
        assertFalse(java.io.File(folder.root, "review.json").exists())
    }

    /** A new review starts from the local copy; an edit never does. */
    @Test fun onlyNewReviewsUseTheUnsavedReview() = runTest {
        val storage = MemoryStorage().also { CredentialStore(it).save(Credentials("test", "tok")) }
        val app = AppModel(api, storage, backgroundScope, folder.root)
        app.reviewForm(metadata, null).apply {
            draft = draft.copy(title = "Hemlig bar")
            saveLocalCopy(ReviewWizardStep.Bar)
        }
        assertEquals("Hemlig bar", app.reviewForm(metadata, null).draft.title)
        assertEquals(review.title, app.reviewForm(metadata, Tagged(review, "\"e\"")).draft.title)
    }

    /** The deleted review leaves the list at once, then everything that showed it reloads. */
    @Test fun didDeleteRemovesAndReloads() = runTest {
        val app = AppModel(api, MemoryStorage(), backgroundScope, folder.root)
        app.reviewList.load()
        routes.json("GET /reviews", "[]")
        val reloads = app.didDelete(review.slug, review.title)
        assertTrue(app.reviewList.reviews.none { it.slug == review.slug })
        assertEquals("${review.title} togs bort", app.deletedNotice)
        reloads.join()
        assertEquals(2, routes.count("GET /reviews"))
        assertEquals(1, routes.count("GET /statistics"))
        assertEquals(1, routes.count("GET /map"))
    }

    /** Drafts are not in the statistics or on the map; saving one reloads only the list. */
    @Test fun savingADraftReloadsOnlyTheList() = runTest {
        val app = AppModel(api, MemoryStorage(), backgroundScope, folder.root)
        app.didSave(review.copy(publicationStatus = se.enstorstarkreview.api.models.PublicationStatus.draft)).join()
        assertEquals(1, routes.count("GET /reviews"))
        assertEquals(0, routes.count("GET /statistics"))
        app.didSave(review).join()
        assertEquals(1, routes.count("GET /statistics"))
        assertEquals(1, routes.count("GET /map"))
    }

    /** Publishing returns the published review and reloads the published views. */
    @Test fun publishReloadsPublishedViews() = runTest {
        routes.json("POST /reviews/${review.slug}/publication", Fixtures.text("review"), 200, "ETag", "\"p\"")
        val app = AppModel(api, MemoryStorage(), backgroundScope, folder.root)
        val (published, reloads) = app.publish(review.slug)
        assertEquals("\"p\"", published.eTag)
        reloads.join()
        assertEquals(1, routes.count("GET /statistics"))
    }

    /** Only a signed-in reviewer resolves map addresses, and a 204 keeps the map. */
    @Test fun geocodingNeedsASession() = runTest {
        routes.on("POST /map/geocoding", mockwebserver3.MockResponse.Builder().code(204).build())
        AppModel(api, MemoryStorage(), backgroundScope, folder.root).resolveNextMapMarker()
        assertEquals(0, routes.count("POST /map/geocoding"))
        val storage = MemoryStorage().also { CredentialStore(it).save(Credentials("test", "tok")) }
        val app = AppModel(api, storage, backgroundScope, folder.root)
        app.resolveNextMapMarker()
        assertEquals(1, routes.count("POST /map/geocoding"))
        assertNull(app.map.value)
    }
}
