@file:OptIn(ExperimentalMaterial3Api::class)

package se.enstorstarkreview.app.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.ui.layout.layout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.ReviewDistance
import se.enstorstarkreview.app.model.ReviewListModel

/** Recensioner: the feed of review cards, sorting, and search. */
@Composable
fun FeedScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val model = app.reviewList
    var isSearching by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // Loads on appear, and again shortly after the search text or the sort changes.
    LaunchedEffect(model.sort, model.nearest, model.search) {
        if (model.reviews.isNotEmpty() || model.search.isNotEmpty()) delay(300)
        model.load()
    }
    LaunchedEffect(Unit) { app.metadata.loadIfNeeded() }

    BackHandler(isSearching) {
        isSearching = false
        model.search = ""
        model.attributeFilter = emptySet()
    }

    val open: (Review) -> Unit = { nav.navigate(ReviewRoute(it.slug)) }
    if (isSearching) {
        SearchScreen(model, open) {
            isSearching = false
            model.search = ""
            model.attributeFilter = emptySet()
        }
        return
    }

    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior(rememberTopAppBarState())
    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text("Recensioner", style = MaterialTheme.typography.displaySmall) },
                actions = { IconButton(onClick = { isSearching = true }) { Icon(Ic.search, "Sök") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface, scrolledContainerColor = MaterialTheme.colorScheme.surface),
                scrollBehavior = scrollBehavior,
            )
        },
        floatingActionButton = {
            if (app.session.isSignedIn) {
                ExtendedFloatingActionButton(
                    onClick = { nav.navigate(WizardRoute()) },
                    icon = { Icon(Ic.add, null) },
                    text = { Text("Ny recension", fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) },
                    containerColor = Ess.amber, contentColor = Ess.onAmber,
                    expanded = !scrollBehavior.state.collapsedFraction.let { it > 0.5f },
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.surface,
        // The navigation bar below the tabs owns the bottom inset.
        contentWindowInsets = WindowInsets.statusBars,
    ) { padding ->
        PullToRefreshBox(isRefreshing = model.isLoading && model.reviews.isNotEmpty(), onRefresh = { scope.launch { model.load() } }, modifier = Modifier.padding(padding)) {
            LazyColumn(
                Modifier.fillMaxSize().testTag("feed"),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { Box(Modifier.layout { measurable, constraints ->
                    // The chips scroll under the side padding, edge to edge.
                    val extra = 32.dp.roundToPx()
                    val placeable = measurable.measure(constraints.copy(maxWidth = constraints.maxWidth + extra))
                    layout(constraints.maxWidth, placeable.height) { placeable.place(-extra / 2, 0) }
                }) { SortChips(model) } }
                if (model.nearest) item { NearestNote(model) }
                model.errorMessage?.let { message -> item { ErrorCard(message) { scope.launch { model.load() } } } }
                items(model.visibleReviews, key = { it.id }) { review ->
                    val distance = model.distanceKm(review.slug)?.let { Formatting.distance(it) }
                    ReviewCard(review, Modifier.clickable { open(review) }, distance)
                }
                if (model.visibleReviews.isEmpty() && model.errorMessage == null) {
                    item {
                        if (model.isLoading) {
                            Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Ess.amber) }
                        } else {
                            EmptyState("Inga recensioner hittades")
                        }
                    }
                }
            }
        }
    }
}

