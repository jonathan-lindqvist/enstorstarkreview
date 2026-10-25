@file:OptIn(ExperimentalLayoutApi::class)

package se.enstorstarkreview.app.ui

import androidx.compose.animation.core.withInfiniteAnimationFrameNanos
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.PriceRulerMotion
import se.enstorstarkreview.app.model.ReviewFormModel

// Step 2: Bar

/** Step 2: the bar's name and address, and what the bar has (quiz, darts, …). */
@Composable
fun WizardBarStep(form: ReviewFormModel, photo: ImageBitmap?) {
    val focus = LocalFocusManager.current
    val title = remember { FocusRequester() }
    LaunchedEffect(Unit) { if (!form.isEditing && form.draft.title.isEmpty()) title.requestFocus() }
    WizardPage {
        if (photo != null) {
            Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box {
                    Image(photo, null, Modifier.size(52.dp).clip(RoundedCornerShape(14.dp)), contentScale = ContentScale.Crop)
                    Box(Modifier.align(Alignment.BottomEnd).offset(6.dp, 6.dp).size(20.dp).clip(CircleShape).background(Ess.amber), contentAlignment = Alignment.Center) {
                        Icon(Ic.check, null, Modifier.size(14.dp), tint = Ess.onAmber)
                    }
                }
                Text("Bilden är klar", style = MaterialTheme.typography.labelLarge, color = Ess.secondaryText)
            }
        }
        WizardTitle("Var är ni?", large = true)
        EssTextField(
            form.draft.title, { form.draft = form.draft.copy(title = it) }, "Barens namn", Modifier.focusRequester(title),
            error = form.error("/title"), textStyle = MaterialTheme.typography.titleLarge,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
        )
        EssTextField(
            form.draft.location, { form.draft = form.draft.copy(location = it) }, "Adress",
            error = form.error("/location"), icon = Ic.place, textStyle = MaterialTheme.typography.titleLarge,
            supportingText = "Skriv gatan, postnumret och orten. Adressen hamnar på kartan när recensionen publiceras.",
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
        )
        val options = form.metadata.barAttributes
        if (options.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Eyebrow("Finns på stället")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    options.forEach { option ->
                        val isOn = option.key in form.draft.attributes
                        EssChip(option.label, isOn, leading = { Icon(if (isOn) Ic.check else Ic.add, null, Modifier.size(16.dp)) }) {
                            val attributes = form.draft.attributes
                            form.draft = form.draft.copy(attributes = if (isOn) attributes - option.key else attributes + option.key)
                        }
                    }
                }
                FieldError(form.error("/attributes"))
            }
        }
        if (form.isEditing) {
            EssTextField(
                form.draft.slug, { form.draft = form.draft.copy(slug = it) }, "Länk", error = form.error("/slug"),
                supportingText = "Recensionens adress på webben. Töm fältet för att skapa en ny länk från namnet.",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, keyboardType = KeyboardType.Uri),
            )
        }
    }
}

// Step 3: Stor stark

