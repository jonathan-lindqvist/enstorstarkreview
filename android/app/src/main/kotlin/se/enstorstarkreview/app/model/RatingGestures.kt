package se.enstorstarkreview.app.model

import kotlin.math.atan2
import kotlin.math.roundToInt

/** The touch rules of the rating controls: where a finger is, as a value 0–5 (as on iOS). */
object RatingGestures {
    /** Distances of the other bars on the barhop map, as fractions of its radius. */
    val hopDistances = listOf(0.3f, 0.44f, 0.58f, 0.74f, 0.88f)

    /** The angle of a point from a centre in degrees: 0 is up, positive is clockwise. */
    fun angle(dx: Float, dy: Float): Double = Math.toDegrees(atan2(dx.toDouble(), -dy.toDouble()))

    /** Atmosfär: a knob from −135° to 135°, 54° per step. */
    fun dimmer(degrees: Double): Int = clamp((degrees.coerceIn(-135.0, 135.0) + 135) / 54)

    /** Service: a needle from −90° to 90°, 36° per step. */
    fun speedometer(degrees: Double): Int = clamp((degrees.coerceIn(-90.0, 90.0) + 90) / 36)

    /** Prisvärdhet, Renlighet, and Ljudnivå: the finger's position from left (0) to right (1). */
    fun across(fraction: Float): Int = clamp(fraction * 5.0)

    /** Kvalitet: the finger's height in the glass, from the top (0) to the bottom (1). */
    fun fill(fromTop: Float): Int = clamp((1 - fromTop) * 5.0)

    /** Barhoppotential: how many bars a circle reaches, by its radius as a fraction of the map's. */
    fun hop(distance: Float): Int = hopDistances.count { it <= distance }

    /** Utbud: a tap on the highest open tap closes it; any other tap opens up to it. */
    fun tap(current: Int, tap: Int): Int = if (current == tap) tap - 1 else tap

    private fun clamp(value: Double): Int = RatingWords.clamp(value.roundToInt())
}
