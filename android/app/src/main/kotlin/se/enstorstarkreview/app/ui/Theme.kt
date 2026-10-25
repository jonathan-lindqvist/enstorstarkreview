package se.enstorstarkreview.app.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object Ess {
    val amber = Color(0xFFFFB833)
    val amberDeep = Color(0xFFEB8C0D)
    val foam = Color(0xFFFFF5DB)
    val good = Color(0xFF73DB85)
    val bad = Color(0xFFFF7566)

    // Black page as on iOS; raised surfaces carry a slight warm tint from the amber, as Material 3
    // tonal surfaces do (about a third of the full tonal palette).
    val bg = Color.Black
    val raised = Color(0xFF1C1A17)
    val raised2 = Color(0xFF2A2724)
    val raised3 = Color(0xFF393531)
    val secondaryText = Color(0xFFF5EFE8).copy(alpha = 0.62f)
    val tertiaryText = Color(0xFFF5EFE8).copy(alpha = 0.38f)
    val hairline = Color(0xFFF5EFE8).copy(alpha = 0.12f)
    val onAmber = Color.Black

    val scheme = darkColorScheme(
        primary = amber, onPrimary = onAmber,
        primaryContainer = Color(0xFF33260A), onPrimaryContainer = Color(0xFFFFDEA8),
        secondary = Color.White, onSecondary = Color.Black,
        secondaryContainer = raised2, onSecondaryContainer = Color.White,
        tertiary = good, onTertiary = Color(0xFF0E3818),
        tertiaryContainer = Color(0xFF12261A), onTertiaryContainer = Color(0xFFB6F2BB),
        error = bad, onError = Color(0xFF690005),
        errorContainer = Color(0xFF2E1412), onErrorContainer = Color(0xFFFFDAD6),
        background = bg, onBackground = Color.White,
        surface = bg, onSurface = Color.White,
        surfaceVariant = raised2, onSurfaceVariant = secondaryText,
        surfaceContainerLowest = bg, surfaceContainerLow = raised,
        surfaceContainer = Color(0xFF141414), surfaceContainerHigh = raised2,
        surfaceContainerHighest = raised3, surfaceBright = raised3,
        outline = tertiaryText, outlineVariant = hairline,
        inverseSurface = raised3, inverseOnSurface = Color.White, inversePrimary = amber,
        scrim = Color.Black,
    )

    private val base = Typography()
    private val tight = (-0.5).sp
    val typography = Typography(
        displayLarge = base.displayLarge.copy(fontWeight = FontWeight.Black, letterSpacing = tight),
        displayMedium = base.displayMedium.copy(fontWeight = FontWeight.Black, letterSpacing = tight),
        displaySmall = base.displaySmall.copy(fontWeight = FontWeight.Black, letterSpacing = tight),
        // Heavy only for large titles (screen and step titles) and numbers; the rest is Material weight.
        headlineLarge = base.headlineLarge.copy(fontWeight = FontWeight.ExtraBold),
        headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.Bold),
        headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        titleSmall = base.titleSmall, bodyLarge = base.bodyLarge, bodyMedium = base.bodyMedium,
        bodySmall = base.bodySmall, labelLarge = base.labelLarge, labelMedium = base.labelMedium,
        labelSmall = base.labelSmall,
    )

    /** Big prices and rating numbers, with the warm amber glow of the iOS design. */
    fun num(size: Int, glow: Color? = null) = TextStyle(
        fontSize = size.sp, fontWeight = FontWeight.Black, lineHeight = (size * 1.05).sp, letterSpacing = (-0.02 * size).sp,
        shadow = glow?.let { Shadow(it.copy(alpha = 0.65f), Offset.Zero, size * 0.5f) },
    )
}

/** Every Android node: the app's dark amber Material 3 theme on the background. */
@Composable
fun EssTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Ess.scheme, typography = Ess.typography) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface, contentColor = MaterialTheme.colorScheme.onSurface) {
            content()
        }
    }
}