/** Step 3: the price on a ruler, the volume, happy hour, and the brand. */
@Composable
fun WizardBeerStep(form: ReviewFormModel) {
    val limits = form.metadata.limits
    val priceRange = limits.beerPriceMinKr..maxOf(limits.beerPriceMinKr, limits.beerPriceMaxKr)
    var isTypingPrice by remember { mutableStateOf(false) }
    var isTypingVolume by remember { mutableStateOf(false) }
    WizardPage {
        WizardTitle("Stor stark", "Vad kostade den, hur stor var den och vilket märke?")
        // Price
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val price = form.draft.priceKr
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .clickable(onClickLabel = "Skriv priset") { isTypingPrice = true }
                    .clearAndSetSemantics {
                        contentDescription = price?.let { "Pris $it kronor" } ?: "Inget pris"
                        role = Role.Button
                    },
                contentAlignment = Alignment.Center,
            ) {
                Price(price, form.draft.isHappyHourPrice, size = 84)
            }
            PriceRuler(price, priceRange) { form.draft = form.draft.copy(priceText = it.toString()) }
            Text(if (price == null) "Dra i linjalen eller tryck på priset" else " ", style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
            FieldError(form.error("/beer/priceKr"))
        }
        VolumePicker(form) { isTypingVolume = true }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ListItem(
                headlineContent = { Text("Happy hour-pris", fontWeight = FontWeight.SemiBold) },
                supportingContent = { Text("Visas med * och räknas i statistiken") },
                leadingContent = { AmberDisc(Ic.clock) },
                trailingContent = { Switch(form.draft.isHappyHourPrice, onCheckedChange = null) },
                colors = ListItemDefaults.colors(containerColor = Ess.raised),
                modifier = Modifier.clip(RoundedCornerShape(24.dp)).clickable(role = Role.Switch) {
                    form.draft = form.draft.copy(isHappyHourPrice = !form.draft.isHappyHourPrice)
                },
            )
            FieldError(form.error("/beer/isHappyHourPrice"))
        }
        BrandPicker(form)
    }
    if (isTypingPrice) {
        NumberDialog("Pris i kronor", "Kronor", form.draft.priceKr, message = null, dismiss = { isTypingPrice = false }) { value ->
            if (value != null) form.draft = form.draft.copy(priceText = value.toString())
        }
    }
    if (isTypingVolume) {
        NumberDialog(
            "Volym i centiliter", "Centiliter", form.draft.volumeCl,
            message = "Mellan ${limits.beerVolumeMinCl} och ${limits.beerVolumeMaxCl} cl. Lämna tomt om du inte vet.",
            dismiss = { isTypingVolume = false },
            allowsEmpty = true,
        ) { value ->
            form.draft = form.draft.copy(volumeCl = value)
            form.validateField("/beer/volumeCl")
        }
    }
}

/** Optional serving size: the common sizes are one tap, others are typed. */
@Composable
private fun VolumePicker(form: ReviewFormModel, typeVolume: () -> Unit) {
    val quickPicks = ReviewFormModel.VOLUME_QUICK_PICKS
    val volume = form.draft.volumeCl
    val custom = volume?.takeIf { it !in quickPicks }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { Eyebrow("Volym") }
            Formatting.clPerKr(volume, form.draft.priceKr, form.draft.isHappyHourPrice)?.let {
                Text(it, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold), color = Ess.amber)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            quickPicks.forEach { size ->
                val isOn = volume == size
                Pill("$size cl", isOn, Modifier.weight(1f), label = "$size centiliter") {
                    form.draft = form.draft.copy(volumeCl = if (isOn) null else size)
                    form.clearError("/beer/volumeCl")
                }
            }
            Pill(custom?.let { "$it cl" } ?: "…", custom != null, label = custom?.let { "Annan volym, $it centiliter" } ?: "Annan volym", action = typeVolume)
        }
        Text("Valfritt. Tryck igen för att ta bort.", style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
        FieldError(form.error("/beer/volumeCl"))
    }
}

@Composable
private fun Pill(text: String, isOn: Boolean, modifier: Modifier = Modifier, label: String = text, action: () -> Unit) {
    Surface(
        onClick = action, modifier = modifier.height(44.dp).semantics { contentDescription = label; selected = isOn },
        shape = CircleShape, color = if (isOn) Ess.amber else Color.White.copy(alpha = 0.1f), contentColor = if (isOn) Ess.onAmber else Color.White,
    ) {
        Box(Modifier.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text(text, style = MaterialTheme.typography.labelLarge.copy(fontSize = 15.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        }
    }
}

/** A number in an alert, for the price and the volume. */
@Composable
private fun NumberDialog(title: String, label: String, initial: Int?, message: String?, dismiss: () -> Unit, allowsEmpty: Boolean = false, done: (Int?) -> Unit) {
    var text by remember { mutableStateOf(initial?.toString().orEmpty()) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    fun finish() {
        val trimmed = text.trim()
        val value = trimmed.toIntOrNull()
        if (value != null || (allowsEmpty && trimmed.isEmpty())) done(value) else if (allowsEmpty) done(initial)
        dismiss()
    }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (message != null) Text(message)
                EssTextField(
                    text, { value -> text = value.filter(Char::isDigit).take(4) }, label, Modifier.focusRequester(focus),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { finish() }),
                )
            }
        },
        confirmButton = { TextButton(onClick = ::finish) { Text("Klar") } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Avbryt") } },
    )
}

