package se.enstorstarkreview.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.RobolectricTestRunner
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.app.model.ApiJson
import se.enstorstarkreview.app.model.Fixtures

/** Renders the feed card on the JVM, without a device: `gradle :app:recordRoborazziDebug`. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class ReviewCardScreenshotTest {
    private val review = ApiJson.decodeFromString<Review>(Fixtures.text("review"))

    @Test
    fun reviewCard() {
        captureRoboImage("src/test/screenshots/ReviewCard.png") {
            ScreenshotApp { Box(Modifier.wrapContentHeight(Alignment.Top)) { ReviewCard(review, Modifier.padding(16.dp), distance = "1,2 km") } }
        }
    }
}
