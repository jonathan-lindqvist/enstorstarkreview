package en.stor.stark

import skip.lib.*
import skip.model.*
import skip.foundation.*
import skip.ui.*

import android.Manifest
import android.app.Application
import android.graphics.Color as AndroidColor
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.activity.ComponentActivity
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.core.app.ActivityCompat

internal val logger: SkipLogger = SkipLogger(subsystem = "se.enstorstarkreview.app", category = "EnStorStark")

private typealias AppRootView = EnStorStarkRootView
private typealias AppDelegate = EnStorStarkAppDelegate

/// AndroidAppMain is the `android.app.Application` entry point, and must match `application android:name` in the AndroidMainfest.xml file.
open class AndroidAppMain: Application {
    constructor() {
    }

    override fun onCreate() {
        super.onCreate()
        logger.info("starting app")
        ProcessInfo.launch(applicationContext)
        AppDelegate.shared.onInit()
    }

    companion object {
    }
}

/// AndroidAppMain is initial `androidx.appcompat.app.AppCompatActivity`, and must match `activity android:name` in the AndroidMainfest.xml file.
open class MainActivity: AppCompatActivity {
    constructor() {
    }

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        logger.info("starting activity")
        UIApplication.launch(this)
        enableEdgeToEdge()

        setContent {
            val saveableStateHolder = rememberSaveableStateHolder()
            saveableStateHolder.SaveableStateProvider(true) {
                PresentationRootView(ComposeContext())
                SideEffect { saveableStateHolder.removeState(true) }
            }
        }

        AppDelegate.shared.onLaunch()

        // Example of requesting permissions on startup.
        // These must match the permissions in the AndroidManifest.xml file.
        //let permissions = listOf(
        //    Manifest.permission.ACCESS_COARSE_LOCATION,
        //    Manifest.permission.ACCESS_FINE_LOCATION
        //    Manifest.permission.CAMERA,
        //    Manifest.permission.WRITE_EXTERNAL_STORAGE,
        //)
        //let requestTag = 1
        //ActivityCompat.requestPermissions(self, permissions.toTypedArray(), requestTag)
    }

    override fun onStart() {
        logger.info("onStart")
        super.onStart()
    }

    override fun onResume() {
        super.onResume()
        AppDelegate.shared.onResume()
    }

    override fun onPause() {
        super.onPause()
        AppDelegate.shared.onPause()
    }

    override fun onStop() {
        super.onStop()
        AppDelegate.shared.onStop()
    }

    override fun onDestroy() {
        super.onDestroy()
        AppDelegate.shared.onDestroy()
    }

    override fun onLowMemory() {
        super.onLowMemory()
        AppDelegate.shared.onLowMemory()
    }

    override fun onRestart() {
        logger.info("onRestart")
        super.onRestart()
    }

    override fun onSaveInstanceState(outState: android.os.Bundle): Unit = super.onSaveInstanceState(outState)

    override fun onRestoreInstanceState(bundle: android.os.Bundle) {
        // Usually you restore your state in onCreate(). It is possible to restore it in onRestoreInstanceState() as well, but not very common. (onRestoreInstanceState() is called after onStart(), whereas onCreate() is called before onStart().
        logger.info("onRestoreInstanceState")
        super.onRestoreInstanceState(bundle)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: kotlin.Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        logger.info("onRequestPermissionsResult: ${requestCode}")
    }

    companion object {
    }
}

@Composable
internal fun SyncSystemBarsWithTheme() {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f

    val transparent = AndroidColor.TRANSPARENT
    val style = if (dark) {
        SystemBarStyle.dark(transparent)
    } else {
        SystemBarStyle.light(transparent, transparent)
    }

    val activity = LocalContext.current as? ComponentActivity
    DisposableEffect(style) {
        activity?.enableEdgeToEdge(
            statusBarStyle = style,
            navigationBarStyle = style
        )
        onDispose { }
    }
}

/// The app's dark amber Material 3 theme (see the Android design in `Sources/EnStorStark/Android`).
/// The page is black as on iOS; raised surfaces carry a slight warm tint. Keep in step with `Ess`
/// in `AndroidTheme.swift`.
internal object EssColors {
    val amber = ComposeColor(0xFFFFB833)
    val raised = ComposeColor(0xFF1C1A17)
    val raised2 = ComposeColor(0xFF2A2724)
    val raised3 = ComposeColor(0xFF393531)
    val secondaryText = ComposeColor(0xFFF5EFE8).copy(alpha = 0.62f)
    val tertiaryText = ComposeColor(0xFFF5EFE8).copy(alpha = 0.38f)
    val hairline = ComposeColor(0xFFF5EFE8).copy(alpha = 0.12f)
    val good = ComposeColor(0xFF73DB85)
    val bad = ComposeColor(0xFFFF7566)

    private fun icon(path: String): ImageVector =
        ImageVector.Builder("tab", 24.dp, 24.dp, 24f, 24f).apply {
            addPath(addPathNodes(path), fill = SolidColor(ComposeColor.Black))
        }.build()