/** The brand logos in a grid of three, and "Annat märke…" with a field. */
@Composable
private fun BrandPicker(form: ReviewFormModel) {
    val custom = remember { FocusRequester() }
    var focusCustom by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Eyebrow("Märke")
        val tiles = form.metadata.beerBrands + ReviewFormModel.OTHER_BRAND
        tiles.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { brand ->
                    val isOther = brand == ReviewFormModel.OTHER_BRAND
                    BrandTile(if (isOther) "Annat märke…" else brand, form.draft.brandChoice == brand, Modifier.weight(1f)) {
                        form.draft = form.draft.copy(brandChoice = brand)
                        focusCustom = isOther
                    }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
        if (form.draft.brandChoice == ReviewFormModel.OTHER_BRAND) {
            LaunchedEffect(focusCustom) { if (focusCustom) custom.requestFocus() }
            EssTextField(
                form.draft.customBrand, { form.draft = form.draft.copy(customBrand = it) }, "Märkets namn", Modifier.focusRequester(custom),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            )
        }
        FieldError(form.error("/beer/brand"))
    }
}

/** A brand choice in the logo grid: amber ring and check mark when chosen. */
@Composable
private fun BrandTile(title: String, isOn: Boolean, modifier: Modifier, action: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).clickable(role = Role.RadioButton, onClick = action)
            .clearAndSetSemantics { contentDescription = title; selected = isOn; role = Role.RadioButton }
            .padding(top = 6.dp, bottom = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box {
            val ring = if (isOn) Modifier.border(BorderStroke(3.dp, Ess.amber), RoundedCornerShape(22.dp)) else Modifier
            Box(ring.padding(4.dp)) {
                if (title == "Annat märke…") {
                    Box(Modifier.size(88.dp).clip(RoundedCornerShape(18.dp)).background(Color.White.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
                        Icon(Ic.add, null, Modifier.size(28.dp), tint = Ess.amber)
                    }
                } else {
                    BrandLogo(title, 88.dp, 18.dp)
                }
            }
            if (isOn) {
                Box(Modifier.align(Alignment.TopEnd).offset(6.dp, (-6).dp).size(22.dp).clip(CircleShape).background(Ess.amber), contentAlignment = Alignment.Center) {
                    Icon(Ic.check, null, Modifier.size(15.dp), tint = Ess.onAmber)
                }
            }
        }
        Text(
            title, style = MaterialTheme.typography.labelSmall.copy(fontWeight = if (isOn) FontWeight.Bold else FontWeight.Medium),
            color = if (isOn) Color.White else Ess.secondaryText, textAlign = TextAlign.Center, maxLines = 2, minLines = 2,
        )
    }
}

/**
 * A price ruler with continuous dragging and friction after a flick (see [PriceRulerMotion]). A
 * tick for every krona, 10 dp apart; the amber needle marks the price.
 */