/** The API sorts, then "Närmast", which orders on the device. */
@Composable
private fun SortChips(model: ReviewListModel) {
    val context = LocalContext.current
    val app = LocalApp.current
    // Each attempt asks for one location fix; the location stays in memory.
    var attempt by remember { mutableStateOf(0) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        model.locationDenied = result.values.none { it }
        if (model.locationDenied) model.origin = null else attempt++
    }
    LaunchedEffect(model.nearest, attempt) {
        if (!model.nearest) return@LaunchedEffect
        if (!context.hasLocationPermission()) {
            if (!model.locationDenied) permission.launch(locationPermissions)
            return@LaunchedEffect
        }
        model.locationDenied = false
        model.locationFailed = false
        app.map.loadIfNeeded()
        app.map.value?.let { model.positions = ReviewDistance.positions(it) }
        val origin = context.currentLocation()
        model.origin = origin
        model.locationFailed = origin == null
    }
    // Back from Settings, or after moving: a new fix.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { if (model.nearest) attempt++ }

    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ReviewListModel.sortOptions.forEach { option ->
            EssChip(option.label, selected = !model.nearest && model.sort == option.sort) { model.choose(option.sort) }
        }
        EssChip(
            "Närmast", selected = model.nearest, modifier = Modifier.testTag("sort.nearest"),
            leading = { Icon(if (model.locationDenied) Ic.locationOff else Ic.myLocation, null, Modifier.size(16.dp)) },
        ) { model.nearest = true }
    }
}

@Composable
private fun NearestNote(model: ReviewListModel) {
    val context = LocalContext.current
    if (model.locationDenied) {
        Surface(shape = RoundedCornerShape(18.dp), color = Ess.raised, modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Ic.locationOff, null, tint = Ess.amber)
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("Platsåtkomst är avstängd, så de senaste visas först.", style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { context.openAppSettings() }, contentPadding = PaddingValues(0.dp)) { Text("Öppna inställningar", color = Ess.amber) }
                }
            }
        }
    } else {
        Text(
            if (model.locationFailed) "Din position kunde inte hämtas, så de senaste visas först."
            else if (model.origin == null) "Hämtar din position…" else "Från din position just nu, fågelvägen. Barer utan känd adress hamnar sist.",
            style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText,
        )
    }
}

/** Search on bar, address, beer or writer, with the attribute filter. */
@Composable
private fun SearchScreen(model: ReviewListModel, open: (Review) -> Unit, close: () -> Unit) {
    val app = LocalApp.current
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(top = 8.dp)) {
        Surface(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(56.dp), shape = CircleShape, color = MaterialTheme.colorScheme.surfaceContainerHigh) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = close) { Icon(Ic.back, "Stäng sökningen") }
                TextField(
                    model.search, { model.search = it.take(ReviewListModel.MAX_SEARCH_LENGTH) },
                    Modifier.weight(1f).focusRequester(focus),
                    placeholder = { Text("Sök bar, adress, öl eller skribent") }, singleLine = true,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, cursorColor = Ess.amber,
                    ),
                )
                if (model.search.isNotEmpty()) IconButton(onClick = { model.search = "" }) { Icon(Ic.close, "Rensa sökningen") }
            }
        }
        LazyColumn(Modifier.padding(top = 12.dp), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    app.metadata.value?.barAttributes.orEmpty().forEach { attribute ->
                        val selected = attribute.key in model.attributeFilter
                        EssChip(attribute.label, selected, leading = if (selected) { { Icon(Ic.check, null, Modifier.size(16.dp)) } } else null) {
                            model.attributeFilter = if (selected) model.attributeFilter - attribute.key else model.attributeFilter + attribute.key
                        }
                    }
                }
            }
            if (model.search.isNotEmpty() || model.attributeFilter.isNotEmpty()) {
                item {
                    val count = model.visibleReviews.size
                    Text(if (count == 1) "1 träff på bar, adress, öl eller skribent" else "$count träffar på bar, adress, öl eller skribent",
                        Modifier.padding(horizontal = 16.dp, vertical = 4.dp), style = MaterialTheme.typography.labelLarge, color = Ess.secondaryText)
                }
            }
            items(model.visibleReviews, key = { it.id }) { review -> ReviewRow(review, Modifier.clickable { open(review) }) }
            if (model.visibleReviews.isEmpty() && !model.isLoading) item { EmptyState("Inga recensioner hittades") }
        }
    }
}
