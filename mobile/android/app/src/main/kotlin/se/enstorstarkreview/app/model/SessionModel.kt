package se.enstorstarkreview.app.model

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Reader mode or reviewer mode. The server still does all authorization; this only decides which
 * controls the app shows and whether it sends a token.
 */
class SessionModel(private val api: ApiClient, private val store: CredentialStore) {
    /** The signed-in reviewer, or null in reader mode. */
    var username by mutableStateOf<String?>(null)
        private set
    var isSigningIn by mutableStateOf(false)
        private set

    /** A Swedish message for the login form. */
    var errorMessage by mutableStateOf<String?>(null)
        private set

    val isSignedIn: Boolean get() = username != null

    /** Called after a sign-in, a sign-out, or an expired token. */
    var onChange: (() -> Unit)? = null

    init {
        // Set the token before the first request, so the first list already has drafts.
        store.load()?.let {
            api.token = it.token
            username = it.username
        }
        api.onUnauthorized = { expire() }
    }

    /**
     * Checks a saved token with the server. A 401 expires it (see [ApiClient]). On a network error
     * the app stays in reviewer mode, so it also works with a bad connection.
     */
    suspend fun validate() {
        val token = api.token ?: return
        try {
            val name = api.currentUsername()
            if (name != username) {
                username = name
                store.save(Credentials(name, token))
            }
        } catch (error: ApiException) {
            Log.i(TAG, "Session check failed: ${error.message}")
        }
    }

    suspend fun signIn(username: String, password: String): Boolean {
        isSigningIn = true
        errorMessage = null
        return try {
            val session = api.signIn(username.trim(), password)
            api.token = session.token
            store.save(Credentials(session.username, session.token))
            this.username = session.username
            onChange?.invoke()
            true
        } catch (error: ApiException) {
            errorMessage = error.message
            false
        } finally {
            isSigningIn = false
        }
    }

    suspend fun signOut() {
        if (!isSignedIn) return
        // Invalidate the token on the server, but sign out locally also when that fails.
        try {
            api.signOut()
        } catch (_: ApiException) {
        }
        clearLocalSession()
    }

    fun clearError() {
        errorMessage = null
    }

    private fun expire() {
        if (!isSignedIn) return
        Log.i(TAG, "The server rejected the token; changing to reader mode")
        clearLocalSession()
    }

    private fun clearLocalSession() {
        api.token = null
        store.clear()
        username = null
        onChange?.invoke()
    }

    private companion object {
        const val TAG = "SessionModel"
    }
}