@Composable
private fun PriceRuler(price: Int?, range: IntRange, onChange: (Int) -> Unit) {
    val reduceMotion = rememberReduceMotion()
    val haptics = LocalHapticFeedback.current
    val measurer = rememberTextMeasurer()
    val resting = 70.coerceIn(range.first, range.last)
    val motion = remember(range) { PriceRulerMotion((price ?: resting).toDouble(), range) }
    // The position drives drawing; the motion object is plain and not observable.
    var position by remember(range) { mutableDoubleStateOf(motion.position) }
    var coasting by remember { mutableIntStateOf(0) }
    val change by rememberUpdatedState(onChange)
    val current by rememberUpdatedState(price)

    fun publish() {
        position = motion.position
        val selected = motion.selected
        if (selected != current) {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            change(selected)
        }
    }

    fun stopCoasting() {
        motion.stop()
        coasting++
    }

    // A typed price moves the ruler, without interrupting its own animation.
    LaunchedEffect(price) {
        if (price != null && price != motion.selected) {
            motion.stop()
            motion.drag(price.toDouble())
            position = motion.position
        }
    }
    LaunchedEffect(coasting) {
        var previous = withInfiniteAnimationFrameNanos { it }
        while (motion.isMoving) {
            val now = withInfiniteAnimationFrameNanos { it }
            motion.advance((now - previous) / 1e9)
            previous = now
            publish()
        }
    }
    DisposableEffect(Unit) { onDispose { motion.stop() } }

    val label = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color.White.copy(alpha = 0.5f))
    Canvas(
        Modifier.fillMaxWidth().height(70.dp)
            .clearAndSetSemantics {
                contentDescription = "Prislinjal"
                stateDescription = price?.let { "$it kronor" } ?: "Inget pris"
                progressBarRangeInfo = ProgressBarRangeInfo((price ?: resting).toFloat(), range.first.toFloat()..range.last.toFloat())
                setProgress { target ->
                    stopCoasting()
                    // TalkBack's swipes move one krona at a time.
                    val shown = price ?: resting
                    val next = (if (target > shown) shown + 1 else if (target < shown) shown - 1 else shown).coerceIn(range.first, range.last)
                    motion.drag(next.toDouble())
                    position = motion.position
                    change(next)
                    true
                }
            }
            .pointerInput(range, reduceMotion) {
                val spacing = 10.dp.toPx()
                awaitEachGesture {
                    val down = awaitFirstDown()
                    stopCoasting()
                    val start = motion.position
                    var moved = 0f
                    val tracker = VelocityTracker().apply { addPosition(down.uptimeMillis, down.position) }
                    val completed = drag(down.id) { change ->
                        moved += change.positionChange().x
                        tracker.addPosition(change.uptimeMillis, change.position)
                        change.consume()
                        motion.drag(start - moved / spacing)
                        publish()
                    }
                    if (completed) {
                        motion.release(-tracker.calculateVelocity().x / spacing.toDouble(), reduceMotion)
                        publish()
                        coasting++
                    } else {
                        stopCoasting()
                    }
                }
            },
    ) {
        val middle = size.width / 2
        val spacing = 10.dp.toPx()
        val first = maxOf(range.first, floor(position - middle / spacing).toInt() - 2)
        val last = minOf(range.last, ceil(position + middle / spacing).toInt() + 2)
        for (kr in first..maxOf(first, last)) {
            val x = middle + ((kr - position) * spacing).toFloat()
            if (x < -20 || x > size.width + 20) continue
            val fade = (1f - abs(x - middle) / middle * 1.2f + 0.2f).coerceIn(0f, 1f)
            val major = kr % 10 == 0
            val height = (if (major) 30 else if (kr % 5 == 0) 20 else 12).dp.toPx()
            drawRoundRect(Color.White.copy(alpha = (if (major) 0.75f else 0.28f) * fade), Offset(x - 1.dp.toPx(), 8.dp.toPx()),
                Size(2.dp.toPx(), height), CornerRadius(1.dp.toPx()))
            if (major) {
                val text = measurer.measure("$kr", label)
                drawText(text, topLeft = Offset(x - text.size.width / 2, height + 14.dp.toPx()), alpha = fade)
            }
        }
        val needle = if (price == null) Ess.amber.copy(alpha = 0.4f) else Ess.amber
        if (price != null) {
            drawRoundRect(Brush.radialGradient(listOf(Ess.amber.copy(alpha = 0.35f), Color.Transparent), Offset(middle, 23.dp.toPx()), 16.dp.toPx()),
                Offset(middle - 16.dp.toPx(), 0f), Size(32.dp.toPx(), 46.dp.toPx()))
        }
        drawRoundRect(needle, Offset(middle - 2.dp.toPx(), 0f), Size(4.dp.toPx(), 46.dp.toPx()), CornerRadius(2.dp.toPx()))
    }
}
