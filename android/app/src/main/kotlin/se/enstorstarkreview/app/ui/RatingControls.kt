package se.enstorstarkreview.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin
import se.enstorstarkreview.api.models.RatingKey
import se.enstorstarkreview.app.model.RatingGestures
import se.enstorstarkreview.app.model.RatingWords

// One control per rating aspect, each with a picture of what it measures. All are 0–5, can be
// dragged or tapped, and TalkBack adjusts them one step per swipe.

/** The control for one aspect. [priceText] is the beer price, for the balance scale. */
@Composable
fun RatingControl(key: RatingKey, label: String, value: Int, priceText: String?, modifier: Modifier = Modifier, onChange: (Int) -> Unit) {
    val haptics = LocalHapticFeedback.current
    val latest by rememberUpdatedState(value)
    val change by rememberUpdatedState(onChange)
    // Sets a new value only when it changes, so the haptic runs once per step.
    val update: (Int) -> Unit = remember {
        { next ->
            val clamped = RatingWords.clamp(next)
            if (clamped != latest) {
                haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                change(clamped)
            }
        }
    }
    Box(
        modifier.clearAndSetSemantics {
            contentDescription = label
            stateDescription = "$value av 5, ${RatingWords.word(key, value)}"
            progressBarRangeInfo = ProgressBarRangeInfo(value.toFloat(), 0f..5f, steps = 4)
            setProgress { target ->
                update(Math.round(target))
                true
            }
        },
        contentAlignment = Alignment.Center,
    ) {
        when (key) {
            RatingKey.atmosphere -> DimmerControl(value, update)
            RatingKey.service -> SpeedometerControl(value, update)
            RatingKey.selection -> TapsControl(value, update)
            RatingKey.quality -> PintControl(value, update, Modifier.size(130.dp, 200.dp))
            RatingKey.price -> ScaleControl(value, priceText, update)
            RatingKey.cleanliness -> WipeControl(value, update)
            RatingKey.soundLevel -> VolumeControl(value, update)
            RatingKey.barhopPotential -> HopControl(value, update)
        }
    }
}

/** Calls [onPosition] for the press and each move of one finger. */
private suspend fun PointerInputScope.trackFinger(onPosition: (Offset) -> Unit) {
    awaitEachGesture {
        val down = awaitFirstDown()
        onPosition(down.position)
        drag(down.id) { change ->
            change.consume()
            onPosition(change.position)
        }
    }
}

private fun Modifier.finger(onPosition: (androidx.compose.ui.unit.IntSize, Offset) -> Unit) =
    pointerInput(Unit) { trackFinger { onPosition(size, it) } }

@Composable
private fun animated(value: Int) = animateFloatAsState(value.toFloat(), label = "rating").value

// Atmosfär: a dimmer knob, the room warms up

@Composable
private fun DimmerControl(value: Int, update: (Int) -> Unit) {
    val level = animated(value)
    Canvas(Modifier.fillMaxSize().finger { size, point ->
        update(RatingGestures.dimmer(RatingGestures.angle(point.x - size.width / 2f, point.y - size.height / 2f)))
    }) {
        val c = center
        val knob = 75.dp.toPx()
        drawCircle(Brush.radialGradient(listOf(Ess.amber.copy(alpha = 0.08f + level * 0.1f), Color.Transparent), c, 150.dp.toPx()), 150.dp.toPx(), c)
        for (tick in 0..5) {
            rotate(-135f + tick * 54f, c) {
                drawLine(if (tick <= value) Ess.amber else Color.White.copy(alpha = 0.2f),
                    Offset(c.x, c.y - 102.dp.toPx()), Offset(c.x, c.y - 90.dp.toPx()), 4.dp.toPx(), StrokeCap.Round)
            }
        }
        drawCircle(Color.Black.copy(alpha = 0.5f), knob + 4.dp.toPx(), c + Offset(0f, 6.dp.toPx()))
        drawCircle(Brush.verticalGradient(listOf(Color(0xFF3D3D3D), Color(0xFF1A1A1A)), c.y - knob, c.y + knob), knob, c)
        drawCircle(Color.White.copy(alpha = 0.12f), knob, c, style = Stroke(1.dp.toPx()))
        rotate(-135f + level * 54f, c) {
            drawLine(Ess.amber.copy(alpha = 0.4f), Offset(c.x, c.y - 65.dp.toPx()), Offset(c.x, c.y - 39.dp.toPx()), 9.dp.toPx(), StrokeCap.Round)
            drawLine(Ess.amber, Offset(c.x, c.y - 65.dp.toPx()), Offset(c.x, c.y - 39.dp.toPx()), 5.dp.toPx(), StrokeCap.Round)
        }
        bulb(c, level)
    }
}

