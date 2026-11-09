package se.enstorstarkreview.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import se.enstorstarkreview.app.model.ReviewLink
import se.enstorstarkreview.app.ui.AppRoot
import se.enstorstarkreview.app.ui.EssTheme

class MainActivity : ComponentActivity() {
    private val app get() = (application as EnStorStarkApp).model

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        // A recreated activity has already handled its launch and its notification.
        if (savedInstanceState == null) {
            app.push.didLaunch()
            openTappedReview(intent)
        }
        setContent { EssTheme { AppRoot(app) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openTappedReview(intent)
    }

    /** A tapped notification carries the review's slug, from the system or from [ReviewNotifications]. */
    private fun openTappedReview(intent: Intent) {
        ReviewLink.slug(intent.getStringExtra(ReviewLink.SLUG_EXTRA))?.let { app.requestedReview = it }
        intent.removeExtra(ReviewLink.SLUG_EXTRA)
    }
}
