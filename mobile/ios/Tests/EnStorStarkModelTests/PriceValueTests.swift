import Foundation
import Testing
@testable import EnStorStarkModel

/// The Prisvärdhet gates, copied from the web's `src/lib/utils/price-value.ts` with its test cases.
@MainActor @Suite struct PriceValueTests {
    static let statistics = try! JSONDecoder().decode(ReviewStatistics.self, from: Fixture.data("statistics"))

    @Test(arguments: [
        (45, 5), (46, 4), (63, 4), (64, 3), (70, 3), (71, 2), (90, 2), (91, 1), (104, 1), (105, 0),
    ])
    func pricesFor40ClMapToTheGates(price: Int, rating: Int) {
        #expect(PriceValue.suggest(priceKr: price, volumeCl: 40)?.rating == rating)
    }

    @Test func theSuggestionReportsKrPerCl() {
        #expect(PriceValue.suggest(priceKr: 55, volumeCl: 50) == .init(rating: 5, krPerCl: 1.1, assumedVolume: false))
    }

    @Test func aMissingVolumeAssumes40Cl() {
        #expect(PriceValue.suggest(priceKr: 60, volumeCl: nil) == .init(rating: 4, krPerCl: 1.5, assumedVolume: true))
    }

    @Test(arguments: [(nil, 40), (0, 40), (1000, 40), (60, 0), (60, 201)] as [(Int?, Int?)])
    func thereIsNoSuggestionWithoutAValidPriceAndVolume(price: Int?, volume: Int?) {
        #expect(PriceValue.suggest(priceKr: price, volumeCl: volume) == nil)
    }

    @Test func theHintNamesTheRatingAndKrPerCl() throws {
        let assumed = try #require(PriceValue.suggest(priceKr: 55, volumeCl: nil))
        #expect(Formatting.priceValueHint(assumed) == "Statistiken säger 4 vid 1,38 kr/cl (antar 40 cl).")
        let given = try #require(PriceValue.suggest(priceKr: 55, volumeCl: 50))
        #expect(Formatting.priceValueHint(given) == "Statistiken säger 5 vid 1,10 kr/cl.")
    }

    /// The wizard highlights the suggestion but never sets the rating.
    @Test func theFormSuggestsFromItsPriceAndVolumeWithoutChangingTheRating() async throws {
        let transport = FakeTransport()
        transport.respond(to: "getReviewMetadata", with: .json(Fixture.data("review-metadata")))
        let api = APIClient.fake(transport)
        let form = ReviewFormModel(api: api, metadata: try await api.reviewMetadata(), currentUser: "test", editing: nil)
        #expect(form.priceValueSuggestion == nil)
        form.draft.priceKr = 55
        #expect(form.priceValueSuggestion?.rating == 4)
        form.draft.volumeCl = 50
        #expect(form.priceValueSuggestion?.rating == 5)
        #expect(form.draft.ratings[.price] == 0)
    }

    func point(_ title: String, _ price: Int, _ volume: Int?, _ rating: Double?, happyHour: Bool = false) -> PriceComparisonPoint {
        .init(title: title, slug: title, beerPriceKr: price, beerVolumeCl: volume, isHappyHourPrice: happyHour, valueRating: rating)
    }

    @Test func barsArePlacedInGatesWithTheirRatingDistance() throws {
        let comparison = PriceValue.compare([point("Rätt", 55, 40, 4), point("Nära", 55, nil, 3), point("Långt", 110, 40, 2)])
        #expect(comparison.bars.map { [$0.gateRating, Int($0.distance)] } == [[4, 0], [4, 1], [0, 2]])
        try #require(comparison.bars.count == 3)
        #expect(comparison.bars[1].assumedVolume)
        #expect(comparison.gates.first { $0.rating == 4 } == .init(rating: 4, fromKrPerCl: 1.15, belowKrPerCl: 1.6, count: 2, exact: 1))
        let last = try #require(comparison.gates.last)
        #expect(last.rating == 0 && last.belowKrPerCl == nil && last.count == 1 && last.exact == 0)
    }

    @Test func happyHourPricesAndUnratedBarsAreLeftOut() {
        let comparison = PriceValue.compare([point("Happy", 40, 40, 5, happyHour: true), point("Ej betygsatt", 40, 40, nil)])
        #expect(comparison.bars.isEmpty)
    }

    /// The statistics response includes every public priced review; a missing volume is null.
    @Test func theStatisticsPointsDecodeAndCompare() throws {
        let points = Self.statistics.priceComparison
        #expect(points.count == 9)
        let hornan = try #require(points.first { $0.slug == "hornan" })
        #expect(hornan.beerVolumeCl == nil)
        #expect(points.first { $0.slug == "granden" }?.valueRating == nil)
        let comparison = PriceValue.compare(points)
        #expect(comparison.bars.count == 7)
        #expect(comparison.exactCount == 4)
        #expect(comparison.nearCount == 2)
        #expect(comparison.farCount == 1)
        #expect(comparison.gates.map(\.count) == [2, 1, 1, 1, 1, 1])
        #expect(comparison.gates.map(\.exact) == [2, 0, 1, 0, 0, 1])
    }

    @Test func gateRangesUseSwedishDecimals() throws {
        let gates = PriceValue.compare([]).gates
        try #require(gates.count == 6)
        #expect(Formatting.krPerClRange(gates[0]) == "under 1,15")
        #expect(Formatting.krPerClRange(gates[1]) == "1,15–1,60")
        #expect(Formatting.krPerClRange(gates[5]) == "från 2,61")
    }

    /// Like the web's chart: the bar, its price and volume, kr/cl, and both ratings.
    @Test func eachBarIsDescribedInWords() throws {
        let bars = PriceValue.compare(Self.statistics.priceComparison).bars
        let silverkallan = try #require(bars.first { $0.point.slug == "silverkallan" })
        #expect(Formatting.priceValueBar(silverkallan) == "Silverkällan: 38 kr för 50 cl, 0,76 kr/cl, betyg 5, väntat betyg 5")
        let hornan = try #require(bars.first { $0.point.slug == "hornan" })
        #expect(Formatting.priceValueBar(hornan) == "Hörnan: 45 kr för 40 cl (antaget), 1,13 kr/cl, betyg 5, väntat betyg 5")
    }
}