/** A light bulb that glows with the level. */
private fun DrawScope.bulb(c: Offset, level: Float) {
    val on = level > 0.01f
    val color = if (on) Ess.amber else Color.White.copy(alpha = 0.38f)
    if (on) drawCircle(Brush.radialGradient(listOf(Ess.amber.copy(alpha = 0.5f * level / 5), Color.Transparent), c, 34.dp.toPx()), 34.dp.toPx(), c)
    val r = 11.dp.toPx()
    val top = c + Offset(0f, -5.dp.toPx())
    if (on) drawCircle(color, r, top) else drawCircle(color, r, top, style = Stroke(2.5.dp.toPx()))
    drawRoundRect(color, Offset(c.x - 6.dp.toPx(), c.y + 7.dp.toPx()), Size(12.dp.toPx(), 4.dp.toPx()), CornerRadius(2.dp.toPx()))
    drawRoundRect(color, Offset(c.x - 5.dp.toPx(), c.y + 12.dp.toPx()), Size(10.dp.toPx(), 3.dp.toPx()), CornerRadius(1.5.dp.toPx()))
}

// Service: a speedometer

@Composable
private fun SpeedometerControl(value: Int, update: (Int) -> Unit) {
    val level = animated(value)
    val measurer = rememberTextMeasurer()
    Canvas(Modifier.fillMaxSize().finger { size, point ->
        update(RatingGestures.speedometer(RatingGestures.angle(point.x - size.width / 2f, point.y - size.height * 0.78f)))
    }) {
        val c = Offset(size.width / 2, size.height * 0.78f)
        val radius = min(120.dp.toPx(), size.width / 2 - 30.dp.toPx())
        val arc = Rect(c, radius)
        drawArc(Color.White.copy(alpha = 0.1f), 180f, 180f, false, arc.topLeft, arc.size, style = Stroke(18.dp.toPx(), cap = StrokeCap.Round))
        if (value > 0) {
            drawArc(Brush.horizontalGradient(listOf(Ess.amberDeep, Ess.amber), arc.left, arc.right), 180f, level * 36f, false, arc.topLeft, arc.size,
                style = Stroke(18.dp.toPx(), cap = StrokeCap.Round))
        }
        for (tick in 0..5) {
            val radians = (180 + tick * 36) * PI / 180
            val text = measurer.measure("$tick", TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (tick == value) Ess.amber else Ess.tertiaryText))
            val p = c + Offset((cos(radians) * (radius - 34.dp.toPx())).toFloat(), (sin(radians) * (radius - 34.dp.toPx())).toFloat())
            drawText(text, topLeft = p - Offset(text.size.width / 2f, text.size.height / 2f))
        }
        rotate(-90f + level * 36f, c) {
            drawLine(Color.White, c, c - Offset(0f, radius - 20.dp.toPx()), 4.dp.toPx(), StrokeCap.Round)
        }
        drawCircle(Color.White, 9.dp.toPx(), c)
        // Tortoise and hare, as slow and fast.
        val labels = TextStyle(fontSize = 16.sp, color = Ess.tertiaryText)
        val slow = measurer.measure("🐢", labels)
        val fast = measurer.measure("🐇", labels)
        drawText(slow, topLeft = Offset(c.x - radius - 15.dp.toPx() - slow.size.width / 2f, c.y + 12.dp.toPx()), alpha = 0.6f)
        drawText(fast, topLeft = Offset(c.x + radius + 15.dp.toPx() - fast.size.width / 2f, c.y + 12.dp.toPx()), alpha = 0.6f)
    }
}

// Utbud: tap handles

@Composable
private fun TapsControl(value: Int, update: (Int) -> Unit) {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            for (tap in 1..5) {
                val isOn = tap <= value
                val tilt by animateFloatAsState(if (isOn) -8f else 0f, label = "tap")
                Column(
                    Modifier.rotate(tilt).clickable(remember { MutableInteractionSource() }, null) { update(RatingGestures.tap(value, tap)) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(Modifier.size(22.dp).clip(CircleShape).background(if (isOn) Ess.foam else Color.White.copy(alpha = 0.2f)))
                    Box(Modifier.width(26.dp).height((70 + (tap % 2) * 12).dp).clip(RoundedCornerShape(8.dp)).background(
                        if (isOn) Brush.verticalGradient(listOf(Ess.amber, Ess.amberDeep)) else Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.1f), Color.White.copy(alpha = 0.1f)))))
                    Box(Modifier.width(8.dp).height(14.dp).background(Color.White.copy(alpha = 0.3f)))
                }
            }
        }
        Box(Modifier.width(250.dp).height(22.dp).clip(RoundedCornerShape(6.dp)).background(Brush.verticalGradient(listOf(Color(0xFF808080), Color(0xFF404040)))))
        Text("Tryck på kranarna", Modifier.padding(top = 12.dp), style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
    }
}

