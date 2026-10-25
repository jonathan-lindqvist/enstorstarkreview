import Foundation
import Testing
@testable import EnStorStarkModel

@MainActor @Suite struct DistanceSortTests {
    let transport = FakeTransport()
    let origin = GeoPoint(latitude: 57.7, longitude: 11.95)

    /// A point `metres` north of the origin.
    func north(_ metres: Double) -> GeoPoint {
        GeoPoint(latitude: 57.7 + metres / 1000 / 6371 * 180 / .pi, longitude: 11.95)
    }

    /// Reviews newest first, like the API's `latest` sort.
    func list(_ slugs: [String]) async -> ReviewListModel {
        let base = Fixture.object("review")
        let reviews = slugs.enumerated().map { index, slug -> [String: Any] in
            var review = base
            review["slug"] = slug
            review["id"] = "id-\(slug)"
            review["createdAt"] = "2026-10-\(String(format: "%02d", 20 - index))T12:00:00.000Z"
            return review
        }
        transport.respond(to: "listReviews", with: .json(Fixture.json(["reviews": reviews])))
        let list = ReviewListModel(api: .fake(transport))
        await list.load()
        return list
    }

    @Test func distanceIsTheWebsHaversineInKilometres() throws {
        let km = try #require(ReviewDistance.kilometres(from: origin, to: north(1234)))
        #expect(abs(km - 1.234) < 0.001)
        #expect(ReviewDistance.kilometres(from: origin, to: GeoPoint(latitude: 91, longitude: 0)) == nil)
    }

    @Test func distancesUseOneDecimalKilometresLikeTheWeb() {
        #expect(Formatting.distance(kilometres: 1.234) == "1,2 km")
        #expect(Formatting.distance(kilometres: 0) == "0,0 km")
    }

    /// Nearest first; equal distances stay newest first; reviews without a position go last.
    @Test func nearestSortsByDistanceWithUnknownLast() async {
        let list = await list(["newest-unknown", "far", "tie-newer", "tie-older", "near", "oldest-unknown"])
        list.positions = ["far": north(3000), "tie-newer": north(800), "tie-older": north(800), "near": north(100)]
        list.origin = origin
        list.nearest = true
        #expect(list.visibleReviews.map(\.slug) == ["near", "tie-newer", "tie-older", "far", "newest-unknown", "oldest-unknown"])
        #expect(list.distanceKm(for: "near").map { abs($0 - 0.1) < 0.001 } == true)
        #expect(list.distanceKm(for: "newest-unknown") == nil)
    }

    /// Without a location, Närmast stays selected and shows the newest first.
    @Test func withoutALocationNearestShowsTheNewestFirst() async {
        let list = await list(["a", "b", "c"])
        list.positions = ["c": north(10)]
        list.nearest = true
        #expect(list.visibleReviews.map(\.slug) == ["a", "b", "c"])
        #expect(list.distanceKm(for: "c") == nil)
    }

    /// The API has no nearest sort: Närmast asks for the newest first and orders on the device.
    @Test func nearestLoadsTheLatestFromTheAPI() async {
        let list = await list(["a"])
        list.sort = .score
        list.nearest = true
        await list.load()
        let query = transport.sent("listReviews").last?.request.path ?? ""
        #expect(query.contains("sort=latest"))
        #expect(!query.contains("near"))
    }

    @Test func choosingAnAPISortLeavesNearest() async {
        let list = await list(["a"])
        list.nearest = true
        list.choose(.score)
        #expect(list.nearest == false)
        #expect(list.sort == .score)
    }

    /// The device location stays in memory: the map markers give the positions.
    @Test func positionsComeFromTheMapMarkers() throws {
        let marker: [String: Any] = ["slug": "majornas-bryggeri", "title": "Majornas bryggeri", "overallRating": 2,
                                     "location": "Karl Johansgatan 88", "latitude": 57.69, "longitude": 11.92,
                                     "beer": NSNull(), "attributes": []]
        let map = try JSONDecoder().decode(ReviewMap.self, from: Fixture.json(["markers": [marker]]))
        #expect(ReviewDistance.positions(map) == ["majornas-bryggeri": GeoPoint(latitude: 57.69, longitude: 11.92)])
    }
}
