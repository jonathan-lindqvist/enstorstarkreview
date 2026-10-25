@file:OptIn(ExperimentalMaterial3Api::class)

package se.enstorstarkreview.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.ReviewStatistics
import se.enstorstarkreview.api.models.StatisticBar
import se.enstorstarkreview.api.models.ValueStatisticBar
import se.enstorstarkreview.app.model.BeerBrandRow
import se.enstorstarkreview.app.model.Formatting

/** Statistics from published reviews. */
@Composable
fun StatisticsScreen() {
    val app = LocalApp.current
    val loader = app.statistics
    val scope = rememberCoroutineScope()
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior(rememberTopAppBarState())
    LaunchedEffect(Unit) { loader.loadIfNeeded() }

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text("Statistik", style = MaterialTheme.typography.displaySmall) }, scrollBehavior = scrollBehavior,
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ess.bg, scrolledContainerColor = Ess.bg),
            )
        },
        containerColor = Ess.bg,
        contentWindowInsets = WindowInsets.statusBars,
    ) { padding ->
        PullToRefreshBox(loader.isLoading && loader.value != null, { scope.launch { loader.load() } }, Modifier.padding(padding)) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Allt bygger på publicerade recensioner. Priser med en asterisk är happy hour-priser.", Modifier.padding(bottom = 4.dp), style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText)
                loader.errorMessage?.let { ErrorCard(it) { scope.launch { loader.load() } } }
                val statistics = loader.value
                when {
                    statistics != null && statistics.totalReviews == 0 ->
                        EmptyState("Ingen statistik än", "Statistiken vaknar till liv när den första recensionen har publicerats.", Ic.chart)
                    statistics != null -> StatisticsContent(statistics)
                    loader.errorMessage == null -> Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Ess.amber) }
                }
            }
        }
    }
}

@Composable
fun StatisticsContent(statistics: ReviewStatistics) {
    val nav = LocalNav.current
    val open: (String) -> Unit = { nav.navigate(ReviewRoute(it)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Hero(statistics)
        Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatisticTile("Snittpris", statistics.averageBeerPrice?.let { Formatting.decimal(it, maximumFractionDigits = 0) } ?: "–", "kr", "${statistics.priceReviewCount} priser")
            StatisticTile("Snitt cl/kr", statistics.averageClPerKr?.let { Formatting.decimal(it, 2, 2) } ?: "–", "", "${statistics.valueReviewCount} med volym")
            StatisticTile("Stämplar", statistics.averageRating?.let { Formatting.decimal(it) } ?: "–", "", "i snitt per bar") { Stamp(22.dp, -8f) }
        }
        ValueSection(statistics, open)
        BrandSection(statistics)
        val cheapest = statistics.cheapestBars.firstOrNull()
        val priciest = statistics.mostExpensiveBars.firstOrNull()
        if (cheapest != null && priciest != null) {
            SectionTitle("Billigast och dyrast")
            Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PriceExtreme("Billigast", cheapest.beerPriceKr, statistics.cheapestBars, Ess.good, open)
                PriceExtreme("Dyrast", priciest.beerPriceKr, statistics.mostExpensiveBars, Ess.bad, open)
            }
            Text("Happy hour-priser ingår inte i prisstatistiken.", style = MaterialTheme.typography.labelSmall, color = Ess.tertiaryText)
        }
        HappyHour(statistics)
    }
}

@Composable
private fun Hero(statistics: ReviewStatistics) {
    Row(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(26.dp)).padding(18.dp), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Eyebrow("Recenserade barer")
            Text("${statistics.totalReviews}", style = Ess.num(76, Ess.amber), color = Ess.amber)
            Text("varav ${statistics.gothenburgReviews} i Göteborg", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
        }
        Spacer(Modifier.weight(1f).width(8.dp))
        Column(Modifier.semantics(mergeDescendants = true) {}, horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Eyebrow("Totalt spenderat")
            Row(verticalAlignment = Alignment.Bottom) {
                Text(Formatting.wholeNumber(statistics.totalReviewerSpendKr), style = Ess.num(30), maxLines = 1)
                Text(" kr", style = Ess.num(13), color = Ess.secondaryText, modifier = Modifier.padding(bottom = 4.dp))
            }
            Text("En öl per recensent och bar", style = MaterialTheme.typography.labelSmall, color = Ess.tertiaryText, textAlign = TextAlign.End)
        }
    }
}

/** A section heading with an optional unit on the right. */
@Composable
private fun SectionTitle(text: String, trailing: String? = null) {
    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.Bottom) {
        Text(text, Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.titleLarge)
        if (trailing != null) Text(trailing, Modifier.clearAndSetSemantics {}, style = MaterialTheme.typography.labelMedium, color = Ess.tertiaryText)
    }
}

/** A small figure in the overview row. */
@Composable
private fun androidx.compose.foundation.layout.RowScope.StatisticTile(title: String, value: String, unit: String, caption: String, accessory: @Composable () -> Unit = {}) {
    Column(
        Modifier.weight(1f).fillMaxHeight().background(Ess.raised, RoundedCornerShape(20.dp)).padding(14.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Eyebrow(title)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(value, style = Ess.num(28), maxLines = 1)
            if (unit.isNotEmpty()) Text(" $unit", style = Ess.num(12), color = Ess.secondaryText)
            Box(Modifier.padding(start = 4.dp)) { accessory() }
        }
        Text(caption, style = MaterialTheme.typography.labelSmall, color = Ess.tertiaryText)
    }
}