// Kvalitet: a pint glass that fills by dragging

private fun pintPath(size: Size, inset: Float, corner: Float) = Path().apply {
    moveTo(0f, 0f)
    lineTo(size.width, 0f)
    lineTo(size.width - inset, size.height - corner)
    quadraticTo(size.width - inset - 1, size.height, size.width - inset - corner, size.height)
    lineTo(inset + corner, size.height)
    quadraticTo(inset + 1, size.height, inset, size.height - corner)
    close()
}

@Composable
private fun PintControl(value: Int, update: (Int) -> Unit, modifier: Modifier) {
    val level = animated(value) / 5
    Canvas(modifier.finger { size, point -> update(RatingGestures.fill(point.y / size.height)) }) {
        val inset = size.width * 0.13f
        val glass = pintPath(size, inset, 14.dp.toPx())
        if (value > 0) drawCircle(Brush.radialGradient(listOf(Ess.amber.copy(alpha = 0.25f), Color.Transparent), center, size.height * 0.7f), size.height * 0.7f, center)
        drawPath(glass, Color.White.copy(alpha = 0.05f))
        clipPath(glass) {
            val top = size.height * (1 - level)
            drawRect(Brush.verticalGradient(listOf(Ess.amber, Ess.amberDeep), top, size.height), Offset(0f, top), Size(size.width, size.height - top))
            val beer = size.height - top
            for (bubble in 0 until 9) {
                val r = (3 + bubble % 3).dp.toPx() / 2
                val x = size.width / 2 + ((bubble * 37) % 90 - 45).dp.toPx()
                val y = top + 26.dp.toPx() + ((bubble * 53) % maxOf((beer - 30.dp.toPx()).toInt(), 1))
                if (y < size.height) drawCircle(Color.White.copy(alpha = 0.35f), r, Offset(x, y))
            }
            if (value > 0) drawRect(Ess.foam, Offset(0f, top), Size(size.width, 20.dp.toPx()))
        }
        drawPath(glass, Color.White.copy(alpha = 0.55f), style = Stroke(3.dp.toPx()))
        for (mark in 1..4) {
            val y = size.height - mark / 5f * size.height
            val x = inset + 14.dp.toPx() - mark * size.width * 0.026f
            drawLine(Color.White.copy(alpha = 0.22f), Offset(x - 6.dp.toPx(), y), Offset(x + 6.dp.toPx(), y), 2.dp.toPx())
        }
    }
}

// Prisvärdhet: a balance scale, price against what you got

