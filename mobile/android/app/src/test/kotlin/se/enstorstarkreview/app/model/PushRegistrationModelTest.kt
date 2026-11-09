package se.enstorstarkreview.app.model

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** A push device without Firebase: a fixed token and a switch for the system setting. */
class FakePushDevice(
    override val isConfigured: Boolean = true,
    var allowed: Boolean = true,
    var currentToken: String? = TOKEN,
) : PushDevice {
    var deletedTokens = 0
    override fun notificationsAllowed() = allowed
    override suspend fun token() = currentToken
    override suspend fun deleteToken() {
        deletedTokens++
        currentToken = null
    }

    companion object {
        const val TOKEN = "fcm-token:0123456789_abcdefghijklmnopqrstuvwxyz"
        const val OTHER_TOKEN = "fcm-token:9876543210_zyxwvutsrqponmlkjihgfedcba"
    }
}

class PushRegistrationModelTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private lateinit var api: ApiClient
    private val preferences = MemoryStorage()
    private val device = FakePushDevice()
    private var username: String? = null
    private var clock = 1_000_000_000_000L

    @get:Rule val folder = TemporaryFolder()

    @Before fun start() {
        server.dispatcher = routes
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
        routes.on("PUT /push-devices", noContent())
        routes.on("POST /push-devices/removal", noContent())
    }

    @After fun stop() = server.close()

    private fun noContent() = MockResponse.Builder().code(204).build()

    private fun kotlinx.coroutines.test.TestScope.model(
        device: PushDevice = this@PushRegistrationModelTest.device,
        api: ApiClient = this@PushRegistrationModelTest.api,
    ) = PushRegistrationModel(api, preferences, device, { username }, backgroundScope, { clock })

    private fun body(route: String, index: Int = 0) =
        ApiJson.parseToJsonElement(routes.sent.filter { "${it.method} ${it.url.encodedPath.removePrefix("/api/v1")}" == route }[index].body!!.utf8())

    private fun registrations() = routes.count("PUT /push-devices")

    // Requests

    @Test fun registeringAnonymouslySendsThePlatformAndTokenWithoutABearer() = runTest {
        model().turnOn().join()
        assertEquals(1, registrations())
        assertEquals(JsonObject(mapOf("platform" to JsonPrimitive("android"), "token" to JsonPrimitive(FakePushDevice.TOKEN))), body("PUT /push-devices"))
        assertNull(routes.sent.single().headers["Authorization"])
    }

    @Test fun registeringWhenSignedInSendsTheBearer() = runTest {
        api.token = "session-token"
        username = "test"
        model().turnOn().join()
        assertEquals("Bearer session-token", routes.sent.single().headers["Authorization"])
        assertFalse("apnsEnvironment" in (body("PUT /push-devices") as JsonObject))
    }

    @Test fun turningOffSendsTheRemovalWithoutABearerAndDeletesTheToken() = runTest {
        api.token = "session-token"
        username = "test"
        val push = model()
        push.turnOn().join()
        push.turnOff().join()
        val removal = routes.sent.single { it.url.encodedPath == "/api/v1/push-devices/removal" }
        assertEquals(JsonObject(mapOf("token" to JsonPrimitive(FakePushDevice.TOKEN))), body("POST /push-devices/removal"))
        assertNull(removal.headers["Authorization"])
        assertEquals(1, device.deletedTokens)
        assertFalse(push.isEnabled)
    }

    /** Turning on again after turning off registers the new token, even within 7 days. */
    @Test fun turningOnAgainRegistersAgain() = runTest {
        val push = model()
        push.turnOn().join()
        push.turnOff().join()
        device.currentToken = FakePushDevice.OTHER_TOKEN
        push.turnOn().join()
        assertEquals(2, registrations())
    }

    // When to register

    @Test fun nothingIsSentUntilNotificationsAreTurnedOn() = runTest {
        model().update().join()
        assertEquals(0, routes.sent.size)
    }

    @Test fun nothingIsSentWhenTheSystemBlocksNotifications() = runTest {
        device.allowed = false
        val push = model()
        push.turnOn().join()
        assertEquals(0, routes.sent.size)
        assertTrue(push.isEnabled)
        assertFalse(push.isAllowed)
    }

    @Test fun nothingIsSentWithoutAToken() = runTest {
        device.currentToken = null
        model().turnOn().join()
        assertEquals(0, routes.sent.size)
    }

    @Test fun nothingIsSentWhenFirebaseIsNotConfigured() = runTest {
        val push = model(device = FakePushDevice(isConfigured = false))
        assertFalse(push.isAvailable)
        push.turnOn().join()
        push.update().join()
        assertEquals(0, routes.sent.size)
    }

    @Test fun anUnchangedRegistrationIsNotSentAgain() = runTest {
        val push = model()
        push.turnOn().join()
        push.update().join()
        model().update().join()
        assertEquals(1, registrations())
    }

    @Test fun aNewTokenIsRegistered() = runTest {
        val push = model()
        push.turnOn().join()
        push.update(FakePushDevice.OTHER_TOKEN).join()
        assertEquals(2, registrations())
        assertEquals(JsonPrimitive(FakePushDevice.OTHER_TOKEN), (body("PUT /push-devices", 1) as JsonObject)["token"])
    }

    @Test fun signingInRegistersAgainWithTheBearer() = runTest {
        val push = model()
        push.turnOn().join()
        api.token = "session-token"
        username = "test"
        push.update().join()
        assertEquals(2, registrations())
        assertEquals("Bearer session-token", routes.sent.last().headers["Authorization"])
    }

    @Test fun anotherServerIsRegisteredAgain() = runTest {
        model().turnOn().join()
        val other = MockWebServer().apply { dispatcher = routes; start() }
        try {
            model(api = ApiClient(other.url("/").toString().trimEnd('/'))).update().join()
        } finally {
            other.close()
        }
        assertEquals(2, registrations())
    }

    @Test fun aRegistrationIsRefreshedAfterSevenDays() = runTest {
        val push = model()
        push.turnOn().join()
        clock += 7 * DAY - 1
        push.update().join()
        assertEquals(1, registrations())
        clock += 1
        push.update().join()
        assertEquals(2, registrations())
    }

    /** The decision table on its own. */
    @Test fun needsRegistrationOnlyWhenSomethingChanged() {
        val last = PushRegistration("hash", "test", "https://enstorstark.se", 0)
        assertTrue(PushRegistrationModel.needsRegistration(null, last))
        assertFalse(PushRegistrationModel.needsRegistration(last, last.copy(at = 7 * DAY - 1)))
        assertTrue(PushRegistrationModel.needsRegistration(last, last.copy(at = 7 * DAY)))
        assertTrue(PushRegistrationModel.needsRegistration(last, last.copy(tokenHash = "other")))
        assertTrue(PushRegistrationModel.needsRegistration(last, last.copy(username = null)))
        assertTrue(PushRegistrationModel.needsRegistration(last, last.copy(username = "other")))
        assertTrue(PushRegistrationModel.needsRegistration(last, last.copy(server = "http://10.0.2.2:5173")))
        assertTrue("a clock that went back", PushRegistrationModel.needsRegistration(last.copy(at = 10), last.copy(at = 5)))
    }

    /** The stored registration holds no token, only its hash. */
    @Test fun theStoredRegistrationHoldsNoToken() = runTest {
        model().turnOn().join()
        assertTrue(preferences.values.isNotEmpty())
        assertTrue(preferences.values.values.none { FakePushDevice.TOKEN in it })
    }

    @Test fun aBlockedPermissionRemovesTheRegistration() = runTest {
        val push = model()
        push.turnOn().join()
        device.allowed = false
        push.update().join()
        assertEquals(1, routes.count("POST /push-devices/removal"))
        device.allowed = true
        push.update().join()
        assertEquals(2, registrations())
    }

    // Failures

    @Test fun aRateLimitedRegistrationIsRetriedNextTime() = runTest {
        routes.clear("PUT /push-devices")
        routes.problem("PUT /push-devices", 429, "rate_limited")
        routes.on("PUT /push-devices", noContent())
        val push = model()
        push.turnOn().join()
        push.update().join()
        push.update().join()
        assertEquals(2, registrations())
    }

    @Test fun anUnavailableServerIsRetriedNextTime() = runTest {
        routes.clear("PUT /push-devices")
        routes.problem("PUT /push-devices", 503, "service_unavailable")
        routes.on("PUT /push-devices", noContent())
        val push = model()
        push.turnOn().join()
        push.update().join()
        push.update().join()
        assertEquals(2, registrations())
    }

    @Test fun aNetworkErrorIsRetriedNextTime() = runTest {
        val offline = ApiClient("http://127.0.0.1:9")
        model(api = offline).turnOn().join()
        model().update().join()
        assertEquals(1, registrations())
    }

    /** A 401 signs out as everywhere else; the app then registers the device anonymously. */
    @Test fun anExpiredSessionSignsOutAndRegistersAnonymously() = runTest {
        routes.json("GET /reviews", "[]")
        routes.clear("PUT /push-devices")
        routes.problem("PUT /push-devices", 401, "unauthorized")
        routes.on("PUT /push-devices", noContent())
        val storage = MemoryStorage().also { CredentialStore(it).save(Credentials("test", "tok")) }
        val app = AppModel(api, storage, backgroundScope, folder.root, preferences, device)
        app.push.turnOn().join()
        app.push.latestUpdate?.join()
        assertNull(app.session.username)
        assertEquals(2, registrations())
        val (first, second) = routes.sent.filter { it.method == "PUT" }
        assertEquals("Bearer tok", first.headers["Authorization"])
        assertNull(second.headers["Authorization"])
    }

    @Test fun signingOutRegistersAnonymously() = runTest {
        routes.json("GET /reviews", "[]")
        routes.on("DELETE /sessions/current", noContent())
        val storage = MemoryStorage().also { CredentialStore(it).save(Credentials("test", "tok")) }
        val app = AppModel(api, storage, backgroundScope, folder.root, preferences, device)
        app.push.turnOn().join()
        app.session.signOut()
        app.push.latestUpdate?.join()
        assertEquals(2, registrations())
        assertNull(routes.sent.last { it.method == "PUT" }.headers["Authorization"])
    }

    // The one-time prompt

    @Test fun thePromptIsNotShownOnTheFirstLaunch() = runTest {
        val push = model()
        push.didLaunch()
        assertFalse(push.isPromptVisible)
    }

    @Test fun thePromptIsShownOnTheSecondLaunch() = runTest {
        model().didLaunch()
        val push = model()
        push.didLaunch()
        assertTrue(push.isPromptVisible)
    }

    @Test fun thePromptIsShownAfterViewingAReview() = runTest {
        val push = model()
        push.didLaunch()
        push.didViewReview()
        assertTrue(push.isPromptVisible)
    }

    @Test fun thePromptIsNeverShownAgainAfterNotNow() = runTest {
        val push = model()
        push.didLaunch()
        push.didViewReview()
        push.answerPrompt(accepted = false)
        assertFalse(push.isPromptVisible)
        assertFalse(push.isEnabled)
        model().apply { didLaunch() }.also { assertFalse(it.isPromptVisible) }
        assertEquals(0, routes.sent.size)
    }

    @Test fun thePromptIsNeverShownAgainAfterYes() = runTest {
        val push = model()
        push.didViewReview()
        push.answerPrompt(accepted = true)
        push.latestUpdate?.join()
        assertTrue(push.isEnabled)
        assertFalse(push.isPromptVisible)
        assertEquals(1, registrations())
        model().apply { didLaunch(); didLaunch() }.also { assertFalse(it.isPromptVisible) }
    }

    @Test fun thePromptIsNotShownWhenTheToggleWasUsed() = runTest {
        val push = model()
        push.turnOn().join()
        push.turnOff().join()
        push.didLaunch()
        push.didLaunch()
        push.didViewReview()
        assertFalse(push.isPromptVisible)
    }

    @Test fun thePromptIsNotShownWhenFirebaseIsNotConfigured() = runTest {
        val push = model(device = FakePushDevice(isConfigured = false))
        push.didLaunch()
        push.didLaunch()
        push.didViewReview()
        assertFalse(push.isPromptVisible)
    }

    // Configuration and permission

    @Test fun firebaseIsConfiguredOnlyWithAllFourValues() {
        val settings = FirebaseSettings("enstorstark", "1:123:android:abc", "AIzaKey", "123")
        assertTrue(settings.isConfigured)
        assertFalse(settings.copy(projectId = "").isConfigured)
        assertFalse(settings.copy(appId = " ").isConfigured)
        assertFalse(settings.copy(apiKey = "").isConfigured)
        assertFalse(settings.copy(senderId = "").isConfigured)
    }

    @Test fun thePermissionIsRequestedOnlyOnAndroid13WhenItCanStillBeAsked() {
        val ask = PushRegistrationModel::shouldRequestPermission
        assertFalse("Android 12 has no runtime permission", ask(32, false, false, false))
        assertFalse("already granted", ask(33, true, false, false))
        assertTrue("never asked", ask(33, false, false, false))
        assertTrue("denied once, may ask again", ask(33, false, true, true))
        assertFalse("denied for good: open the settings instead", ask(33, false, true, false))
    }

    @Test fun theRequestedPermissionIsRemembered() = runTest {
        model().didRequestPermission()
        assertTrue(model().hasRequestedPermission)
    }

    private companion object {
        const val DAY = 24 * 60 * 60 * 1000L
    }
}
