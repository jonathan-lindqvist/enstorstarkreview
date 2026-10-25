package se.enstorstarkreview.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import java.math.BigDecimal
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.RobolectricTestRunner
import se.enstorstarkreview.api.models.*

/** Renders the feed card on the JVM, without a device: `gradle :app:recordRoborazziDebug`. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class ReviewCardScreenshotTest {
    private val review = Review(
        id = "1", slug = "majornas", title = "Majornas Grill och Bar",
        description = "- Unik toalett\n- Stammisar\n- Bra kelvin på lamporna",
        location = "Karl Johansgatan 72, 414 55 Göteborg",
        ratings = listOf(2, 2, 2, 2, 4, 3, 3, 4).map(::BigDecimal).let { r -> Ratings(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]) }, overallRating = 2,
        beer = Beer("Norrlands Guld Export", 55, 40, false), attributes = emptySet(),
        image = ReviewImage("/api/v1/images/x.jpg", BigDecimal(50), BigDecimal(50)),
        author = "victor", coAuthors = listOf("jonathan", "theo"),
        publicationStatus = PublicationStatus.draft,
        createdAt = "2026-09-26T21:05:46.485Z", updatedAt = "2026-09-26T21:05:46.485Z",
    )

    @Test
    fun reviewCard() {
        captureRoboImage("src/test/screenshots/ReviewCard.png") {
            EssTheme { Box(Modifier.wrapContentHeight(Alignment.Top)) { ReviewCard(review, Modifier.padding(16.dp)) } }
        }
    }
}
