@file:OptIn(ExperimentalMaterial3Api::class)

package se.enstorstarkreview.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.RatingKey
import se.enstorstarkreview.api.models.RatingMetric
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.NearbyReviewsModel
import se.enstorstarkreview.app.model.RatingWords
import se.enstorstarkreview.app.model.ReviewFormModel

/** Step 4: one card per aspect. Each card has its own control, and a row of 0–5 buttons below. */
@Composable
fun WizardRatingStep(form: ReviewFormModel, index: Int, forward: Boolean, nearby: NearbyReviewsModel, setIndex: (Int) -> Unit) {
    val metrics = form.metadata.ratingMetrics
    val reduceMotion = rememberReduceMotion()
    var showsNearbyList by remember { mutableStateOf(false) }
    if (metrics.isEmpty()) {
        EmptyState("Inga betyg att sätta", icon = Ic.star)
        return
    }
    val metric = metrics[index.coerceIn(0, metrics.size - 1)]
    fun set(key: RatingKey, value: Int) {
        form.draft = form.draft.copy(ratings = form.draft.ratings + (key to value))
    }
    Column(
        Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(top = 4.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Betyg ${index + 1} av ${metrics.size}", Modifier.weight(1f), style = MaterialTheme.typography.labelLarge, color = Ess.secondaryText)
            metrics.forEachIndexed { position, item ->
                Box(
                    Modifier.size(16.dp, 30.dp).clickable(role = Role.Tab) { setIndex(position) }
                        .semantics { contentDescription = "${item.label}, ${form.draft.rating(item.key)} av 5"; selected = position == index },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(when {
                        position < index -> Ess.amber
                        position == index -> Color.White
                        else -> Color.White.copy(alpha = 0.18f)
                    }))
                }
            }
        }
        Box(Modifier.padding(bottom = 22.dp)) {
            // The next cards peek out below.
            if (index < metrics.size - 2) Box(Modifier.matchParentSize().padding(horizontal = 28.dp).offset(y = 22.dp).clip(RoundedCornerShape(36.dp)).background(Color(0xFF121212)))
            if (index < metrics.size - 1) Box(Modifier.matchParentSize().padding(horizontal = 14.dp).offset(y = 11.dp).clip(RoundedCornerShape(36.dp)).background(Color(0xFF171717)))
            AnimatedContent(
                metric,
                transitionSpec = {
                    if (reduceMotion) fadeIn() togetherWith fadeOut()
                    else if (forward) (slideInHorizontally { it } + fadeIn()) togetherWith (slideOutHorizontally { -it } + fadeOut())
                    else (slideInHorizontally { -it } + fadeIn()) togetherWith (slideOutHorizontally { it } + fadeOut())
                },
                label = "rating",
            ) { shown -> RatingCard(form, shown) { set(shown.key, it) } }
        }
        ValueButtons(metric.key, form.draft.rating(metric.key)) { set(metric.key, it) }
        FieldError(form.error("/ratings/${metric.key.value}"))
        if (metric.key == RatingKey.barhopPotential) {
            LaunchedEffect(form.draft.location) { nearby.load(form.draft.location) }
            NearbyReviewsCard(nearby) { showsNearbyList = true }
        }
    }
    val state = nearby.state
    if (showsNearbyList && state is NearbyReviewsModel.State.Results) {
        ModalBottomSheet(onDismissRequest = { showsNearbyList = false }, containerColor = Ess.bg) {
            NearbyReviewsSheet(form.draft.location, state.result)
        }
    }
}

@Composable
private fun RatingCard(form: ReviewFormModel, metric: RatingMetric, onChange: (Int) -> Unit) {
    val current = form.draft.rating(metric.key)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(36.dp)).background(Color(0xFF1D1D1D))
            .border(1.dp, Ess.hairline, RoundedCornerShape(36.dp)).padding(top = 24.dp, bottom = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(metric.label, Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineLarge, maxLines = 1)
            Text(metric.description, style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText, textAlign = TextAlign.Center)
        }
        RatingControl(
            metric.key, metric.label, current, form.draft.priceKr?.let { "$it kr" },
            Modifier.fillMaxWidth().height(220.dp).padding(horizontal = 12.dp), onChange,
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 22.dp).semantics { hideFromAccessibility() }, verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("$current", style = Ess.num(56, Ess.amber), color = Ess.amber)
            Text(RatingWords.word(metric.key, current), Modifier.weight(1f).padding(bottom = 8.dp),
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("av 5", Modifier.padding(bottom = 10.dp), style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
        }
    }
}

