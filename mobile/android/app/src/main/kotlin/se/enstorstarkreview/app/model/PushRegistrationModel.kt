package se.enstorstarkreview.app.model

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable

/**
 * The Firebase project the app talks to. All four values come from the build (see the README);
 * without them the notification feature is hidden.
 */
data class FirebaseSettings(val projectId: String, val appId: String, val apiKey: String, val senderId: String) {
    val isConfigured: Boolean get() = listOf(projectId, appId, apiKey, senderId).none { it.isBlank() }
}

/** The device's side of push notifications: Firebase and the system's notification settings. */
interface PushDevice {
    /** False when the build has no Firebase project: the feature is hidden. */
    val isConfigured: Boolean

    /** The runtime permission (Android 13+), the app's notification switch, and the channel. */
    fun notificationsAllowed(): Boolean

    /** The Firebase registration token, or null when Firebase cannot give one now. */
    suspend fun token(): String?

    /** Invalidates the token, so nothing more reaches this device even if the server keeps it. */
    suspend fun deleteToken()

    object Unavailable : PushDevice {
        override val isConfigured = false
        override fun notificationsAllowed() = false
        override suspend fun token(): String? = null
        override suspend fun deleteToken() {}
    }
}

/** The last registration the server accepted. Not secret: the token is kept only as a hash. */
@Serializable
data class PushRegistration(val tokenHash: String, val username: String?, val server: String, val at: Long)

/**
 * Notifications about newly published reviews. The device is registered when the user turned them
 * on, the system allows them, and Firebase has a token, and only when the token, the signed-in
 * reviewer, or the server changed since the last registration, or it is [REFRESH_AFTER] old. The
 * server forgets devices that do not refresh within 60 days.
 */
class PushRegistrationModel(
    private val api: ApiClient,
    private val storage: SecureStorage,
    private val device: PushDevice,
    private val username: () -> String?,
    private val scope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val mutex = Mutex()

    /** The user's choice: null until they answer the prompt or use the switch. */
    private var decision by mutableStateOf(storage.get(ENABLED)?.toBooleanStrictOrNull())
    private var launches by mutableIntStateOf(storage.get(LAUNCHES)?.toIntOrNull() ?: 0)
    private var viewedReview by mutableStateOf(storage.get(VIEWED_REVIEW) == "true")

    /** False when the build has no Firebase project; the settings row and the prompt are hidden. */
    val isAvailable: Boolean get() = device.isConfigured

    /** The user turned notifications on. They only arrive when [isAllowed] too. */
    val isEnabled: Boolean get() = decision == true

    /** The system allows notifications. Updated by [update]. */
    var isAllowed by mutableStateOf(device.isConfigured && device.notificationsAllowed())
        private set

    /** The one-time question, from the second launch or after the first review page. */
    val isPromptVisible: Boolean get() = isAvailable && decision == null && (launches >= 2 || viewedReview)

    val hasRequestedPermission: Boolean get() = storage.get(PERMISSION_REQUESTED) == "true"

    /** The last job that [update] started, for callers that need to wait for it. */
    @Volatile var latestUpdate: Job? = null
        private set

    /** Checks the registration in the background, with [token] when Firebase just issued one. */
    fun update(token: String? = null): Job = scope.launch { refresh(token) }.also { latestUpdate = it }

    suspend fun refresh(token: String? = null) = mutex.withLock {
        if (!isAvailable) return@withLock
        isAllowed = device.notificationsAllowed()
        if (decision != true) return@withLock
        if (!isAllowed) {
            // Blocked in the system settings: stop the server sending until they are allowed again.
            if (lastRegistration() != null) remove()
            return@withLock
        }
        val current = token ?: device.token() ?: return@withLock
        val registration = PushRegistration(hash(current), username(), api.serverOrigin, now())
        if (!needsRegistration(lastRegistration(), registration)) return@withLock
        try {
            api.registerPushDevice(current)
            storage.set(REGISTRATION, ApiJson.encodeToString(PushRegistration.serializer(), registration))
        } catch (error: ApiException) {
            // Kept unchanged, so the next launch tries again. A 401 has already signed out.
            Log.i(TAG, "Push registration did not complete: ${error.message}")
        }
    }

    /** The switch, or "Ja tack". The UI asks for the permission after this. */
    fun turnOn(): Job {
        decide(true)
        return update()
    }

    /** The switch: the server forgets the device and the token is deleted. */
    fun turnOff(): Job {
        decide(false)
        return scope.launch {
            mutex.withLock {
                remove()
                runCatching { device.deleteToken() }.onFailure { Log.i(TAG, "Could not delete the push token") }
            }
        }
    }

    /** The one-time prompt. "Inte nu" only records the answer. */
    fun answerPrompt(accepted: Boolean) {
        if (accepted) turnOn() else decide(false)
    }

    fun didLaunch() {
        launches += 1
        storage.set(LAUNCHES, launches.toString())
    }

    fun didViewReview() {
        if (viewedReview) return
        viewedReview = true
        storage.set(VIEWED_REVIEW, "true")
    }

    fun didRequestPermission() = storage.set(PERMISSION_REQUESTED, "true")

    private fun decide(enabled: Boolean) {
        decision = enabled
        storage.set(ENABLED, enabled.toString())
    }

    private suspend fun remove() {
        if (lastRegistration() != null) {
            val token = device.token()
            if (token != null) {
                try {
                    api.unregisterPushDevice(token)
                } catch (error: ApiException) {
                    // Deleting the token stops delivery anyway, and the server forgets it in 60 days.
                    Log.i(TAG, "Push removal did not complete: ${error.message}")
                }
            }
        }
        storage.remove(REGISTRATION)
    }

    private fun lastRegistration(): PushRegistration? = storage.get(REGISTRATION)?.let {
        runCatching { ApiJson.decodeFromString(PushRegistration.serializer(), it) }.getOrNull()
    }

    companion object {
        const val REFRESH_AFTER = 7 * 24 * 60 * 60 * 1000L

        /** Register when anything the server keeps changed, or the last registration is old. */
        fun needsRegistration(last: PushRegistration?, current: PushRegistration): Boolean =
            last == null || last.tokenHash != current.tokenHash || last.username != current.username ||
                last.server != current.server || current.at - last.at !in 0 until REFRESH_AFTER

        /**
         * Ask for POST_NOTIFICATIONS on Android 13+ unless granted or denied for good. After a
         * second denial the system no longer shows the dialog, so the app links to its settings.
         */
        fun shouldRequestPermission(sdkInt: Int, granted: Boolean, requestedBefore: Boolean, showRationale: Boolean): Boolean =
            sdkInt >= 33 && !granted && (!requestedBefore || showRationale)

        private fun hash(token: String): String =
            MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).joinToString("") { "%02x".format(it) }

        private const val TAG = "PushRegistration"
        private const val ENABLED = "push.enabled"
        private const val LAUNCHES = "push.launches"
        private const val VIEWED_REVIEW = "push.viewedReview"
        private const val PERMISSION_REQUESTED = "push.permissionRequested"
        private const val REGISTRATION = "push.registration"
    }
}
