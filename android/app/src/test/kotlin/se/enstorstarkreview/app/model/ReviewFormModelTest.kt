package se.enstorstarkreview.app.model

import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import se.enstorstarkreview.api.models.BarAttributeKey
import se.enstorstarkreview.api.models.ImageContentType
import se.enstorstarkreview.api.models.RatingKey
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewMetadata

class ReviewFormModelTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private lateinit var api: ApiClient
    private val metadata = ApiJson.decodeFromString<ReviewMetadata>(Fixtures.text("review-metadata"))
    private val review = ApiJson.decodeFromString<Review>(Fixtures.text("review"))
    private val slugPath = "/reviews/majornas-bryggeri"

    @Before fun start() {
        server.dispatcher = routes
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
    }

    @After fun stop() = server.close()

    private fun editForm() = ReviewFormModel(api, metadata, "test", Tagged(review, "\"v2-abc\""))
    private fun createForm(store: UnsavedReviewStore? = null, user: String = "test") = ReviewFormModel(api, metadata, user, null, store)
    private fun sentJson(route: String): JsonObject =
        ApiJson.parseToJsonElement(routes.sent.last { "${it.method} ${it.url.encodedPath.removePrefix("/api/v1")}" == route }.body!!.utf8()).jsonObject

    /** A complete new review: every step passes. */
    private fun ReviewFormModel.fillIn() {
        setImage(ByteArray(10), ImageContentType.imageSlashJpeg)
        draft = draft.copy(title = "Baren", location = "Gatan 1", brandChoice = "Falcon Export", priceText = "65", description = "Bra.")
    }

    // Edit overview

    /** Each step's row in the edit overview summarises what the step holds. */
    @Test fun theOverviewSummarisesEachStep() {
        val form = editForm()
        assertEquals("Nuvarande bild", form.summary(ReviewWizardStep.Photo))
        assertEquals("Majornas bryggeri · Karl Johansgatan 88", form.summary(ReviewWizardStep.Bar))
        assertEquals("Husets stora stark · 69 kr · 50 cl", form.summary(ReviewWizardStep.Beer))
        assertEquals("Viktat 3,59 av 5", form.summary(ReviewWizardStep.Ratings))
        assertEquals("Riktigt bra · 5 rader", form.summary(ReviewWizardStep.Text))
        // The editor joins the credits, as on iOS.
        assertEquals("Test, Victor, Jonathan & Theo", form.summary(ReviewWizardStep.Authors))
    }

    /** A happy-hour price has its star, and missing parts are left out. */
    @Test fun theOverviewLeavesOutWhatIsMissing() {
        val form = editForm()
        form.setImage(ByteArray(10), ImageContentType.imageSlashJpeg)
        form.draft = form.draft.copy(location = "", isHappyHourPrice = true, volumeCl = null, description = "")
        assertEquals("Ny bild", form.summary(ReviewWizardStep.Photo))
        assertEquals("Majornas bryggeri", form.summary(ReviewWizardStep.Bar))
        assertEquals("Husets stora stark · 69 kr*", form.summary(ReviewWizardStep.Beer))
        assertEquals("Riktigt bra · 0 rader", form.summary(ReviewWizardStep.Text))
    }

    // Beer volume

    /** A changed volume shows only its own problem: the brand is not picked yet, and that is fine. */
    @Test fun checkingOneFieldLeavesTheOthersAlone() {
        val form = createForm()
        form.draft = form.draft.copy(volumeCl = 500)
        assertFalse(form.validateField("/beer/volumeCl"))
        assertEquals(setOf("/beer/volumeCl"), form.fieldErrors.keys)
        form.draft = form.draft.copy(volumeCl = 50)
        assertTrue(form.validateField("/beer/volumeCl"))
        assertTrue(form.fieldErrors.isEmpty())
    }

    @Test fun anEditStartsWithTheSavedVolume() = assertEquals(50, editForm().draft.volumeCl)

    @Test fun theQuickPicksAreTheCommonSizes() = assertEquals(listOf(33, 40, 50, 60), ReviewFormModel.VOLUME_QUICK_PICKS)

    @Test fun aVolumeOutsideTheLimitsIsAFieldError() {
        for (volume in listOf(0, 201)) {
            val form = editForm()
            form.draft = form.draft.copy(volumeCl = volume)
            assertFalse(form.validate(ReviewWizardStep.Beer))
            assertEquals("Ange volymen i hela centiliter, mellan 1 och 200 cl.", form.error("/beer/volumeCl"))
        }
    }

    @Test fun savingSendsTheChosenVolume() = runTest {
        routes.json("PUT $slugPath", Fixtures.text("review"), 200, "ETag", "\"v2-def\"")
        val form = editForm()
        form.draft = form.draft.copy(volumeCl = 40)
        assertNotNull(form.submit())
        assertEquals(40, sentJson("PUT $slugPath").getValue("beer").jsonObject.getValue("volumeCl").jsonPrimitive.int)
    }

    /** Omitting `volumeCl` keeps the stored value, so a cleared field must send null. */
    @Test fun savingWithoutAVolumeClearsIt() = runTest {
        routes.json("PUT $slugPath", Fixtures.text("review"), 200, "ETag", "\"v2-def\"")
        val form = editForm()
        form.draft = form.draft.copy(volumeCl = null)
        form.submit()
        val json = sentJson("PUT $slugPath")
        val beer = json.getValue("beer").jsonObject
        assertEquals(JsonNull, beer["volumeCl"])
        assertEquals("Majornas bryggeri", json.getValue("title").jsonPrimitive.content)
        assertEquals(69, beer.getValue("priceKr").jsonPrimitive.int)
        assertTrue(json["imageFocus"] is JsonObject)
        assertEquals("\"v2-abc\"", routes.sent.last().headers["If-Match"])
    }

    // Delete

    /** The server only deletes the version the reviewer saw, so the strong tag goes out unchanged. */
    @Test fun deleteSendsTheReadETagAsIfMatch() = runTest {
        routes.on("DELETE $slugPath", MockResponse.Builder().code(204).build())
        val form = editForm()
        assertTrue(form.delete())
        val request = routes.sent.single()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1$slugPath", request.url.encodedPath)
        assertEquals("\"v2-abc\"", request.headers["If-Match"])
        assertNull(form.errorMessage)
    }

    /** 412: someone saved in between, nothing was deleted. The form offers the new version. */
    @Test fun aChangedReviewIsNotDeletedAndOffersAReload() = runTest {
        routes.problem("DELETE $slugPath", 412, "precondition_failed", "Recensionen har ändrats.")
        val form = editForm()
        assertFalse(form.delete())
        assertTrue(form.needsReload)
        assertEquals("Recensionen har ändrats.", form.errorMessage)
    }

    /** 409: a save raced the delete. */
    @Test fun aConcurrentSaveAlsoOffersAReload() = runTest {
        routes.problem("DELETE $slugPath", 409, "concurrent_update")
        val form = editForm()
        assertFalse(form.delete())
        assertTrue(form.needsReload)
    }

    /** 404: already deleted by someone else. The review is gone either way. */
    @Test fun anAlreadyDeletedReviewCountsAsGone() = runTest {
        routes.problem("DELETE $slugPath", 404, "not_found")
        assertTrue(editForm().delete())
    }

    @Test fun anExpiredSessionShowsTheErrorAndKeepsTheReview() = runTest {
        routes.problem("DELETE $slugPath", 401, "unauthorized", "Logga in igen.")
        val form = editForm()
        assertFalse(form.delete())
        assertFalse(form.needsReload)
        assertEquals("Logga in igen.", form.errorMessage)
    }

    /** A new review has nothing on the server to delete. */
    @Test fun aNewReviewCannotBeDeleted() = runTest {
        val form = createForm()
        assertFalse(form.canDelete)
        assertFalse(form.delete())
        assertEquals(0, routes.sent.size)
    }

    // Editing

    /** An unlisted brand becomes "another brand"; the editor is credited by default; the slug is kept. */
    @Test fun anEditStartsFromTheReview() {
        val form = editForm()
        assertEquals(ReviewFormModel.OTHER_BRAND, form.draft.brandChoice)
        assertEquals("Husets stora stark", form.draft.customBrand)
        assertEquals("Husets stora stark", form.brand)
        assertEquals(setOf("victor", "jonathan", "theo", "test"), form.draft.authors)
        assertEquals(listOf("test", "victor", "jonathan", "theo"), form.authorOptions)
        assertEquals("majornas-bryggeri", form.draft.slug)
        assertEquals("majornas-bryggeri", form.editedSlug)
        assertFalse(form.hasChanges)
    }

    /** All reviewers join the checklist after the signed-in user and the credits, without duplicates. */
    @Test fun authorOptionsKeepTheirOrder() = runTest {
        routes.json("GET /users", """{"users":[{"username":"anna"},{"username":"theo"},{"username":"test"}]}""")
        val form = editForm()
        form.loadAuthors()
        assertEquals(listOf("test", "victor", "jonathan", "theo", "anna"), form.authorOptions)
    }

    /** After a 412 the form reloads the latest version and saves with its tag. */
    @Test fun aConflictOffersTheLatestVersion() = runTest {
        routes.problem("PUT $slugPath", 412, "precondition_failed", "Recensionen har ändrats.")
        routes.json("PUT $slugPath", Fixtures.text("review"), 200, "ETag", "\"v4\"")
        routes.json("GET $slugPath", Fixtures.text("review"), 200, "ETag", "\"v3\"")
        val form = editForm()
        form.draft = form.draft.copy(title = "Min ändring")
        assertNull(form.submit())
        assertTrue(form.needsReload)
        form.reloadLatest()
        assertFalse(form.needsReload)
        assertEquals("Majornas bryggeri", form.draft.title)
        assertNotNull(form.submit())
        assertEquals("\"v3\"", routes.sent.last().headers["If-Match"])
    }

    // Validation and the request

    @Test fun eachStepChecksItsFields() {
        val form = createForm()
        assertFalse(form.validate(ReviewWizardStep.Photo))
        assertEquals("Ta eller välj en bild.", form.error("/image"))
        assertFalse(form.validate(ReviewWizardStep.Bar))
        assertEquals("Skriv barens namn.", form.error("/title"))
        assertEquals("Skriv adressen.", form.error("/location"))
        assertFalse(form.validate(ReviewWizardStep.Beer))
        assertEquals("Välj priset i hela kronor.", form.error("/beer/priceKr"))
        assertEquals("Välj ett ölmärke eller skriv ett eget.", form.error("/beer/brand"))
        assertTrue(form.validate(ReviewWizardStep.Ratings))
        assertFalse(form.validate(ReviewWizardStep.Text))
        assertEquals("Skriv några rader om baren.", form.error("/description"))
        assertTrue("the signed-in user is the default author", form.validate(ReviewWizardStep.Authors))
        assertEquals(ReviewWizardStep.Photo, form.firstStepWithError)
    }

    /** An invalid form sends nothing and points at the fields. */
    @Test fun anIncompleteFormSendsNothing() = runTest {
        val form = createForm()
        assertNull(form.submit())
        assertEquals("Kontrollera de markerade fälten.", form.errorMessage)
        assertEquals(0, routes.sent.size)
    }

    /** A new review sends the photo, all attributes (an empty list clears them), and rounded focus. */
    @Test fun createSendsTheFullReview() = runTest {
        routes.json("POST /reviews", Fixtures.text("review"), 201, "ETag", "\"v1\"")
        val form = createForm()
        form.fillIn()
        form.draft = form.draft.copy(focusX = 33.6, attributes = setOf(BarAttributeKey.darts, BarAttributeKey.quiz))
        assertNotNull(form.submit())
        val json = sentJson("POST /reviews")
        assertEquals(listOf("quiz", "darts"), (json.getValue("attributes") as JsonArray).map { it.jsonPrimitive.content })
        assertEquals(34.0, json.getValue("imageFocus").jsonObject.getValue("x").jsonPrimitive.double, 0.0)
        assertEquals("image/jpeg", json.getValue("image").jsonObject.getValue("contentType").jsonPrimitive.content)
        assertEquals(listOf("test"), (json.getValue("authors") as JsonArray).map { it.jsonPrimitive.content })
    }

    @Test fun aServerErrorShowsAtItsField() = runTest {
        routes.problem("POST /reviews", 400, "validation_failed", "Kontrollera fälten.", ""","errors":[{"pointer":"/location","detail":"Okänd adress."}]""")
        val form = createForm()
        form.fillIn()
        assertNull(form.submit())
        assertEquals("Okänd adress.", form.error("/location"))
        assertEquals(ReviewWizardStep.Bar, form.firstStepWithError)
        assertFalse(form.needsReload)
    }

    @Test fun aTooLargePhotoIsRejected() {
        val form = createForm()
        form.setImage(ByteArray(metadata.limits.imageMaxBytes + 1), ImageContentType.imageSlashJpeg)
        assertNull(form.newImage)
        assertEquals("Bilden är för stor.", form.error("/image"))
    }

    /** The overall rating follows the weighted aspects unless the reviewer picks one. */
    @Test fun theOverallRatingFollowsTheThresholds() {
        val form = createForm()
        assertEquals(0, form.suggestedOverallRating)
        form.draft = form.draft.copy(ratings = RatingKey.entries.associateWith { 4 })
        assertEquals(4.0, form.weightedScore, 0.0001)
        assertEquals(2, form.suggestedOverallRating)
        form.draft = form.draft.copy(ratings = RatingKey.entries.associateWith { 5 })
        assertEquals(3, form.effectiveOverallRating)
        form.draft = form.draft.copy(overallRating = 1)
        assertEquals(1, form.effectiveOverallRating)
    }

    // Local copy

    /** Unsaved work comes back for the same reviewer, with its step and photo, and never for another. */
    @Test fun aNewReviewKeepsALocalCopy() {
        val store = UnsavedReviewStore(Files.createTempDirectory("unsaved").toFile())
        val form = createForm(store)
        form.setImage(byteArrayOf(1, 2, 3), ImageContentType.imageSlashJpeg)
        form.draft = form.draft.copy(title = "Halvklar")
        form.saveLocalCopy(ReviewWizardStep.Beer)

        val restored = createForm(store)
        assertTrue(restored.restoredFromLocalCopy)
        assertEquals("Halvklar", restored.draft.title)
        assertEquals(ReviewWizardStep.Beer, restored.restoredStep)
        assertTrue(restored.newImageData!!.contentEquals(byteArrayOf(1, 2, 3)))

        assertFalse(createForm(store, user = "anna").restoredFromLocalCopy)

        restored.startOver()
        assertFalse(createForm(store).restoredFromLocalCopy)
    }

    /**
     * A saved review is no longer unsaved work: a late autosave (the app going to the background
     * while the page changes) must not bring it back as a new review.
     */
    @Test fun aSavedReviewLeavesNoLocalCopy() = runTest {
        routes.json("POST /reviews", Fixtures.text("review"), 201, "ETag", "\"v1\"")
        val store = UnsavedReviewStore(Files.createTempDirectory("unsaved").toFile())
        val form = createForm(store)
        form.fillIn()
        form.saveLocalCopy(ReviewWizardStep.Authors)
        assertNotNull(form.submit())
        form.saveLocalCopy(ReviewWizardStep.Authors)
        assertNull(store.load("test"))
    }

    /** A discarded review stays discarded, also when the closing wizard saves once more. */
    @Test fun aDiscardedReviewLeavesNoLocalCopy() {
        val store = UnsavedReviewStore(Files.createTempDirectory("unsaved").toFile())
        val form = createForm(store)
        form.draft = form.draft.copy(title = "Slängd")
        form.saveLocalCopy(ReviewWizardStep.Bar)
        form.discardLocalCopy()
        form.saveLocalCopy(ReviewWizardStep.Bar)
        assertNull(store.load("test"))
    }

    /** "Börja om" empties the form, and the new review is kept again. */
    @Test fun startingOverKeepsTheNewReview() {
        val store = UnsavedReviewStore(Files.createTempDirectory("unsaved").toFile())
        val form = createForm(store)
        form.draft = form.draft.copy(title = "Första")
        form.saveLocalCopy(ReviewWizardStep.Bar)
        form.startOver()
        assertNull(store.load("test"))
        form.draft = form.draft.copy(title = "Andra")
        form.saveLocalCopy(ReviewWizardStep.Bar)
        assertEquals("Andra", store.load("test")?.first?.draft?.title)
    }

    /** Edits are saved on the server only. */
    @Test fun anEditKeepsNoLocalCopy() {
        val store = UnsavedReviewStore(Files.createTempDirectory("unsaved").toFile())
        val form = ReviewFormModel(api, metadata, "test", Tagged(review, "\"v2\""), store)
        form.draft = form.draft.copy(title = "Ändrad")
        form.saveLocalCopy(ReviewWizardStep.Bar)
        assertFalse(createForm(store).restoredFromLocalCopy)
    }

    @Test fun pointersMapToWizardSteps() {
        assertEquals(ReviewWizardStep.Photo, ReviewWizardStep.forPointer("/image/data"))
        assertEquals(ReviewWizardStep.Bar, ReviewWizardStep.forPointer("/slug"))
        assertEquals(ReviewWizardStep.Bar, ReviewWizardStep.forPointer("/attributes/0"))
        assertEquals(ReviewWizardStep.Beer, ReviewWizardStep.forPointer("/beer/volumeCl"))
        assertEquals(ReviewWizardStep.Ratings, ReviewWizardStep.forPointer("/ratings/service"))
        assertEquals(ReviewWizardStep.Text, ReviewWizardStep.forPointer("/overallRating"))
        assertEquals(ReviewWizardStep.Authors, ReviewWizardStep.forPointer("/authors/1"))
        assertNull(ReviewWizardStep.forPointer("/unknown"))
    }
}