/** Six round value buttons, as on iOS: a radio group for TalkBack. */
@Composable
private fun ValueButtons(key: RatingKey, current: Int, onChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        (0..5).forEach { option ->
            val isOn = option == current
            Surface(
                onClick = { onChange(option) },
                modifier = Modifier.weight(1f).height(50.dp).semantics {
                    contentDescription = "$option, ${RatingWords.word(key, option)}"
                    selected = isOn
                    role = Role.RadioButton
                },
                shape = CircleShape, color = if (isOn) Ess.amber else Color.White.copy(alpha = 0.1f), contentColor = if (isOn) Ess.onAmber else Color.White,
            ) {
                Box(contentAlignment = Alignment.Center) { Text("$option", style = Ess.num(20)) }
            }
        }
    }
}

/**
 * Reviewed bars near the address, under the barhop rating. Counts per radius; a tap opens the
 * nearest bars. The centre is the address's saved position, never the device location.
 */
@Composable
private fun NearbyReviewsCard(model: NearbyReviewsModel, showList: () -> Unit) {
    val scope = rememberCoroutineScope()
    val state = model.state
    val tappable = state is NearbyReviewsModel.State.Results
    Surface(
        shape = RoundedCornerShape(22.dp), color = Ess.raised,
        modifier = Modifier.fillMaxWidth().then(if (tappable) Modifier.clickable(onClickLabel = "Visa de närmaste barerna", onClick = showList) else Modifier),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Ic.place, null, Modifier.size(16.dp), tint = Ess.amber)
                Text("Recenserade barer i närheten", Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                if (tappable) {
                    Text("Visa", style = MaterialTheme.typography.labelLarge, color = Ess.amber)
                    Icon(Ic.chevronRight, null, Modifier.size(16.dp), tint = Ess.amber)
                }
            }
            when (state) {
                NearbyReviewsModel.State.Loading -> {
                    Row(Modifier.clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        repeat(3) { Box(Modifier.weight(1f).height(58.dp).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.07f))) }
                    }
                    Text("Hämtar barer i närheten…", style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
                }
                is NearbyReviewsModel.State.Results -> {
                    val result = state.result
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        result.radiiMetres.zip(result.counts).forEachIndexed { position, (radius, count) ->
                            val metres = Formatting.wholeNumber(radius)
                            Column(
                                Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.06f)).padding(10.dp)
                                    .clearAndSetSemantics { contentDescription = "$count inom $metres meter" },
                            ) {
                                Text("$count", style = Ess.num(26), color = if (position == 0) Ess.amber else Color.White)
                                Text("inom $metres m", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = Ess.secondaryText, maxLines = 1)
                            }
                        }
                    }
                    Text("Från adressens sparade position, fågelvägen. ${result.locatedCount} av ${result.totalCount} andra recensioner har känd position. Utkast ingår.",
                        style = MaterialTheme.typography.labelSmall, color = Ess.tertiaryText)
                }
                NearbyReviewsModel.State.NoPosition -> NearbyNote(Ic.locationOff, "Adressen saknar sparad position, så avstånden kan inte räknas ut. Du kan ändå sätta ditt betyg.")
                NearbyReviewsModel.State.NoneLocated -> NearbyNote(Ic.map, "Andra recensioner saknar kända positioner. Antalet barer i närheten kan inte beräknas.")
                NearbyReviewsModel.State.Unavailable -> NearbyNote(Ic.error, "Jämförelsen kunde inte laddas just nu. Du kan ändå sätta ditt betyg.") {
                    scope.launch { model.retry() }
                }
            }
        }
    }
}

@Composable
private fun NearbyNote(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, retry: (() -> Unit)? = null) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, null, Modifier.size(18.dp), tint = Ess.secondaryText)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text, style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText)
            if (retry != null) TextButton(onClick = retry) { Text("Försök igen", fontWeight = FontWeight.Bold) }
        }
    }
}

/** The nearest reviewed bars, nearest first. */
@Composable
private fun NearbyReviewsSheet(address: String, result: NearbyReviewsModel.Result) {
    val street = address.substringBefore(',').trim()
    Column(
        Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(bottom = 24.dp).navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("Barer i närheten", Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
        Text("Runt $street, från adressens sparade position. Avstånden är ungefärliga och fågelvägen.", style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText)
        if (result.nearest.isEmpty()) {
            Text("Inga andra recenserade barer inom ${Formatting.wholeNumber(result.radiiMetres.lastOrNull() ?: 1000)} m.", color = Ess.secondaryText)
        } else {
            Surface(shape = RoundedCornerShape(18.dp), color = Ess.raised) {
                Column(Modifier.padding(horizontal = 14.dp)) {
                    result.nearest.forEachIndexed { position, bar ->
                        if (position > 0) Hairline()
                        Row(Modifier.heightIn(min = 48.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                            Text(bar.title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.width(8.dp))
                            val near = bar.distanceMetres <= (result.radiiMetres.firstOrNull() ?: 250)
                            Text("${Formatting.wholeNumber(bar.distanceMetres)} m", style = Ess.num(16), color = if (near) Ess.amber else Color.White)
                        }
                    }
                }
            }
        }
    }
}