@Composable
private fun ScaleControl(value: Int, priceText: String?, update: (Int) -> Unit) {
    val level = animated(value)
    val measurer = rememberTextMeasurer()
    Canvas(Modifier.fillMaxSize().finger { size, point -> update(RatingGestures.across(point.x / size.width)) }) {
        val tilt = (level - 2.5f) / 2.5f * 16f
        val arm = min(110.dp.toPx(), size.width / 2 - 50.dp.toPx())
        val pivot = Offset(size.width / 2, 70.dp.toPx())
        val radians = tilt * PI / 180
        val left = pivot + Offset(-(cos(radians) * arm).toFloat(), -(sin(radians) * arm).toFloat())
        val right = pivot + Offset((cos(radians) * arm).toFloat(), (sin(radians) * arm).toFloat())
        drawPath(Path().apply {
            moveTo(pivot.x, pivot.y)
            lineTo(pivot.x - 30.dp.toPx(), 190.dp.toPx())
            lineTo(pivot.x + 30.dp.toPx(), 190.dp.toPx())
            close()
        }, Color.White.copy(alpha = 0.12f))
        for (end in listOf(left, right)) {
            val strings = Path().apply {
                moveTo(end.x - 40.dp.toPx(), end.y + 81.dp.toPx())
                lineTo(end.x, end.y)
                lineTo(end.x + 40.dp.toPx(), end.y + 81.dp.toPx())
            }
            drawPath(strings, Color.White.copy(alpha = 0.3f), style = Stroke(1.5.dp.toPx()))
            drawLine(Color.White.copy(alpha = 0.5f), Offset(end.x - 40.dp.toPx(), end.y + 82.dp.toPx()), Offset(end.x + 40.dp.toPx(), end.y + 82.dp.toPx()), 5.dp.toPx(), StrokeCap.Round)
        }
        drawLine(Color.White.copy(alpha = 0.7f), left, right, 5.dp.toPx(), StrokeCap.Round)
        drawCircle(Ess.amber, 7.dp.toPx(), pivot)
        // Coins and the price on the left.
        for (coin in 0 until 3) {
            val y = left.y + 79.dp.toPx() - 20.dp.toPx() - coin * 6.dp.toPx() - 12.dp.toPx()
            drawRoundRect(Color(0xFFCCB373), Offset(left.x - 23.dp.toPx(), y), Size(46.dp.toPx(), 12.dp.toPx()), CornerRadius(6.dp.toPx()))
            drawRoundRect(Color.Black.copy(alpha = 0.3f), Offset(left.x - 23.dp.toPx(), y), Size(46.dp.toPx(), 12.dp.toPx()), CornerRadius(6.dp.toPx()), style = Stroke(1.dp.toPx()))
        }
        val price = measurer.measure(priceText ?: "Priset", Ess.num(13).copy(color = Color.White))
        drawText(price, topLeft = Offset(left.x - price.size.width / 2f, left.y + 78.dp.toPx() - price.size.height))
        // A mug on the right.
        val mug = Offset(right.x, right.y + 52.dp.toPx())
        drawCircle(Brush.radialGradient(listOf(Ess.amber.copy(alpha = 0.4f), Color.Transparent), mug, 26.dp.toPx()), 26.dp.toPx(), mug)
        drawRoundRect(Ess.amber, mug - Offset(13.dp.toPx(), 15.dp.toPx()), Size(22.dp.toPx(), 28.dp.toPx()), CornerRadius(4.dp.toPx()))
        drawRoundRect(Ess.amber, mug + Offset(7.dp.toPx(), -8.dp.toPx()), Size(10.dp.toPx(), 14.dp.toPx()), CornerRadius(5.dp.toPx()), style = Stroke(3.dp.toPx()))
        val beer = measurer.measure("stor stark", TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color.White))
        drawText(beer, topLeft = Offset(right.x - beer.size.width / 2f, right.y + 78.dp.toPx() - beer.size.height))
    }
}

// Renlighet: wipe the counter clean

private val spots = listOf(
    Triple(0.2f, 0.3f, 38f), Triple(0.7f, 0.25f, 26f), Triple(0.45f, 0.6f, 46f),
    Triple(0.82f, 0.68f, 30f), Triple(0.15f, 0.75f, 22f), Triple(0.58f, 0.2f, 18f),
)

@Composable
private fun WipeControl(value: Int, update: (Int) -> Unit) {
    val level = animated(value)
    BoxWithConstraints(Modifier.fillMaxSize().padding(10.dp).finger { size, point -> update(RatingGestures.across(point.x / size.width)) }) {
        Canvas(Modifier.fillMaxSize().clip(RoundedCornerShape(22.dp))) {
            drawRect(Brush.verticalGradient(listOf(Color(0xFF523824), Color(0xFF332114))))
            spots.forEachIndexed { index, (x, y, size) ->
                val alpha = ((6 - level) - index).coerceIn(0f, 1f) * 0.9f
                val w = size.dp.toPx() * 1.4f
                val h = size.dp.toPx()
                drawOval(Brush.radialGradient(listOf(Color(0xFF1F1408).copy(alpha = alpha), Color(0xFF1F1408).copy(alpha = alpha * 0.6f), Color.Transparent),
                    Offset(x * this.size.width, y * this.size.height), w * 0.6f), Offset(x * this.size.width - w / 2, y * this.size.height - h / 2), Size(w, h))
            }
            drawRect(Brush.linearGradient(listOf(Color.White.copy(alpha = 0f), Color.White.copy(alpha = 0.05f + level * 0.04f), Color.White.copy(alpha = 0f)), Offset.Zero, Offset(this.size.width, this.size.height)))
            if (value >= 4) {
                sparkle(Offset(this.size.width * 0.78f, this.size.height * 0.3f), 15.dp.toPx(), Color.White)
                sparkle(Offset(this.size.width * 0.3f, this.size.height * 0.62f), 9.dp.toPx(), Color.White.copy(alpha = 0.8f))
            }
        }
        val x = 24.dp + (maxWidth - 48.dp) * (level / 5)
        Box(Modifier.offset(x = x - 25.dp, y = maxHeight / 2 - 25.dp).size(50.dp).clip(CircleShape).background(Ess.amber), contentAlignment = Alignment.Center) {
            Text("✋", fontSize = 24.sp)
        }
    }
}