@Composable
private fun ValueSection(statistics: ReviewStatistics, open: (String) -> Unit) {
    SectionTitle("Öl för pengarna", "cl/kr")
    Column(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(22.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (statistics.averageClPerKr == null) {
            Text("Inga recensioner med både volym och pris än.", style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText)
        } else {
            ValueRanking("Mest öl för pengarna", statistics.bestValueBars, Ess.good, open)
            if (statistics.worstValueBars.isNotEmpty()) {
                Hairline()
                ValueRanking("Minst öl för pengarna", statistics.worstValueBars, Ess.bad, open)
            }
        }
    }
}

/** Ranked bars by cl/kr, each linking to its review. */
@Composable
private fun ValueRanking(title: String, bars: List<ValueStatisticBar>, tint: Color, open: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, Modifier.semantics { heading() }, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = tint)
        bars.forEachIndexed { index, bar ->
            val label = "${index + 1}. ${bar.title}, ${Formatting.clPerKr(bar.clPerKr)}"
            Row(
                Modifier.fillMaxWidth().clickable { open(bar.slug) }.clearAndSetSemantics { contentDescription = label; role = Role.Button },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("${index + 1}", Modifier.width(16.dp), style = Ess.num(15), color = Ess.tertiaryText)
                Column(Modifier.weight(1f)) {
                    Text(bar.title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${bar.beerVolumeCl} cl · ${bar.beerPriceKr} kr", style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
                }
                Text(Formatting.decimal(bar.clPerKr, 2, 2), style = Ess.num(18), color = tint)
                Icon(Ic.chevronRight, null, Modifier.size(14.dp), tint = Ess.tertiaryText)
            }
        }
    }
}

@Composable
private fun BrandSection(statistics: ReviewStatistics) {
    var sort by rememberSaveable { mutableStateOf(BeerBrandRow.Sort.Price) }
    val rows = BeerBrandRow.rows(statistics, sort)
    val maxValue = rows.mapNotNull { it.averageClPerKr }.maxOrNull() ?: 1.0
    SectionTitle("Per märke", "kr · cl/kr")
    Text("Ordinarie priser. För cl/kr krävs även angiven volym.", style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
    if (rows.isEmpty()) {
        Text("Inga priser med angivet ölmärke än.", Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(22.dp)).padding(16.dp), style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText)
        return
    }
    val options = listOf(BeerBrandRow.Sort.Price to "Pris", BeerBrandRow.Sort.Value to "cl/kr", BeerBrandRow.Sort.Name to "Namn")
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().testTag("statistics.brandSort")) {
        options.forEachIndexed { index, (option, label) ->
            SegmentedButton(
                selected = sort == option, onClick = { sort = option }, shape = SegmentedButtonDefaults.itemShape(index, options.size),
                colors = SegmentedButtonDefaults.colors(activeContainerColor = Ess.amber, activeContentColor = Ess.onAmber, inactiveContainerColor = Ess.raised, inactiveContentColor = Color.White),
            ) { Text(label) }
        }
    }
    Column(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(22.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        rows.forEach { BrandStatisticRow(it, maxValue) }
    }
}

/** A brand with its logo, average price and a cl/kr bar. */
@Composable
private fun BrandStatisticRow(row: BeerBrandRow, maxClPerKr: Double) {
    val prices = if (row.priceCount == 1) "1 pris" else "${row.priceCount} priser"
    val caption = if (row.valueCount > 0) "$prices · ${row.valueCount} med volym" else prices
    val label = "${row.brand}, snittpris ${Formatting.decimal(row.averagePriceKr)} kronor${row.averageClPerKr?.let { ", ${Formatting.clPerKr(it)}" } ?: ""}, $caption"
    Row(Modifier.clearAndSetSemantics { contentDescription = label }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        BrandLogo(row.brand, 40.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(row.brand, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${Formatting.decimal(row.averagePriceKr, 1, 1)} kr", style = Ess.num(15), color = Ess.amber)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.08f))) {
                    val fraction = ((row.averageClPerKr ?: 0.0) / maxClPerKr).coerceIn(0.0, 1.0).toFloat()
                    if (fraction > 0f) Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().clip(CircleShape).background(Ess.good.copy(alpha = 0.8f)))
                }
                Text(row.averageClPerKr?.let(Formatting::clPerKr) ?: "– cl/kr", Modifier.width(70.dp), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = Ess.secondaryText, textAlign = TextAlign.End)
            }
            Text(caption, style = MaterialTheme.typography.labelSmall, color = Ess.tertiaryText)
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.PriceExtreme(title: String, priceKr: Int, bars: List<StatisticBar>, tint: Color, open: (String) -> Unit) {
    Column(Modifier.weight(1f).fillMaxHeight().background(tint.copy(alpha = 0.1f), RoundedCornerShape(22.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionLabel(title, color = tint)
        Row(Modifier.clearAndSetSemantics { contentDescription = "$title: $priceKr kronor" }, verticalAlignment = Alignment.Bottom) {
            Text("$priceKr", style = Ess.num(38, tint), color = tint)
            Text(" kr", style = Ess.num(15), color = tint, modifier = Modifier.padding(bottom = 5.dp))
        }
        bars.forEach { bar ->
            Row(Modifier.fillMaxWidth().clickable { open(bar.slug) }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(bar.title + if (bar.isHappyHourPrice) " *" else "", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Ic.chevronRight, null, Modifier.size(14.dp), tint = Ess.tertiaryText)
            }
        }
    }
}

@Composable
private fun HappyHour(statistics: ReviewStatistics) {
    Row(Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(22.dp)).padding(14.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        AmberDisc(Ic.clock, 44.dp)
        Column {
            Text("Happy hour-fynd: ${statistics.happyHourReviewCount}", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold))
            Text(statistics.happyHourPercentage?.let { "${Formatting.decimal(it, maximumFractionDigits = 0)} % av prisuppgifterna." } ?: "Inga prisuppgifter än.", style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
        }
    }
}
