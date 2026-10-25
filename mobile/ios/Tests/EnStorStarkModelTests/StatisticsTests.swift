import Foundation
import Testing
@testable import EnStorStarkModel

@Suite struct StatisticsTests {
    static let statistics = try! JSONDecoder().decode(ReviewStatistics.self, from: Fixture.data("statistics"))

    /// Like the web's brand table: prices for every brand, cl/kr where a volume was given.
    @Test func brandRowsJoinPricesAndValues() throws {
        let rows = BeerBrandRow.rows(Self.statistics, sort: .price)
        #expect(rows.count == Self.statistics.beerBrandPrices.count)
        let falcon = try #require(rows.first { $0.brand == "Falcon Export" })
        #expect(falcon.averagePriceKr == 43.5)
        #expect(falcon.priceCount == 2)
        #expect(falcon.averageClPerKr == 1.1)
        #expect(falcon.valueCount == 2)
        let unknown = try #require(rows.first { $0.brand == "Budvar" })
        #expect(unknown.averageClPerKr == nil)
        #expect(unknown.valueCount == 0)
    }

    /// Cheapest first, ties by Swedish name order (the web's default).
    @Test func priceSortIsCheapestFirst() {
        let rows = BeerBrandRow.rows(Self.statistics, sort: .price)
        #expect(rows.first?.brand == "Falcon Export")
        #expect(rows.last?.brand == "Åbro Original")
        let tie = rows.filter { $0.averagePriceKr == 80.5 }.map(\.brand)
        #expect(tie == ["Heineken", "San Miguel"])
    }

    /// Most beer per krona first, brands without a volume last.
    @Test func valueSortIsMostBeerFirstWithUnknownLast() {
        let rows = BeerBrandRow.rows(Self.statistics, sort: .value)
        #expect(rows.prefix(3).map(\.brand) == ["Falcon Export", "Heineken", "Åbro Original"])
        #expect(rows.dropFirst(3).allSatisfy { $0.averageClPerKr == nil })
        #expect(rows.dropFirst(3).first?.brand == "Budvar")
    }

    /// Swedish order puts Å after Z.
    @Test func nameSortUsesSwedishOrder() {
        let rows = BeerBrandRow.rows(Self.statistics, sort: .name)
        #expect(rows.first?.brand == "Budvar")
        #expect(rows.last?.brand == "Åbro Original")
        #expect(rows.firstIndex { $0.brand == "Zlatopramen" }! < rows.firstIndex { $0.brand == "Åbro Original" }!)
    }

    @Test func clPerKrValuesUseTwoDecimals() {
        #expect(Formatting.clPerKr(50.0 / 65.0) == "0,77 cl/kr")
        #expect(Formatting.clPerKr(1.1) == "1,10 cl/kr")
    }

    /// A non-breaking space, so the amount never wraps.
    @Test func spendingUsesSwedishThousandsSeparators() {
        #expect(Formatting.wholeNumber(6953) == "6\u{00A0}953")
    }
}
