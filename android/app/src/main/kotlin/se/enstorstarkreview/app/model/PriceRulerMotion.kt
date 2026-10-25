package se.enstorstarkreview.app.model

import kotlin.math.abs
import kotlin.math.exp

/** The price ruler's motion. Position is continuous; the form receives the nearest whole krona. */
class PriceRulerMotion(value: Double, val range: IntRange) {
    var position: Double = if (value.isFinite()) value.coerceIn(range.first.toDouble(), range.last.toDouble()) else range.first.toDouble()
        private set
    var velocity = 0.0
        private set
    val selected: Int get() = Math.round(position).toInt()
    val isMoving: Boolean get() = velocity != 0.0

    fun drag(value: Double) {
        velocity = 0.0
        if (!value.isFinite()) return
        position = value.coerceIn(range.first.toDouble(), range.last.toDouble())
    }

    fun stop() {
        velocity = 0.0
        position = Math.round(position).toDouble()
    }

    fun release(velocity: Double, reduceMotion: Boolean) {
        if (reduceMotion || !velocity.isFinite() || abs(velocity) < 3 || range.first >= range.last) {
            stop()
            return
        }
        // Bound both work and travel even for a very fast or erroneous gesture sample.
        this.velocity = velocity.coerceIn(-300.0, 300.0)
        if ((position <= range.first && velocity < 0) || (position >= range.last && velocity > 0)) stop()
    }

    fun advance(seconds: Double) {
        if (!isMoving || !seconds.isFinite() || seconds <= 0) return
        // Integrate exponential friction analytically: dropped frames do not change the travel
        // distance. About 95% of the velocity is lost in half a second.
        val friction = 6.0
        val decay = exp(-friction * seconds)
        position += velocity / friction * (1 - decay)
        velocity *= decay
        position = position.coerceIn(range.first.toDouble(), range.last.toDouble())
        if (position <= range.first || position >= range.last || abs(velocity) < 1) stop()
    }
}
