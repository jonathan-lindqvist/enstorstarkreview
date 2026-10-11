#if !os(Android)
import Foundation

/// Position is continuous; the form receives the nearest whole krona.
struct PriceRulerMotion {
    let range: ClosedRange<Int>
    private(set) var position: Double
    private(set) var velocity = 0.0
    var selected: Int { Int(position.rounded()) }
    var isMoving: Bool { velocity != 0 }

    init(value: Double, range: ClosedRange<Int>) {
        self.range = range
        self.position = value.isFinite
            ? min(max(value, Double(range.lowerBound)), Double(range.upperBound))
            : Double(range.lowerBound)
    }

    mutating func drag(to value: Double) {
        velocity = 0
        guard value.isFinite else { return }
        position = min(max(value, Double(range.lowerBound)), Double(range.upperBound))
    }

    mutating func stop() {
        velocity = 0
        position = position.rounded()
    }

    mutating func release(velocity: Double, reduceMotion: Bool) {
        guard !reduceMotion, velocity.isFinite, abs(velocity) >= 3, range.lowerBound < range.upperBound else {
            stop()
            return
        }
        // Bound both work and travel even for a very fast/erroneous gesture sample.
        self.velocity = min(max(velocity, -300), 300)
        if (position <= Double(range.lowerBound) && velocity < 0)
            || (position >= Double(range.upperBound) && velocity > 0) { stop() }
    }

    mutating func advance(by seconds: Double) {
        guard isMoving, seconds.isFinite, seconds > 0 else { return }
        // Integrate exponential friction analytically: dropped frames do not change
        // the travel distance. About 95% of the velocity is lost in half a second.
        let friction = 6.0
        let decay = exp(-friction * seconds)
        position += velocity / friction * (1 - decay)
        velocity *= decay
        position = min(max(position, Double(range.lowerBound)), Double(range.upperBound))
        if position <= Double(range.lowerBound) || position >= Double(range.upperBound)
            || abs(velocity) < 1 { stop() }
    }
}
#endif
