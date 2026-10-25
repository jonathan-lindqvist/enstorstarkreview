import Foundation

/// A row in the per-brand table: regular prices for every brand, cl/kr where a volume was given.
public struct BeerBrandRow: Identifiable, Equatable, Sendable {
    public var brand: String
    public var averagePriceKr: Double
    public var priceCount: Int
    public var averageClPerKr: Double?
    public var valueCount: Int

    public var id: String { brand }

    /// The web's sort columns with their default directions.
    public enum Sort: String, CaseIterable, Sendable {
        case price, value, name
    }

    public static func rows(_ statistics: ReviewStatistics, sort: Sort) -> [BeerBrandRow] {
        let values = Dictionary(statistics.beerBrandValues.map { ($0.brand, $0) }, uniquingKeysWith: { first, _ in first })
        let rows = statistics.beerBrandPrices.map { price in
            BeerBrandRow(
                brand: price.brand,
                averagePriceKr: price.averagePriceKr,
                priceCount: price.reviewCount,
                averageClPerKr: values[price.brand]?.averageClPerKr,
                valueCount: values[price.brand]?.reviewCount ?? 0
            )
        }
        return rows.sorted { first, second in
            let byName = first.brand.compare(second.brand, locale: Formatting.swedish) == .orderedAscending
            switch sort {
            case .name:
                return byName
            case .price:
                return first.averagePriceKr == second.averagePriceKr ? byName : first.averagePriceKr < second.averagePriceKr
            case .value:
                switch (first.averageClPerKr, second.averageClPerKr) {
                case let (a?, b?): return a == b ? byName : a > b
                case (nil, nil): return byName
                case (_?, nil): return true
                case (nil, _?): return false
                }
            }
        }
    }
}
