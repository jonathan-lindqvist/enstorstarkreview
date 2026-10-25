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
        }
    }
}

@Composable
private fun Home() {
    var tab by rememberSaveable { mutableStateOf(Tab.Reviews) }
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) {
            when (tab) {
                Tab.Reviews -> FeedScreen()
                Tab.Map -> PlaceholderScreen(Tab.Map.label)
                Tab.Statistics -> PlaceholderScreen(Tab.Statistics.label)
                Tab.About -> AboutScreen()
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

@Composable
fun PlaceholderScreen(title: String) {
    Box(Modifier.fillMaxSize().navigationBarsPadding().padding(24.dp), contentAlignment = Alignment.Center) { Text(title) }
}
