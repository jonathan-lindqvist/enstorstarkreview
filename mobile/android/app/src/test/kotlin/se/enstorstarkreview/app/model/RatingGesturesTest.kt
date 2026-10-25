package se.enstorstarkreview.app.model

import org.junit.Assert.assertEquals
import org.junit.Test

/** The touch rules of the rating controls, as in the iOS controls. */
class RatingGesturesTest {
    /** 0° is straight up and angles grow clockwise; screen y grows downwards. */
    @Test fun anglesStartUpAndGoClockwise() {
        assertEquals(0.0, RatingGestures.angle(0f, -10f), 0.001)
        assertEquals(90.0, RatingGestures.angle(10f, 0f), 0.001)
        assertEquals(-90.0, RatingGestures.angle(-10f, 0f), 0.001)
        assertEquals(180.0, RatingGestures.angle(0f, 10f), 0.001)
    }

    /** The dimmer turns from −135° (0) to 135° (5), 54° per step, and stops at its ends. */
    @Test fun theDimmerTurnsThrough270Degrees() {
        assertEquals(0, RatingGestures.dimmer(-135.0))
        assertEquals(3, RatingGestures.dimmer(27.0))
        assertEquals(5, RatingGestures.dimmer(135.0))
        assertEquals(0, RatingGestures.dimmer(-170.0))
        assertEquals(5, RatingGestures.dimmer(170.0))
    }

    /** The speedometer sweeps the upper half: −90° is 0 and 90° is 5. */
    @Test fun theSpeedometerSweepsAHalfCircle() {
        assertEquals(0, RatingGestures.speedometer(-90.0))
        assertEquals(3, RatingGestures.speedometer(18.0))
        assertEquals(5, RatingGestures.speedometer(120.0))
    }

    @Test fun sidewaysControlsFollowTheFinger() {
        assertEquals(0, RatingGestures.across(0f))
        assertEquals(3, RatingGestures.across(0.55f))
        assertEquals(5, RatingGestures.across(1.3f))
        assertEquals(0, RatingGestures.across(-0.2f))
    }

    /** The pint fills from the bottom: the top of the glass is 5. */
    @Test fun thePintFillsFromTheBottom() {
        assertEquals(5, RatingGestures.fill(0f))
        assertEquals(1, RatingGestures.fill(0.8f))
        assertEquals(0, RatingGestures.fill(1.2f))
    }

    /** The barhop circle counts the bars it reaches. */
    @Test fun theBarhopCircleCountsBars() {
        assertEquals(0, RatingGestures.hop(0.1f))
        assertEquals(1, RatingGestures.hop(0.3f))
        assertEquals(3, RatingGestures.hop(0.6f))
        assertEquals(5, RatingGestures.hop(2f))
    }

    /** A tap on the highest open tap closes it; any other tap sets the value. */
    @Test fun aTapOnTheLastOpenTapClosesIt() {
        assertEquals(4, RatingGestures.tap(current = 2, tap = 4))
        assertEquals(3, RatingGestures.tap(current = 4, tap = 4))
        assertEquals(0, RatingGestures.tap(current = 1, tap = 1))
    }
}
