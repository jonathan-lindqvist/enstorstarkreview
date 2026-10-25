package se.enstorstarkreview.app.model

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ReviewRequestModelTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private lateinit var model: ReviewRequestModel

    @Before fun start() {
        server.dispatcher = routes
        server.start()
        model = ReviewRequestModel(ApiClient(server.url("/").toString().trimEnd('/')))
    }

    @After fun stop() = server.close()

    @Test fun nameAndAddressAreRequired() {
        assertFalse(model.canSubmit)
        model.barName = "  "
        model.location = "Gatan 1"
        assertFalse(model.canSubmit)
        model.barName = "Baren"
        assertTrue(model.canSubmit)
    }

    /** Sends trimmed text, then clears the form and shows the server's message. */
    @Test fun submitTrimsAndClears() = runTest {
        routes.json("POST /review-requests", """{"message":"Tack för tipset!"}""", 202)
        model.barName = " Baren "
        model.location = " Gatan 1 "
        model.motivation = " Billig öl "
        model.submit()
        val sent = ApiJson.parseToJsonElement(routes.sent.single().body!!.utf8()).jsonObject
        assertEquals("Baren", sent.getValue("barName").jsonPrimitive.content)
        assertEquals("Gatan 1", sent.getValue("location").jsonPrimitive.content)
        assertEquals("Billig öl", sent.getValue("motivation").jsonPrimitive.content)
        assertEquals("Tack för tipset!", model.successMessage)
        assertEquals("", model.barName)
        assertNull(model.errorMessage)
    }

    /** Field errors come keyed by JSON Pointer; the form keeps the text. */
    @Test fun validationErrorsKeepTheText() = runTest {
        routes.problem("POST /review-requests", 400, "validation_failed", "Kontrollera fälten.",
            ""","errors":[{"pointer":"/location","detail":"Ange en adress."}]""")
        model.barName = "Baren"
        model.location = "x"
        model.submit()
        assertEquals("Ange en adress.", model.fieldErrors["/location"])
        assertEquals("Kontrollera fälten.", model.errorMessage)
        assertEquals("x", model.location)
        assertFalse(model.isSubmitting)
    }
}
