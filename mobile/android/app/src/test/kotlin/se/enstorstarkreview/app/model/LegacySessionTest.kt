package se.enstorstarkreview.app.model

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LegacySessionTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private fun file() = File(context.dataDir, "shared_prefs/${LegacySession.PREFERENCES}.xml")

    /** The Skip build's encrypted session is not read; its file must not stay on the phone. */
    @Test fun theSkipSessionIsRemoved() {
        context.getSharedPreferences(LegacySession.PREFERENCES, Context.MODE_PRIVATE).edit().putString("session.token", "sealed").commit()
        assertTrue(file().exists())
        LegacySession.remove(context)
        assertFalse(file().exists())
    }

    /** The app's own session is left alone. */
    @Test fun theNativeSessionIsKept() {
        context.getSharedPreferences("secure", Context.MODE_PRIVATE).edit().putString("session.token", "sealed").commit()
        LegacySession.remove(context)
        assertTrue(context.getSharedPreferences("secure", Context.MODE_PRIVATE).contains("session.token"))
    }
}
