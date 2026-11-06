package se.enstorstarkreview.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import se.enstorstarkreview.api.models.ReviewMetadata
import se.enstorstarkreview.api.models.ReviewStatistics
import se.enstorstarkreview.app.model.ApiClient
import se.enstorstarkreview.app.model.ApiJson
import se.enstorstarkreview.app.model.Fixtures
import se.enstorstarkreview.app.model.PriceValue
import se.enstorstarkreview.app.model.ReviewFormModel

/** The Prisvärdhet chart and the beer step with an unknown brand, on the JVM: `gradle :app:recordRoborazziDebug`. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class StatisticsScreenshotTest {
    private val statistics = ApiJson.decodeFromString<ReviewStatistics>(Fixtures.text("statistics"))
    private val metadata = ApiJson.decodeFromString<ReviewMetadata>(Fixtures.text("review-metadata"))

    @Test
    fun priceValueGates() {
        captureRoboImage("src/test/screenshots/PriceValueGates.png") {
            ScreenshotApp {
                Box(Modifier.background(Ess.raised).padding(16.dp)) { PriceValueGates(PriceValue.compare(statistics.priceComparison)) {} }
            }
        }
    }

    @Config(qualifiers = "w411dp-h1600dp-mdpi")
    @Test
    fun beerStepStartsWithAnUnknownBrand() {
        val form = ReviewFormModel(ApiClient("http://127.0.0.1:9"), metadata, "test", null)
        captureRoboImage("src/test/screenshots/WizardBeerStep.png") {
            ScreenshotApp { Box(Modifier.background(Ess.bg)) { WizardBeerStep(form) } }
        }
    }
}
