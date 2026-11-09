package se.enstorstarkreview.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import se.enstorstarkreview.app.model.FirebaseSettings
import se.enstorstarkreview.app.model.PushDevice
import se.enstorstarkreview.app.model.ReviewLink

/**
 * Firebase Cloud Messaging without google-services.json: the options come from BuildConfig, and
 * the manifest removes Firebase's automatic start. Without them the feature stays hidden.
 */
class FirebasePushDevice(private val context: Context) : PushDevice {
    private val settings = FirebaseSettings(
        projectId = BuildConfig.FIREBASE_PROJECT_ID,
        appId = BuildConfig.FIREBASE_APP_ID,
        apiKey = BuildConfig.FIREBASE_API_KEY,
        senderId = BuildConfig.FIREBASE_SENDER_ID,
    )

    override val isConfigured: Boolean = settings.isConfigured && start()

    override fun notificationsAllowed(): Boolean {
        val manager = NotificationManagerCompat.from(context)
        val channel = manager.getNotificationChannel(ReviewNotifications.CHANNEL)
        return manager.areNotificationsEnabled() && channel?.importance != NotificationManager.IMPORTANCE_NONE
    }

    override suspend fun token(): String? = try {
        // Firebase keeps the token fresh from now on, and onNewToken reports new ones.
        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        FirebaseMessaging.getInstance().token.await()
    } catch (error: Exception) {
        Log.i(TAG, "No push token: ${error.javaClass.simpleName}")
        null
    }

    override suspend fun deleteToken() {
        FirebaseMessaging.getInstance().isAutoInitEnabled = false
        FirebaseMessaging.getInstance().deleteToken().await()
    }

    private fun start(): Boolean = try {
        if (FirebaseApp.getApps(context).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId(settings.projectId)
                .setApplicationId(settings.appId)
                .setApiKey(settings.apiKey)
                .setGcmSenderId(settings.senderId)
                .build()
            FirebaseApp.initializeApp(context, options)
        }
        ReviewNotifications.createChannel(context)
        true
    } catch (error: Exception) {
        Log.e(TAG, "Firebase did not start; notifications are hidden", error)
        false
    }

    private companion object {
        const val TAG = "FirebasePushDevice"
    }
}

/** The "Nya recensioner" channel and the notifications the app posts itself. */
object ReviewNotifications {
    /** Also the `channel_id` that the server sends. */
    const val CHANNEL = "new_reviews"

    fun createChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, "Nya recensioner", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "En notis när en ny recension publiceras."
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** In the foreground Firebase hands the message to the app, which shows it like the system would. */
    fun show(context: Context, title: String, body: String, slug: String?) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .apply { slug?.let { putExtra(ReviewLink.SLUG_EXTRA, it) } }
        val pending = PendingIntent.getActivity(
            context, slug.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFFFB833.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(context).notify(slug ?: "review", 0, notification)
    }
}

/** New tokens and messages that arrive while the app is in the foreground. */
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        (application as EnStorStarkApp).model.push.update(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val notification = message.notification ?: return
        val slug = ReviewLink.slug(message.data[ReviewLink.SLUG_EXTRA])
        ReviewNotifications.show(this, notification.title ?: "Ny recension", notification.body.orEmpty(), slug)
    }
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnCompleteListener { task ->
        val error = task.exception
        if (error != null) continuation.resumeWith(Result.failure(error))
        else if (task.isCanceled) continuation.resumeWith(Result.failure(java.util.concurrent.CancellationException("Task cancelled")))
        else continuation.resume(task.result)
    }
}