    /// Material Symbols for Recensioner, Karta, Statistik, and Om.
    val tabIcons = listOf(
        icon("M4,10.5c-0.83,0 -1.5,0.67 -1.5,1.5s0.67,1.5 1.5,1.5 1.5,-0.67 1.5,-1.5 -0.67,-1.5 -1.5,-1.5zM4,4.5c-0.83,0 -1.5,0.67 -1.5,1.5S3.17,7.5 4,7.5 5.5,6.83 5.5,6 4.83,4.5 4,4.5zM4,16.5c-0.83,0 -1.5,0.68 -1.5,1.5s0.68,1.5 1.5,1.5 1.5,-0.68 1.5,-1.5 -0.67,-1.5 -1.5,-1.5zM7,19h14v-2H7v2zM7,13h14v-2H7v2zM7,5v2h14V5H7z"),
        icon("M20.5,3l-0.16,0.03L15,5.1 9,3 3.36,4.9c-0.21,0.07 -0.36,0.25 -0.36,0.48V20.5c0,0.28 0.22,0.5 0.5,0.5l0.16,-0.03L9,18.9l6,2.1 5.64,-1.9c0.21,-0.07 0.36,-0.25 0.36,-0.48V3.5c0,-0.28 -0.22,-0.5 -0.5,-0.5zM15,19l-6,-2.11V5l6,2.11V19z"),
        icon("M5,9.2h3V19H5zM10.6,5h2.8v14h-2.8zM16.2,13H19v6h-2.8z"),
        icon("M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zM13,17h-2v-6h2v6zM13,9h-2V7h2v2z"),
    )

    val scheme = darkColorScheme(
        primary = amber, onPrimary = ComposeColor.Black,
        primaryContainer = ComposeColor(0xFF33260A), onPrimaryContainer = ComposeColor(0xFFFFDEA8),
        secondary = ComposeColor.White, onSecondary = ComposeColor.Black,
        secondaryContainer = raised2, onSecondaryContainer = ComposeColor.White,
        tertiary = good, onTertiary = ComposeColor(0xFF0E3818),
        error = bad, onError = ComposeColor(0xFF690005),
        errorContainer = ComposeColor(0xFF2E1412), onErrorContainer = ComposeColor(0xFFFFDAD6),
        background = ComposeColor.Black, onBackground = ComposeColor.White,
        surface = ComposeColor.Black, onSurface = ComposeColor.White,
        surfaceVariant = raised2, onSurfaceVariant = secondaryText,
        surfaceContainerLowest = ComposeColor.Black, surfaceContainerLow = raised,
        surfaceContainer = raised, surfaceContainerHigh = raised2,
        surfaceContainerHighest = raised3, surfaceBright = raised3,
        outline = tertiaryText, outlineVariant = hairline,
        inverseSurface = raised3, inverseOnSurface = ComposeColor.White, inversePrimary = amber,
        scrim = ComposeColor.Black,
    )
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun PresentationRootView(context: ComposeContext) {
    // Dark only, like the iOS app; every presentation (sheets too) gets the app's scheme.
    Material3ColorScheme({ _, _ -> EssColors.scheme }) {
        PresentationRoot(defaultColorScheme = ColorScheme.dark, context = context) { ctx ->
            SyncSystemBarsWithTheme()
            val contentContext = ctx.content()
            Box(modifier = ctx.modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                AppRootView()
                    .material3NavigationBar { options ->
                        options.copy(
                            // Black with a hairline on top and an amber indicator.
                            modifier = options.modifier.drawBehind {
                                drawLine(EssColors.hairline, Offset(0f, 0f), Offset(size.width, 0f), 1f)
                            },
                            containerColor = ComposeColor.Black,
                            tonalElevation = 0.dp,
                            itemIcon = { index -> Icon(EssColors.tabIcons[index.coerceIn(0, 3)], contentDescription = null) },
                            itemColors = NavigationBarItemDefaults.colors(
                                selectedIconColor = ComposeColor.Black,
                                selectedTextColor = EssColors.amber,
                                indicatorColor = EssColors.amber,
                                unselectedIconColor = ComposeColor.White,
                                unselectedTextColor = ComposeColor.White,
                            ),
                        )
                    }
                    .material3TopAppBar { options ->
                        val title = options.title
                        options.copy(
                            // Large titles in the heavy weight of the design.
                            title = {
                                ProvideTextStyle(LocalTextStyle.current.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp)) {
                                    title()
                                }
                            },
                            // The medium bar: Skip reserves its height for the content, but not the taller large bar.
                            preferLargeStyle = false,
                            colors = TopAppBarDefaults.topAppBarColors(
                                containerColor = ComposeColor.Black,
                                scrolledContainerColor = ComposeColor.Black,
                            ),
                        )
                    }
                    .Compose(context = contentContext)
            }
        }
    }
}