/** A four-pointed sparkle. */
private fun DrawScope.sparkle(c: Offset, r: Float, color: Color) {
    drawPath(Path().apply {
        moveTo(c.x, c.y - r)
        quadraticTo(c.x, c.y, c.x + r, c.y)
        quadraticTo(c.x, c.y, c.x, c.y + r)
        quadraticTo(c.x, c.y, c.x - r, c.y)
        quadraticTo(c.x, c.y, c.x, c.y - r)
        close()
    }, color)
}

// Ljudnivå: a level meter, 0 = loud, 5 = quiet

private val meterPattern = listOf(0.5f, 0.8f, 0.65f, 1f, 0.75f, 0.9f, 0.55f, 0.85f, 0.7f, 0.95f, 0.6f, 0.8f)

@Composable
private fun VolumeControl(value: Int, update: (Int) -> Unit) {
    val loudness = (5 - animated(value)) / 5
    Box(Modifier.fillMaxSize().finger { size, point -> update(RatingGestures.across(point.x / size.width)) }) {
        Row(Modifier.fillMaxSize().padding(bottom = 24.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            Canvas(Modifier.size(50.dp)) { speaker(value) }
            Spacer(Modifier.width(14.dp))
            Canvas(Modifier.width((meterPattern.size * 15 - 5).dp).fillMaxHeight()) {
                val usable = size.height
                meterPattern.forEachIndexed { index, level ->
                    val h = maxOf(8.dp.toPx(), (0.08f + loudness * 0.92f) * level * usable)
                    val x = index * 15.dp.toPx()
                    val brush = if (loudness > 0.6f) Brush.verticalGradient(listOf(Ess.bad, Ess.amber), (usable - h) / 2, (usable + h) / 2) else Brush.verticalGradient(listOf(Ess.amber, Ess.amber))
                    drawRoundRect(brush, Offset(x, (usable - h) / 2), Size(10.dp.toPx(), h), CornerRadius(5.dp.toPx()))
                }
            }
        }
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 20.dp)) {
            Text("Högljutt", style = MaterialTheme.typography.labelMedium, color = Ess.tertiaryText)
            Spacer(Modifier.weight(1f))
            Text("Tyst", style = MaterialTheme.typography.labelMedium, color = Ess.tertiaryText)
        }
    }
}

/** A speaker with as many waves as it is loud. */
private fun DrawScope.speaker(value: Int) {
    val waves = listOf(3, 3, 2, 2, 1, 0)[RatingWords.clamp(value)]
    val c = center
    val u = size.minDimension / 50
    drawRect(Color.White, Offset(c.x - 18 * u, c.y - 6 * u), Size(8 * u, 12 * u))
    drawPath(Path().apply {
        moveTo(c.x - 10 * u, c.y - 6 * u); lineTo(c.x, c.y - 14 * u); lineTo(c.x, c.y + 14 * u); lineTo(c.x - 10 * u, c.y + 6 * u); close()
    }, Color.White)
    for (wave in 1..waves) {
        val r = (4 + wave * 6) * u
        drawArc(Color.White, -45f, 90f, false, Offset(c.x - r + 2 * u, c.y - r), Size(2 * r, 2 * r), style = Stroke(3 * u, cap = StrokeCap.Round))
    }
}

// Barhoppotential: how many bars within a short walk

private val hopBars = listOf(20.0 to "2 min", 150.0 to "4 min", 250.0 to "6 min", 70.0 to "9 min", 320.0 to "12 min")

