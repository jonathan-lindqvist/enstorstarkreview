package se.enstorstarkreview.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import se.enstorstarkreview.api.models.ReviewSort

enum class Dest(val label: String) { Reviews("Recensioner"), Map("Karta"), Stats("Statistik"), About("Om") }

private val sortLabels = listOf(ReviewSort.latest to "Senaste", ReviewSort.oldest to "Äldsta", ReviewSort.score to "Högst betyg")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(model: FeedViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text("Recensioner", style = MaterialTheme.typography.displaySmall) },
                actions = { IconButton(onClick = {}) { Icon(Ic.search, "Sök") } },
                scrollBehavior = scroll,
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ess.bg, scrolledContainerColor = Ess.bg),
            )
        },
        bottomBar = { AppNavBar(Dest.Reviews) },
        containerColor = Ess.bg,
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding(), bottom = padding.calculateBottomPadding() + 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    sortLabels.forEach { (sort, label) -> EssChip(label, selected = sort == state.sort, onClick = { model.select(sort) }) }
                }
            }
            when {
                state.loading && state.reviews.isEmpty() -> item {
                    Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Ess.amber) }
                }
                state.error != null -> item {
                    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(state.error!!, color = Ess.secondaryText)
                        FilledTonalButton(onClick = model::load) { Text("Försök igen") }
                    }
                }
                else -> items(state.reviews, key = { it.id }) { ReviewCard(it) }
            }
        }
    }
}

@Composable
fun AppNavBar(selected: Dest, onSelect: (Dest) -> Unit = {}) {
    Column {
        HorizontalDivider(color = Ess.hairline)
        NavigationBar(containerColor = Ess.bg) {
            Dest.entries.forEach { d ->
                val icon = when (d) { Dest.Reviews -> Ic.bullets; Dest.Map -> Ic.map; Dest.Stats -> Ic.chart; Dest.About -> Ic.info }
                NavigationBarItem(selected = d == selected, onClick = { onSelect(d) }, icon = { Icon(icon, null) },
                    label = { Text(d.label, fontWeight = FontWeight.SemiBold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Ess.onAmber, indicatorColor = Ess.amber, selectedTextColor = Ess.amber,
                        unselectedIconColor = Color.White, unselectedTextColor = Color.White,
                    ))
            }
        }
    }
}
