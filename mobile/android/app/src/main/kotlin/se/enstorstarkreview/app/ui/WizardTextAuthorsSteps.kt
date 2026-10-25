@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package se.enstorstarkreview.app.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.MarkdownEdit
import se.enstorstarkreview.app.model.MarkdownEditing
import se.enstorstarkreview.app.model.ReviewFormModel
import se.enstorstarkreview.app.model.ReviewMarkdown

// Step 5: Helhet & text

/**
 * Step 5: the overall rating (the suggestion from the aspects is only the start value) and the
 * review text.
 */
@Composable
fun WizardTextStep(form: ReviewFormModel) {
    WizardPage {
        Surface(shape = RoundedCornerShape(24.dp), color = Ess.raised) { OverallRatingPicker(form) }
        MarkdownEditor(form.draft.description, form.error("/description")) { form.draft = form.draft.copy(description = it) }
    }
}

private val stampTilts = listOf(-10f, 6f, -4f)

/** Three places for stamps. A tap on the last stamp removes it. */
@Composable
private fun OverallRatingPicker(form: ReviewFormModel) {
    val haptics = LocalHapticFeedback.current
    val shown = form.effectiveOverallRating
    val suggested = form.suggestedOverallRating
    fun set(value: Int) {
        haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
        form.draft = form.draft.copy(overallRating = if (value == suggested) null else value)
    }
    Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.padding(top = 6.dp).clearAndSetSemantics {
                contentDescription = "Stämplar"
                stateDescription = Formatting.stampAccessibilityLabel(shown)
                progressBarRangeInfo = ProgressBarRangeInfo(shown.toFloat(), 0f..3f, steps = 2)
                setProgress { target ->
                    set(Math.round(target).coerceIn(0, 3))
                    true
                }
            },
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            for (place in 0 until 3) {
                val isOn = place < shown
                // A stamp lands from above, slightly too big, as if pressed.
                val scale by animateFloatAsState(if (isOn) 1f else 1.6f, spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessMediumLow), label = "stamp")
                Box(
                    Modifier.size(84.dp).clickable(remember { MutableInteractionSource() }, null) { set(if (shown == place + 1) place else place + 1) },
                    contentAlignment = Alignment.Center,
                ) {
                    StampSlot(84.dp)
                    if (isOn) Box(Modifier.zIndex(1f).scale(scale).alpha(((1.6f - scale) / 0.6f).coerceIn(0f, 1f))) { Stamp(84.dp, stampTilts[place]) }
                }
            }
        }
        Text(Formatting.ratingWord(shown), style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
        Text(if (shown == 0) "Ingen stämpel. Helt okej, de flesta barer får ingen." else Formatting.stamps(shown),
            style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText, textAlign = TextAlign.Center)
        if (form.draft.overallRating == null) {
            Text("Förslag från betygen: ${Formatting.decimal(form.weightedScore, 0, 2)} poäng. Tryck på en stämpel för att ändra.",
                style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText, textAlign = TextAlign.Center)
        } else {
            FlowRow(horizontalArrangement = Arrangement.Center, verticalArrangement = Arrangement.Center, itemVerticalAlignment = Alignment.CenterVertically) {
                Text("Ändrat från förslaget: ${Formatting.stamps(suggested).lowercase()}.", style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
                TextButton(onClick = { form.draft = form.draft.copy(overallRating = null) }) { Text("Använd förslaget", fontWeight = FontWeight.Bold) }
            }
        }
        FieldError(form.error("/overallRating"))
    }
}

/**
 * A Markdown text editor with buttons for headings, lists, and bold text, and a preview. A new
 * line after a list item starts the next item (see [MarkdownEditing]).
 */
