package se.enstorstarkreview.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.hypot
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.PriceValue

private const val MIN_KR_PER_CL = 0.7
private const val MAX_KR_PER_CL = 3.0
private val ticks = listOf(1.0, 1.5, 2.0, 2.5, 3.0)

/** Dot lanes in a row, in dp, so close dots do not cover each other (like the web). */
private val laneOffsets = listOf(0f, -11f, 11f)

private fun distanceColor(distance: Double): Color = when {
    distance == 0.0 -> Color.White.copy(alpha = 0.6f)
    distance == 1.0 -> Ess.amber
    else -> Ess.bad
}

/**
 * Prisvärdhet against price per centilitre, like the web's `PriceValueGates` on /statistik: the
 * shaded boxes are the gates, each dot a bar, and a line how far its rating is from the gate.
 */
@Composable
fun PriceValueGates(comparison: PriceValue.Comparison, open: (String) -> Unit) {
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val measurer = rememberTextMeasurer()
    val label = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Ess.tertiaryText)
    val sorted = comparison.bars.sortedBy { it.krPerCl }
    // Where each dot was drawn, for taps. Plain, not state: drawing must not cause recomposition.
    val positions = remember { mutableMapOf<String, Offset>() }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Canvas(
            Modifier.fillMaxWidth().height(260.dp).testTag("statistics.priceValueGates")
                .clearAndSetSemantics { contentDescription = "Faktiskt betyg mot väntat betyg för ${comparison.bars.size} barer." }
                .pointerInput(comparison) {
                    detectTapGestures { tap ->
                        val nearest = positions.minByOrNull { (_, point) -> hypot(point.x - tap.x, point.y - tap.y) }
                        selected = nearest?.takeIf { hypot(it.value.x - tap.x, it.value.y - tap.y) <= 24.dp.toPx() }?.key
                    }
                },
        ) {
            val left = 26.dp.toPx()
            val right = 8.dp.toPx()
            val top = 8.dp.toPx()
            val bottom = 34.dp.toPx()
            val plotWidth = size.width - left - right
            val rowHeight = (size.height - top - bottom) / 6
            fun x(krPerCl: Double) = left + ((krPerCl.coerceIn(MIN_KR_PER_CL, MAX_KR_PER_CL) - MIN_KR_PER_CL) / (MAX_KR_PER_CL - MIN_KR_PER_CL)).toFloat() * plotWidth
            fun rowCenter(rating: Double) = top + ((5 - rating) + 0.5).toFloat() * rowHeight

            for (rating in 0..5) {
                val y = rowCenter(rating.toDouble()) + rowHeight / 2
                drawLine(Ess.hairline, Offset(left, y), Offset(left + plotWidth, y), 1.dp.toPx())
                val text = measurer.measure("$rating", label)
                drawText(text, topLeft = Offset(left - 8.dp.toPx() - text.size.width, rowCenter(rating.toDouble()) - text.size.height / 2))
            }
            comparison.gates.forEach { gate ->
                val start = x(gate.fromKrPerCl)
                val end = x(gate.belowKrPerCl ?: MAX_KR_PER_CL)
                drawRect(Ess.amber.copy(alpha = 0.14f), Offset(start, rowCenter(gate.rating.toDouble()) - rowHeight / 2), Size(end - start, rowHeight))
            }
            ticks.forEach { tick ->
                val text = measurer.measure(Formatting.decimal(tick), label)
                drawText(text, topLeft = Offset(x(tick) - text.size.width / 2, top + rowHeight * 6 + 4.dp.toPx()))
            }
            val unit = measurer.measure("kr/cl", label)
            drawText(unit, topLeft = Offset(left + plotWidth - unit.size.width, size.height - unit.size.height))

            val lastInLane = mutableMapOf<String, Float>()
            positions.clear()
            sorted.forEach { bar ->
                val cx = x(bar.krPerCl)
                val lane = laneOffsets.indices.firstOrNull { cx - (lastInLane["${bar.valueRating}|$it"] ?: -999f) >= 10.dp.toPx() } ?: 0
                lastInLane["${bar.valueRating}|$lane"] = cx
                val cy = rowCenter(bar.valueRating) + laneOffsets[lane].dp.toPx()
                val color = distanceColor(bar.distance)
                if (bar.distance > 0) {
                    drawLine(color.copy(alpha = 0.6f), Offset(cx, cy), Offset(cx, rowCenter(bar.gateRating.toDouble())), 1.dp.toPx())
                }
                if (bar.point.slug == selected) drawCircle(Ess.amber, 8.dp.toPx(), Offset(cx, cy), style = Stroke(2.dp.toPx()))
                drawCircle(color, 4.5.dp.toPx(), Offset(cx, cy))
                positions[bar.point.slug] = Offset(cx, cy)
            }
        }

        val bar = comparison.bars.firstOrNull { it.point.slug == selected }
        if (bar != null) {
            val text = Formatting.priceValueBar(bar)
            Row(
                Modifier.fillMaxWidth().clickable { open(bar.point.slug) }.clearAndSetSemantics { contentDescription = text; role = Role.Button },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(text, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                Icon(Ic.chevronRight, null, Modifier.size(14.dp), tint = Ess.tertiaryText)
            }
        } else {
            Text("Tryck på en punkt för att se baren.", style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            LegendDot(distanceColor(0.0), "Som väntat: ${comparison.exactCount}")
            LegendDot(distanceColor(1.0), "1 steg ifrån: ${comparison.nearCount}")
            LegendDot(distanceColor(2.0), "Minst 2 steg: ${comparison.farCount}")
        }

        GateTable(comparison.gates)
    }
}

@Composable
private fun LegendDot(color: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(text, style = MaterialTheme.typography.labelSmall, color = Ess.secondaryText)
    }
}

@Composable
private fun GateTable(gates: List<PriceValue.Gate>) {
    val header = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
    val cell = MaterialTheme.typography.bodySmall
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().clearAndSetSemantics {}) {
            Text("Kr/cl", Modifier.weight(1.6f), style = header)
            Text("Väntat betyg", Modifier.weight(1.2f), style = header, textAlign = TextAlign.End)
            Text("Barer", Modifier.weight(0.8f), style = header, textAlign = TextAlign.End)
            Text("Som väntat", Modifier.weight(1.1f), style = header, textAlign = TextAlign.End)
        }
        Hairline()
        gates.forEach { gate ->
            val range = Formatting.krPerClRange(gate)
            val description = "$range kronor per centiliter, väntat betyg ${gate.rating}, ${gate.count} barer, ${gate.exact} som väntat"
            Row(Modifier.fillMaxWidth().padding(vertical = 1.dp).clearAndSetSemantics { contentDescription = description }) {
                Text(range, Modifier.weight(1.6f), style = cell, color = Ess.secondaryText)
                Text("${gate.rating}", Modifier.weight(1.2f), style = cell.copy(fontWeight = FontWeight.Bold), textAlign = TextAlign.End)
                Text("${gate.count}", Modifier.weight(0.8f), style = cell, color = Ess.secondaryText, textAlign = TextAlign.End)
                Text("${gate.exact}", Modifier.weight(1.1f), style = cell, color = Ess.secondaryText, textAlign = TextAlign.End)
            }
        }
    }
}
