import XCTest
@testable import EnStorStarkModel

final class PriceRulerMotionTests: XCTestCase {
    func testFlickContinuesThenSlowsAndSettlesOnWholeKrona() {
        var motion = PriceRulerMotion(value: 70, range: 0...1000)
        motion.release(velocity: 100, reduceMotion: false)
        motion.advance(by: 0.05)
        let firstDistance = motion.position - 70
        XCTAssertGreaterThan(firstDistance, 0)
        let previous = motion.position
        motion.advance(by: 0.05)
        XCTAssertGreaterThan(motion.position, previous)
        XCTAssertLessThan(motion.position - previous, firstDistance)
        for _ in 0..<180 { motion.advance(by: 1.0 / 60) }
        XCTAssertFalse(motion.isMoving)
        XCTAssertEqual(motion.position, Double(motion.selected))
        XCTAssertGreaterThan(motion.selected, 70)
    }

    func testFasterFlickTravelsFurtherInEitherDirection() {
        for direction in [-1.0, 1.0] {
            var slow = PriceRulerMotion(value: 500, range: 0...1000)
            var fast = slow
            slow.release(velocity: direction * 40, reduceMotion: false)
            fast.release(velocity: direction * 150, reduceMotion: false)
            slow.advance(by: 3)
            fast.advance(by: 3)
            XCTAssertGreaterThan(abs(fast.position - 500), abs(slow.position - 500))
            XCTAssertGreaterThan((fast.position - 500) * direction, 0)
        }
    }

    func testBoundsStopMomentumWithoutOvershoot() {
        for speed in [-500.0, 500.0] {
            var motion = PriceRulerMotion(value: 50, range: 45...55)
            motion.release(velocity: speed, reduceMotion: false)
            motion.advance(by: 1)
            XCTAssertEqual(motion.selected, speed < 0 ? 45 : 55)
            XCTAssertFalse(motion.isMoving)
        }
    }

    func testNewDragInterruptsMomentumImmediately() {
        var motion = PriceRulerMotion(value: 70, range: 0...1000)
        motion.release(velocity: 100, reduceMotion: false)
        motion.advance(by: 0.05)
        motion.drag(to: 80.25)
        motion.advance(by: 1)
        XCTAssertEqual(motion.position, 80.25)
        XCTAssertFalse(motion.isMoving)
    }

    func testReducedMotionAndTapDoNotCoast() {
        for (speed, reduced) in [(100.0, true), (0.0, false)] {
            var motion = PriceRulerMotion(value: 70.2, range: 0...1000)
            motion.release(velocity: speed, reduceMotion: reduced)
            motion.advance(by: 1)
            XCTAssertEqual(motion.position, 70)
            XCTAssertFalse(motion.isMoving)
        }
    }

    func testElapsedTimeMakesMotionIndependentOfFrameRate() {
        var oneFrame = PriceRulerMotion(value: 70, range: 0...1000)
        oneFrame.release(velocity: 100, reduceMotion: false)
        var manyFrames = oneFrame
        oneFrame.advance(by: 0.1)
        for _ in 0..<6 { manyFrames.advance(by: 1.0 / 60) }
        XCTAssertEqual(oneFrame.position, manyFrames.position, accuracy: 0.0001)
    }

    func testInvalidInputAndSingleValueRangeStayFiniteAndBounded() {
        var motion = PriceRulerMotion(value: 70, range: 50...50)
        motion.release(velocity: .infinity, reduceMotion: false)
        motion.advance(by: .nan)
        motion.drag(to: .nan)
        XCTAssertEqual(motion.selected, 50)
        XCTAssertFalse(motion.isMoving)
    }

    func testStoppingForDismissalOrManualEntryPreventsLaterWrites() {
        var motion = PriceRulerMotion(value: 70.3, range: 0...1000)
        motion.release(velocity: 100, reduceMotion: false)
        motion.advance(by: 0.05)
        motion.stop()
        let stopped = motion.selected
        motion.advance(by: 10)
        XCTAssertEqual(motion.selected, stopped)
        XCTAssertFalse(motion.isMoving)
        motion.drag(to: 90)
        motion.advance(by: 10)
        XCTAssertEqual(motion.selected, 90)
    }

    func testInvalidElapsedTimeDoesNotMoveAndHugeVelocityHasBoundedTravel() {
        var motion = PriceRulerMotion(value: 500, range: 0...1000)
        motion.release(velocity: .greatestFiniteMagnitude, reduceMotion: false)
        for time in [Double.nan, .infinity, -1, 0] { motion.advance(by: time) }
        XCTAssertEqual(motion.position, 500)
        motion.advance(by: 10)
        XCTAssertLessThanOrEqual(motion.selected, 550)
        XCTAssertFalse(motion.isMoving)
    }
}

@main
enum RunPriceRulerTests {
    static func main() {
        let suite = PriceRulerMotionTests.defaultTestSuite
        suite.run()
        exit(suite.testRun?.hasSucceeded == true ? 0 : 1)
    }
}
