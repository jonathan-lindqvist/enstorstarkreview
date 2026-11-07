import Foundation

/// The Prisvärdhet gates: which value rating a price per centilitre suggests.
///
/// A copy of the web's `src/lib/utils/price-value.ts`; the API sends no gates, so change both
/// apps and the web together. The suggestion only highlights a value and never sets the rating.
public enum PriceValue {
    /// The volume to assume when a review has none.
    public static let assumedVolumeCl = 40

    /// Upper kr/cl limits, exclusive, from the best rating down. Above the last one the rating is 0.
    static let gates: [(rating: Int, belowKrPerCl: Double)] = [
        (5, 1.15), (4, 1.6), (3, 1.755), (2, 2.255), (1, 2.605),
    ]
    static let mostExpensiveRating = 0

    public struct Suggestion: Equatable, Sendable {
        public var rating: Int
        public var krPerCl: Double
        public var assumedVolume: Bool
    }

    /// A rated regular price placed in its gate.
    public struct Bar: Sendable {
        public var point: PriceComparisonPoint
        public var krPerCl: Double
        public var gateRating: Int
        public var valueRating: Double
        /// How far the rating is from the gate's rating.
        public var distance: Double
        public var assumedVolume: Bool
    }

    public struct Gate: Equatable, Sendable {
        public var rating: Int
        public var fromKrPerCl: Double
        /// Nil for the most expensive gate.
        public var belowKrPerCl: Double?
        public var count: Int
        /// Bars in the gate whose rating is the gate's rating.
        public var exact: Int
    }

    public struct Comparison: Sendable {
        public var bars: [Bar]
        /// From rating 5 down to 0.
        public var gates: [Gate]
        public var exactCount: Int { bars.filter { $0.distance == 0 }.count }
        public var nearCount: Int { bars.filter { $0.distance == 1 }.count }
        public var farCount: Int { bars.filter { $0.distance >= 2 }.count }
    }

    /// Nil without a whole-krona price (1–999) or with a volume outside 1–200 cl.
    public static func suggest(priceKr: Int?, volumeCl: Int?) -> Suggestion? {
        guard let priceKr, (1...999).contains(priceKr) else { return nil }
        let volume = volumeCl ?? assumedVolumeCl
        guard (1...200).contains(volume) else { return nil }
        let krPerCl = Double(priceKr) / Double(volume)
        let rating = gates.first { krPerCl < $0.belowKrPerCl }?.rating ?? mostExpensiveRating
        return Suggestion(rating: rating, krPerCl: krPerCl, assumedVolume: volumeCl == nil)
    }

    /// The gates against the actual ratings. Happy hour prices and unrated bars are left out,
    /// because the gates are fitted to regular prices.
    public static func compare(_ points: [PriceComparisonPoint]) -> Comparison {
        let bars = points.compactMap { point -> Bar? in
            guard !point.isHappyHourPrice, let rating = point.valueRating,
                  let suggestion = suggest(priceKr: point.beerPriceKr, volumeCl: point.beerVolumeCl) else { return nil }
            return Bar(point: point, krPerCl: suggestion.krPerCl, gateRating: suggestion.rating, valueRating: rating,
                       distance: abs(Double(suggestion.rating) - rating), assumedVolume: suggestion.assumedVolume)
        }
        let limits: [Double?] = [0] + gates.map(\.belowKrPerCl) + [nil]
        let ratings = gates.map(\.rating) + [mostExpensiveRating]
        let summaries = ratings.enumerated().map { index, rating in
            let inGate = bars.filter { $0.gateRating == rating }
            return Gate(rating: rating, fromKrPerCl: limits[index] ?? 0, belowKrPerCl: limits[index + 1],
                        count: inGate.count, exact: inGate.filter { $0.distance == 0 }.count)
        }
        return Comparison(bars: bars, gates: summaries)
    }
}
