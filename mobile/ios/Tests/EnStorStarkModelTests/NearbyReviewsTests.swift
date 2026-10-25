import Foundation
import HTTPTypes
import Testing
@testable import EnStorStarkModel

@MainActor @Suite struct NearbyReviewsTests {
    let transport = FakeTransport()
    let address = "Karl Johansgatan 88, 414 55 Göteborg"

    func model(excluding slug: String? = nil) -> NearbyReviewsModel {
        NearbyReviewsModel(api: .fake(transport), excluding: slug)
    }

    func respond(_ object: Any) {
        transport.respond(to: "getNearbyReviews", with: .json(Fixture.json(object)))
    }

    func query(_ index: Int = 0) -> [URLQueryItem] {
        let sent = transport.sent("getNearbyReviews")
        guard sent.indices.contains(index) else { return [] }
        let path = sent[index].request.path ?? ""
        return URLComponents(string: path)?.queryItems ?? []
    }

    @Test func countsComeFromTheSavedAddress() async throws {
        transport.respond(to: "getNearbyReviews", with: .json(Fixture.data("nearby-reviews")))
        let nearby = model()
        await nearby.load(address: address)
        guard case .results(let result) = nearby.state else {
            Issue.record("Expected results, got \(nearby.state)")
            return
        }
        #expect(result.radiiMetres == [250, 500, 1000])
        #expect(result.counts == [2, 2, 5])
        #expect(result.nearest.first?.title == "Majornas bryggeri")
        #expect(result.locatedCount == 50)
        #expect(result.totalCount == 51)
        #expect(query() == [URLQueryItem(name: "address", value: address)])
    }

    /// An edited review leaves itself out of its own counts.
    @Test func anEditExcludesItself() async {
        transport.respond(to: "getNearbyReviews", with: .json(Fixture.data("nearby-reviews")))
        let nearby = model(excluding: "majornas-bryggeri")
        await nearby.load(address: address)
        #expect(query().contains(URLQueryItem(name: "exclude", value: "majornas-bryggeri")))
    }

    @Test func anAddressWithoutAPositionSaysSo() async {
        respond(["addressKnown": false, "radiiMetres": [250, 500, 1000], "summary": NSNull()])
        let nearby = model()
        await nearby.load(address: "Okänd gata 1")
        #expect(nearby.state == .noPosition)
    }

    @Test func noOtherLocatedReviewsSaysSo() async {
        respond(["addressKnown": true, "radiiMetres": [250, 500, 1000], "summary": NSNull()])
        let nearby = model()
        await nearby.load(address: address)
        #expect(nearby.state == .noneLocated)
    }

    @Test func aFailureCanBeRetried() async {
        transport.respond(to: "getNearbyReviews", with: .problem(status: .serviceUnavailable, code: "service_unavailable"))
        let nearby = model()
        await nearby.load(address: address)
        #expect(nearby.state == .unavailable)
        transport.respond(to: "getNearbyReviews", with: .json(Fixture.data("nearby-reviews")))
        await nearby.retry()
        #expect(nearby.state.isResults)
    }

    /// Moving between rating screens must not repeat the request.
    @Test func theSameAddressLoadsOnce() async {
        transport.respond(to: "getNearbyReviews", with: .json(Fixture.data("nearby-reviews")))
        let nearby = model()
        await nearby.load(address: address)
        await nearby.load(address: "  \(address) ")
        #expect(transport.sent("getNearbyReviews").count == 1)
    }

    /// The server would reject these, so the app does not ask.
    @Test(arguments: ["", "   ", String(repeating: "a", count: 301)])
    func anUnusableAddressSendsNothing(address: String) async {
        let nearby = model()
        await nearby.load(address: address)
        #expect(nearby.state == .noPosition)
        #expect(transport.sent("getNearbyReviews").isEmpty)
    }

    /// A slow answer for an old address must not replace the current one.
    @Test func aStaleAnswerIsIgnored() async {
        let slow = SlowTransport()
        let nearby = NearbyReviewsModel(api: .fake(slow), excluding: nil)
        async let first: Void = nearby.load(address: "Gamla gatan 1")
        await slow.waitForRequests(1)
        await nearby.load(address: address)
        slow.release(.json(Fixture.json(["addressKnown": false, "radiiMetres": [250], "summary": NSNull()])), index: 0)
        await first
        #expect(nearby.state.isResults)
    }
}

extension NearbyReviewsModel.State {
    var isResults: Bool {
        if case .results = self { return true }
        return false
    }
}
