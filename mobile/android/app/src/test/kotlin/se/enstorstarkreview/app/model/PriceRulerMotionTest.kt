package se.enstorstarkreview.app.model

import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PriceRulerMotionTest {
    @Test fun flickContinuesThenSlowsAndSettlesOnWholeKrona() {
        val motion = PriceRulerMotion(70.0, 0..1000)
        motion.release(100.0, reduceMotion = false)
        motion.advance(0.05)
        val firstDistance = motion.position - 70
        assertTrue(firstDistance > 0)
        val previous = motion.position
        motion.advance(0.05)
        assertTrue(motion.position > previous)
        assertTrue(motion.position - previous < firstDistance)
        repeat(180) { motion.advance(1.0 / 60) }
        assertFalse(motion.isMoving)
        assertEquals(motion.selected.toDouble(), motion.position, 0.0)
        assertTrue(motion.selected > 70)
    }

    @Test fun fasterFlickTravelsFurtherInEitherDirection() {
        for (direction in listOf(-1.0, 1.0)) {
            val slow = PriceRulerMotion(500.0, 0..1000)
            val fast = PriceRulerMotion(500.0, 0..1000)
            slow.release(direction * 40, reduceMotion = false)
            fast.release(direction * 150, reduceMotion = false)
            slow.advance(3.0)
            fast.advance(3.0)
            assertTrue(abs(fast.position - 500) > abs(slow.position - 500))
            assertTrue((fast.position - 500) * direction > 0)
        }
    }

    @Test fun boundsStopMomentumWithoutOvershoot() {
        for (speed in listOf(-500.0, 500.0)) {
            val motion = PriceRulerMotion(50.0, 45..55)
            motion.release(speed, reduceMotion = false)
            motion.advance(1.0)
            assertEquals(if (speed < 0) 45 else 55, motion.selected)
            assertFalse(motion.isMoving)
        }
    }

    @Test fun newDragInterruptsMomentumImmediately() {
        val motion = PriceRulerMotion(70.0, 0..1000)
        motion.release(100.0, reduceMotion = false)
        motion.advance(0.05)
        motion.drag(80.25)
        motion.advance(1.0)
        assertEquals(80.25, motion.position, 0.0)
        assertFalse(motion.isMoving)
    }

    @Test fun reducedMotionAndTapDoNotCoast() {
        for ((speed, reduced) in listOf(100.0 to true, 0.0 to false)) {
            val motion = PriceRulerMotion(70.2, 0..1000)
            motion.release(speed, reduced)
            motion.advance(1.0)
            assertEquals(70.0, motion.position, 0.0)
            assertFalse(motion.isMoving)
        }
    }

    @Test fun elapsedTimeMakesMotionIndependentOfFrameRate() {
        val oneFrame = PriceRulerMotion(70.0, 0..1000)
        val manyFrames = PriceRulerMotion(70.0, 0..1000)
        oneFrame.release(100.0, reduceMotion = false)
        manyFrames.release(100.0, reduceMotion = false)
        oneFrame.advance(0.1)
        repeat(6) { manyFrames.advance(1.0 / 60) }
        assertEquals(oneFrame.position, manyFrames.position, 0.0001)
    }

    @Test fun invalidInputAndSingleValueRangeStayFiniteAndBounded() {
        val motion = PriceRulerMotion(70.0, 50..50)
        motion.release(Double.POSITIVE_INFINITY, reduceMotion = false)
        motion.advance(Double.NaN)
        motion.drag(Double.NaN)
        assertEquals(50, motion.selected)
        assertFalse(motion.isMoving)
    }

    @Test fun stoppingForDismissalOrManualEntryPreventsLaterWrites() {
        val motion = PriceRulerMotion(70.3, 0..1000)
        motion.release(100.0, reduceMotion = false)
        motion.advance(0.05)
        motion.stop()
        val stopped = motion.selected
        motion.advance(10.0)
        assertEquals(stopped, motion.selected)
        assertFalse(motion.isMoving)
        motion.drag(90.0)
        motion.advance(10.0)
        assertEquals(90, motion.selected)
    }

    @Test fun invalidElapsedTimeDoesNotMoveAndHugeVelocityHasBoundedTravel() {
        val motion = PriceRulerMotion(500.0, 0..1000)
        motion.release(Double.MAX_VALUE, reduceMotion = false)
        for (time in listOf(Double.NaN, Double.POSITIVE_INFINITY, -1.0, 0.0)) motion.advance(time)
        assertEquals(500.0, motion.position, 0.0)
        motion.advance(10.0)
        assertTrue(motion.selected <= 550)
        assertFalse(motion.isMoving)
    }
}
