package se.enstorstarkreview.app.model

import kotlinx.coroutines.test.runTest
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

class MemoryStorage : SecureStorage {
    val values = mutableMapOf<String, String>()
    override fun get(key: String) = values[key]
    override fun set(key: String, value: String) { values[key] = value }
    override fun remove(key: String) { values.remove(key) }
}

class SessionModelTest {
    private val server = MockWebServer()
    private lateinit var api: ApiClient
    private val storage = MemoryStorage()

    @Before fun start() {
        server.start()
        api = ApiClient(server.url("/").toString().trimEnd('/'))
    }

    @After fun stop() = server.close()

    private fun respond(code: Int, body: String = "", contentType: String = "application/json") =
        server.enqueue(MockResponse.Builder().code(code).headers(headersOf("Content-Type", contentType)).body(body).build())

    /** The first list request after launch already has drafts. */
    @Test fun aSavedSessionSetsTheTokenAtOnce() {
        CredentialStore(storage).save(Credentials("test", "tok"))
        val session = SessionModel(api, CredentialStore(storage))
        assertEquals("test", session.username)
        assertEquals("tok", api.token)
    }

    @Test fun signingInSavesTheSession() = runTest {
        var changes = 0
        val session = SessionModel(api, CredentialStore(storage)).apply { onChange = { changes++ } }
        respond(201, """{"user":{"username":"test"},"expiresAt":"2026-11-25T12:00:00.000Z","token":"tok"}""")
        assertTrue(session.signIn(" test ", "pw"))
        assertEquals("test", session.username)
        assertEquals(Credentials("test", "tok"), CredentialStore(storage).load())
        assertEquals(1, changes)
    }

    @Test fun aFailedSignInShowsTheServersMessage() = runTest {
        val session = SessionModel(api, CredentialStore(storage))
        respond(401, """{"type":"about:blank","title":"Fel","status":401,"code":"invalid_credentials","detail":"Fel användarnamn eller lösenord."}""", "application/problem+json")
        assertFalse(session.signIn("test", "fel"))
        assertEquals("Fel användarnamn eller lösenord.", session.errorMessage)
        assertNull(CredentialStore(storage).load())
    }

    /** Sign out locally even when the server cannot be reached. */
    @Test fun signingOutClearsTheSessionEvenOffline() = runTest {
        CredentialStore(storage).save(Credentials("test", "tok"))
        val session = SessionModel(api, CredentialStore(storage))
        server.close()
        session.signOut()
        assertNull(session.username)
        assertNull(api.token)
        assertNull(CredentialStore(storage).load())
    }

    @Test fun anExpiredTokenChangesToReaderMode() = runTest {
        CredentialStore(storage).save(Credentials("test", "tok"))
        val session = SessionModel(api, CredentialStore(storage))
        respond(401, """{"type":"about:blank","title":"Fel","status":401,"code":"unauthorized","detail":"Logga in."}""", "application/problem+json")
        session.validate()
        assertNull(session.username)
        assertNull(CredentialStore(storage).load())
    }

    /** With a bad connection the app stays in reviewer mode. */
    @Test fun aNetworkErrorKeepsTheSession() = runTest {
        CredentialStore(storage).save(Credentials("test", "tok"))
        val session = SessionModel(api, CredentialStore(storage))
        server.close()
        session.validate()
        assertEquals("test", session.username)
    }
}
