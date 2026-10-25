@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package se.enstorstarkreview.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.InlineStyle
import se.enstorstarkreview.app.model.MarkdownBlock
import se.enstorstarkreview.app.model.ReviewMarkdown

fun inlineMarkdown(text: String): AnnotatedString = buildAnnotatedString {
    ReviewMarkdown.inline(text).forEach { span ->
        when (span.style) {
            InlineStyle.Plain -> append(span.text)
            InlineStyle.Bold -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(span.text) }
            InlineStyle.Italic -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(span.text) }
            InlineStyle.Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Ess.raised2)) { append(span.text) }
        }
    }
}

/** A review description: headings, paragraphs, and lists with amber markers. */
@Composable
fun Description(source: String, style: TextStyle = MaterialTheme.typography.bodyLarge) {
    val body = style.copy(color = Color.White.copy(alpha = 0.88f))
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ReviewMarkdown.blocks(source).forEach { block ->
            when (block) {
                is MarkdownBlock.Heading -> Text(
                    inlineMarkdown(block.text), Modifier.semantics { heading() },
                    style = if (block.level == 1) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.titleLarge,
                )
                is MarkdownBlock.Paragraph -> Text(inlineMarkdown(block.text), style = body)
                is MarkdownBlock.BulletList -> MarkdownList(block.items, body) { "•" }
                is MarkdownBlock.OrderedList -> MarkdownList(block.items, body) { "${it + 1}." }
            }
        }
    }
}

@Composable
private fun MarkdownList(items: List<String>, style: TextStyle, marker: (Int) -> String) {
    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
        items.forEachIndexed { index, item ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(marker(index), style = style.copy(color = Ess.amber, fontWeight = FontWeight.Bold))
                Text(inlineMarkdown(item), style = style)
            }
        }
    }
}

/** One rating aspect, 0–5, as a labelled bar. */
@Composable
fun MetricBar(label: String, hint: String?, value: Double) {
    val text = Formatting.decimal(value)
    Column(Modifier.clearAndSetSemantics { contentDescription = "$label: $text av 5" }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                if (!hint.isNullOrEmpty()) Text(hint, style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
            }
            Text(text, style = Ess.num(22, Ess.amber), color = Ess.amber)
            Text("/5", style = MaterialTheme.typography.labelMedium, color = Ess.secondaryText, modifier = Modifier.padding(bottom = 3.dp))
        }
        LinearProgressIndicator(
            progress = { (value / 5).toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth().height(8.dp),
            color = Ess.amber, trackColor = Ess.raised3, drawStopIndicator = {}, gapSize = 0.dp,
        )
    }
}

/** Bar attributes as quiet tags. */
@Composable
fun AttributeTags(labels: List<String>) {
    if (labels.isEmpty()) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        labels.forEach { label ->
            Box(Modifier.background(Ess.raised2, RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 6.dp)) {
                Text(label, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/** A pushed screen's top bar: back, title, and an optional subtitle. */
@Composable
fun SmallTopBar(title: String, subtitle: String? = null, back: () -> Unit, actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {}) {
    TopAppBar(
        navigationIcon = { IconButton(onClick = back) { Icon(Ic.back, "Tillbaka") } },
        title = {
            Column {
                Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 1)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText, maxLines = 1)
            }
        },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Ess.bg),
    )
}

@Composable
fun Eyebrow(text: String) = SectionLabel(text)

@Composable
fun Hairline() = Box(Modifier.fillMaxWidth().height(1.dp).background(Ess.hairline))

@Composable
fun VerticalHairline(modifier: Modifier = Modifier) = Box(modifier.width(2.dp).background(Ess.hairline))
