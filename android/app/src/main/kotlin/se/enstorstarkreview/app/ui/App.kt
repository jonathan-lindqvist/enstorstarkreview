package se.enstorstarkreview.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import kotlinx.serialization.Serializable
import se.enstorstarkreview.app.model.AppModel

val LocalApp = staticCompositionLocalOf<AppModel> { error("No AppModel") }
val LocalNav = staticCompositionLocalOf<NavHostController> { error("No navigation") }

@Serializable object HomeRoute
@Serializable data class ReviewRoute(val slug: String)
@Serializable data class HistoryRoute(val slug: String)
@Serializable object LoginRoute
/** The review wizard; a null slug creates a new review. */
@Serializable data class WizardRoute(val slug: String? = null)

enum class Tab(val label: String) { Reviews("Recensioner"), Map("Karta"), Statistics("Statistik"), About("Om") }

@Composable
fun AppRoot(app: AppModel) {
    val nav = rememberNavController()
    androidx.compose.runtime.CompositionLocalProvider(LocalApp provides app, LocalNav provides nav) {
        LaunchedEffect(Unit) { app.session.validate() }
        NavHost(nav, startDestination = HomeRoute) {
            composable<HomeRoute> { Home() }
            composable<ReviewRoute> { ReviewDetailScreen(it.toRoute<ReviewRoute>().slug) }
            composable<HistoryRoute> { HistoryScreen(it.toRoute<HistoryRoute>().slug) }
            composable<LoginRoute> { LoginScreen() }
            composable<WizardRoute> { ReviewWizardScreen(it.toRoute<WizardRoute>().slug) }
        }
    }
}

@Composable
private fun Home() {
    val app = LocalApp.current
    var tab by rememberSaveable { mutableStateOf(Tab.Reviews) }
    val snackbar = androidx.compose.runtime.remember { androidx.compose.material3.SnackbarHostState() }
    // "… togs bort" after a delete, on whichever tab is open.
    LaunchedEffect(app.deletedNotice) {
        val notice = app.deletedNotice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice)
        app.deletedNotice = null
    }
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) {
            when (tab) {
                Tab.Reviews -> FeedScreen()
                Tab.Map -> MapScreen()
                Tab.Statistics -> StatisticsScreen()
                Tab.About -> AboutScreen()
            }
            androidx.compose.material3.SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter)) { data ->
                androidx.compose.material3.Snackbar(
                    Modifier.padding(12.dp), shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
                    containerColor = Ess.raised3, contentColor = Color.White,
                ) {
                    androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
                        Icon(Ic.delete, null, tint = Ess.bad)
                        Text(data.visuals.message)
                    }
                }
            }
        }
        AppNavBar(tab) { tab = it }
    }
}

@Composable
fun AppNavBar(selected: Tab, select: (Tab) -> Unit) {
    Column {
        HorizontalDivider(color = Ess.hairline)
        NavigationBar(containerColor = Ess.bg) {
            Tab.entries.forEach { tab ->
                val icon = when (tab) { Tab.Reviews -> Ic.bullets; Tab.Map -> Ic.map; Tab.Statistics -> Ic.chart; Tab.About -> Ic.info }
                NavigationBarItem(
                    selected = tab == selected, onClick = { select(tab) }, icon = { Icon(icon, null) },
                    label = { Text(tab.label, fontWeight = FontWeight.SemiBold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Ess.onAmber, indicatorColor = Ess.amber, selectedTextColor = Ess.amber,
                        unselectedIconColor = Color.White, unselectedTextColor = Color.White,
                    ),
                )
            }
        }
    }
}
