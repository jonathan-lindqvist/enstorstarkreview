package se.enstorstarkreview.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.ReviewHistoryEntry
import se.enstorstarkreview.app.model.Formatting

/** The change log as a timeline of editors, with before → after for each field. */
@Composable
fun HistoryScreen(slug: String) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val loader = remember(slug) { app.historyLoader(slug) }
    val title = app.reviewList.reviews.firstOrNull { it.slug == slug }?.title
    LaunchedEffect(loader) { loader.load() }

    Scaffold(topBar = { SmallTopBar("Ändringslogg", loader.value?.title ?: title, back = { nav.popBackStack() }) }, containerColor = Ess.bg) { padding ->
        val history = loader.value
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 24.dp)) {
            loader.errorMessage?.let { item { Box(Modifier.padding(bottom = 16.dp)) { ErrorCard(it) { scope.launch { loader.load() } } } } }
            when {
                history == null && loader.errorMessage == null -> item {
                    Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Ess.amber) }
                }
                history != null && history.propertyEntries.isEmpty() -> item { EmptyState("Inga uppdateringar har registrerats ännu.", icon = Ic.history) }
                history != null -> itemsIndexed(history.propertyEntries) { index, entry -> HistoryEntry(entry, isLast = index == history.propertyEntries.lastIndex) }
            }
        }
    }
}

@Composable
private fun HistoryEntry(entry: ReviewHistoryEntry, isLast: Boolean) {
    Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            Avatar(entry.updatedBy, 32.dp)
            if (!isLast) VerticalHairline(Modifier.weight(1f))
        }
        Column(Modifier.weight(1f).padding(bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Column {
                Text("av ${Formatting.authorName(entry.updatedBy)}", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Text(Formatting.dateTime(entry.updatedAt), style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
            }
            if (entry.changes.isEmpty()) {
                Text("Ingen innehållsändring registrerad för den här uppdateringen.", style = MaterialTheme.typography.bodyMedium, color = Ess.tertiaryText)
            }
            entry.changes.forEach { change ->
                val before = change.before.ifEmpty { "–" }
                val after = change.after.ifEmpty { "–" }
                val label = "${change.label}: från ${change.before.ifEmpty { "tomt" }} till ${change.after.ifEmpty { "tomt" }}"
                Column(
                    Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(18.dp)).padding(14.dp).clearAndSetSemantics { contentDescription = label },
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Eyebrow(change.label)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(before, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium.copy(textDecoration = TextDecoration.LineThrough), color = Ess.secondaryText)
                        Icon(Ic.forward, null, Modifier.padding(top = 3.dp).size(14.dp), tint = Ess.amber)
                        Text(after, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                    }
                }
            }
        }
    }
}