@Composable
private fun MarkdownEditor(text: String, error: String?, onChange: (String) -> Unit) {
    var field by remember { mutableStateOf(TextFieldValue(text, TextRange(text.length))) }
    var isPreviewing by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    // The form can change the text too (a reload, "Börja om").
    if (field.text != text) field = TextFieldValue(text, TextRange(text.length))

    fun apply(edit: MarkdownEdit) {
        field = TextFieldValue(edit.text, TextRange(edit.cursor))
        onChange(edit.text)
        runCatching { focus.requestFocus() }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Recension", Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
            if (!isPreviewing) {
                IconButton(onClick = { apply(MarkdownEditing.toggleLinePrefix(field.text, field.selection.min, "## ")) }) { Icon(Ic.heading, "Rubrik", Modifier.size(20.dp)) }
                IconButton(onClick = { apply(MarkdownEditing.toggleLinePrefix(field.text, field.selection.min, "- ")) }) { Icon(Ic.bullets, "Punktlista", Modifier.size(20.dp)) }
                IconButton(onClick = { apply(MarkdownEditing.wrapSelection(field.text, field.selection.min, field.selection.max, "**")) }) { Icon(Ic.bold, "Fetstil", Modifier.size(20.dp)) }
            }
        }
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            SegmentedButton(selected = !isPreviewing, onClick = { isPreviewing = false }, shape = SegmentedButtonDefaults.itemShape(0, 2),
                icon = { Icon(Ic.edit, null, Modifier.size(16.dp)) }) { Text("Skriv") }
            SegmentedButton(selected = isPreviewing, onClick = { isPreviewing = true }, shape = SegmentedButtonDefaults.itemShape(1, 2),
                icon = { Icon(Ic.visibility, null, Modifier.size(16.dp)) }) { Text("Förhandsvisa") }
        }
        if (isPreviewing) {
            Box(Modifier.fillMaxWidth().heightIn(min = 220.dp).background(Ess.raised2, RoundedCornerShape(16.dp)).padding(16.dp)) {
                if (text.isBlank()) Text("Inget att visa än.", color = Ess.tertiaryText) else Description(text)
            }
        } else {
            TextField(
                field,
                onValueChange = { next ->
                    val continued = if (next.text != field.text) MarkdownEditing.continueList(field.text, next.text) else null
                    field = continued?.let { TextFieldValue(it.text, TextRange(it.cursor)) } ?: next
                    if (field.text != text) onChange(field.text)
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 220.dp).focusRequester(focus).semantics {
                    contentDescription = "Recension"
                    if (error != null) error(error)
                },
                placeholder = { Text("- Öppen lokal med fin inredning\n- Lugnt nog att prata", color = Ess.tertiaryText) },
                isError = error != null,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                shape = RoundedCornerShape(16.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Ess.raised2, unfocusedContainerColor = Ess.raised2, errorContainerColor = Ess.raised2,
                    focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, errorIndicatorColor = Color.Transparent,
                    cursorColor = Ess.amber,
                ),
            )
        }
        Text("En rad i taget. Börja raden med - för en punktlista. Finputsa hemma.", style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
        FieldError(error)
    }
}

// Step 6: Vem

/** Step 6: who was there, and a preview of the feed card. */
@Composable
fun WizardAuthorsStep(form: ReviewFormModel, photo: ImageBitmap?) {
    val haptics = LocalHapticFeedback.current
    val selected = form.authorOptions.filter { it in form.draft.authors }
    WizardPage {
        WizardTitle("Vilka var där?", "Alla som du väljer står som författare.")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            form.authorOptions.forEach { name ->
                val isOn = name in form.draft.authors
                Column(
                    Modifier.width(66.dp).clickable(role = Role.Checkbox) {
                        haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        val authors = form.draft.authors
                        form.draft = form.draft.copy(authors = if (isOn) authors - name else authors + name)
                    }.clearAndSetSemantics {
                        contentDescription = Formatting.authorName(name)
                        this.selected = isOn
                        role = Role.Checkbox
                    }.padding(vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box {
                        val ring = if (isOn) Modifier.border(2.5.dp, Ess.amber, CircleShape) else Modifier
                        Box(ring.padding(4.dp)) { Avatar(name, 48.dp, dimmed = !isOn) }
                        if (isOn) {
                            Box(Modifier.align(Alignment.BottomEnd).offset(2.dp, 2.dp).size(18.dp).background(Ess.amber, CircleShape), contentAlignment = Alignment.Center) {
                                Icon(Ic.check, null, Modifier.size(12.dp), tint = Ess.onAmber)
                            }
                        }
                    }
                    Text(if (name == form.currentUser) "Du" else Formatting.authorName(name), maxLines = 1,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = if (isOn) FontWeight.Bold else FontWeight.Medium),
                        color = if (isOn) Color.White else Ess.tertiaryText)
                }
            }
        }
        Text(if (selected.isEmpty()) "Välj minst en författare." else "${Formatting.authorList(selected)} står som författare.",
            style = MaterialTheme.typography.bodySmall, color = if (selected.isEmpty()) Ess.bad else Ess.tertiaryText)
        FieldError(form.error("/authors"))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { Eyebrow("Så ser den ut i flödet") }
                if (form.isDraft) Text("Bara inloggade ser utkast", style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
            }
            val draft = form.draft
            Box(Modifier.semantics(mergeDescendants = true) {}) {
                ReviewCardLayout(
                    rating = form.effectiveOverallRating,
                    title = draft.title.ifBlank { "Barens namn" },
                    excerpt = ReviewMarkdown.plainText(draft.description),
                    authors = selected,
                    brand = form.brand.ifEmpty { "Märke" },
                    street = draft.location.substringBefore(',').trim(),
                    priceKr = draft.priceKr,
                    isHappyHour = draft.isHappyHourPrice,
                    isDraft = form.isDraft,
                ) {
                    if (photo != null) FocusedPhoto(photo, draft.focusX, draft.focusY) else Box(Modifier.fillMaxSize().background(Ess.raised2)) { PhotoPlaceholder() }
                }
            }
        }
    }
}

/** A photo cropped around its focus point (0–100), like the server's previews. */
@Composable
private fun FocusedPhoto(photo: ImageBitmap, focusX: Double, focusY: Double) {
    Image(
        photo, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop,
        alignment = androidx.compose.ui.BiasAlignment((focusX / 50 - 1).toFloat(), (focusY / 50 - 1).toFloat()),
    )
}
