package se.enstorstarkreview.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** The "Notiser om nya recensioner" row on Om: on, and turned on but blocked in the system settings. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h360dp-xxhdpi")
class NotificationScreenshotTest {
    @Test
    fun notificationRow() {
        captureRoboImage("src/test/screenshots/NotificationRow.png") {
            ScreenshotApp {
                Column(Modifier.background(Ess.bg).padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    NotificationRow(isOn = true, isBlocked = false, onChange = {}, openSettings = {})
                    NotificationRow(isOn = false, isBlocked = true, onChange = {}, openSettings = {})
                }
            }
        }
    }
}