@Composable
private fun HopControl(value: Int, update: (Int) -> Unit) {
    val measurer = rememberTextMeasurer()
    val target = if (value == 0) 0f else RatingGestures.hopDistances[RatingWords.clamp(value) - 1] + 0.07f
    val reach by animateFloatAsState(target, label = "hop")
    Canvas(Modifier.fillMaxSize().clip(RoundedCornerShape(22.dp)).pointerInput(Unit) {
        trackFinger { point ->
            val maxRadius = min(size.width, size.height) / 2f - 6.dp.toPx()
            update(RatingGestures.hop(hypot(point.x - size.width / 2f, point.y - size.height / 2f) / maxRadius))
        }
    }) {
        stylisedMap()
        val c = center
        val maxRadius = size.minDimension / 2 - 6.dp.toPx()
        val radius = maxOf(14.dp.toPx(), reach * maxRadius)
        drawCircle(Ess.amber.copy(alpha = 0.1f), radius, c)
        drawCircle(Ess.amber, radius, c, style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))))
        hopBars.forEachIndexed { index, (degrees, label) ->
            val radians = degrees * PI / 180
            val distance = RatingGestures.hopDistances[index] * maxRadius
            val point = c + Offset((cos(radians) * distance).toFloat(), (sin(radians) * distance).toFloat())
            val inside = index < value
            drawCircle(if (inside) Ess.amber else Color.White.copy(alpha = 0.25f), 6.dp.toPx(), point)
            if (inside) {
                val text = measurer.measure(label, TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White))
                val x = point.x + (if (cos(radians) >= 0) 26.dp.toPx() else -26.dp.toPx())
                val box = Size(text.size.width + 10.dp.toPx(), text.size.height + 2.dp.toPx())
                drawRoundRect(Color.Black.copy(alpha = 0.7f), Offset(x - box.width / 2, point.y - box.height / 2), box, CornerRadius(box.height / 2))
                drawText(text, topLeft = Offset(x - text.size.width / 2f, point.y - text.size.height / 2f))
            }
        }
        drawCircle(Color.White, 16.dp.toPx(), c)
        translate(c.x, c.y) {
            drawRoundRect(Color.Black, Offset(-6.dp.toPx(), -6.dp.toPx()), Size(9.dp.toPx(), 12.dp.toPx()), CornerRadius(2.dp.toPx()))
            drawRoundRect(Color.Black, Offset(2.dp.toPx(), -3.dp.toPx()), Size(5.dp.toPx(), 7.dp.toPx()), CornerRadius(2.5.dp.toPx()), style = Stroke(1.5.dp.toPx()))
        }
    }
}

/** A drawn city at night: a river, parks, and a loose street grid. */
private fun DrawScope.stylisedMap() {
    val w = size.width
    val h = size.height
    drawRect(Color(0xFF121216))
    listOf(Triple(0.27f, 0.80f, Size(0.2f, 0.12f)), Triple(0.62f, 0.62f, Size(0.12f, 0.07f)), Triple(0.86f, 0.48f, Size(0.1f, 0.06f))).forEach { (x, y, extent) ->
        drawRoundRect(Color(0xFF14241A), Offset((x - extent.width / 2) * w, (y - extent.height / 2) * h), Size(extent.width * w, extent.height * h), CornerRadius(30.dp.toPx()))
    }
    val minor = Path()
    for (row in 0 until 18) {
        val y = row / 17f * h
        minor.moveTo(0f, y + (sin(row * 1.7) * 12).toFloat())
        minor.lineTo(w, y + (cos(row * 1.3) * 20).toFloat() + 14)
    }
    for (column in 0 until 12) {
        val x = column / 11f * w
        minor.moveTo(x + (sin(column.toDouble()) * 18).toFloat(), 0f)
        minor.lineTo(x + (cos(column * 2.1) * 26).toFloat(), h)
    }
    drawPath(minor, Color.White.copy(alpha = 0.05f), style = Stroke(1.dp.toPx()))
    val major = Path().apply {
        moveTo(0f, 0.55f * h)
        cubicTo(0.35f * w, 0.5f * h, 0.7f * w, 0.47f * h, w, 0.42f * h)
        moveTo(0.6f * w, 0.3f * h)
        cubicTo(0.62f * w, 0.6f * h, 0.45f * w, 0.8f * h, 0.5f * w, h)
        moveTo(0.1f * w, 0.3f * h)
        lineTo(0.25f * w, h)
    }
    drawPath(major, Color.White.copy(alpha = 0.13f), style = Stroke(3.dp.toPx()))
    val river = Path().apply {
        moveTo(-20f, 0.25f * h)
        cubicTo(0.2f * w, 0.2f * h, 0.4f * w, 0.2f * h, 0.55f * w, 0.17f * h)
        cubicTo(0.75f * w, 0.14f * h, 0.85f * w, 0.05f * h, w + 20, 0.05f * h)
    }
    drawPath(river, Color(0xFF172133), style = Stroke(46.dp.toPx(), cap = StrokeCap.Round))
}
