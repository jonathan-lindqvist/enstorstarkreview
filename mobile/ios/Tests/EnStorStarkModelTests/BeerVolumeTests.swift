import Foundation
import Testing
@testable import EnStorStarkModel

@MainActor @Suite struct BeerVolumeTests {
    let transport = FakeTransport()
    var api: APIClient { .fake(transport) }

    /// A form for the fixture review (50 cl), loaded through the API like the app does.
    func editForm(review: [String: Any] = Fixture.object("review")) async throws -> ReviewFormModel {
        transport.respond(to: "getReviewMetadata", with: .json(Fixture.data("review-metadata")))
        transport.respond(to: "getReview", with: .json(Fixture.json(review), eTag: "\"v2-abc\""))
        let api = self.api
        let metadata = try await api.reviewMetadata()
        let tagged = try await api.review(slug: "majornas-bryggeri")
        return ReviewFormModel(api: api, metadata: metadata, currentUser: "test", editing: tagged)
    }

    @Test func anEditStartsWithTheSavedVolume() async throws {
        let form = try await editForm()
        #expect(form.draft.volumeCl == 50)
    }

    @Test func theQuickPicksAreTheCommonSizes() {
        #expect(ReviewFormModel.volumeQuickPicks == [33, 40, 50, 60])
    }

    @Test(arguments: [0, 201])
    func aVolumeOutsideTheLimitsIsAFieldError(volume: Int) async throws {
        let form = try await editForm()
        form.draft.volumeCl = volume
        #expect(form.validate(.beer) == false)
        #expect(form.error(for: "/beer/volumeCl") == "Ange volymen i hela centiliter, mellan 1 och 200 cl.")
    }

    @Test func savingSendsTheChosenVolume() async throws {
        let form = try await editForm()
        form.draft.volumeCl = 40
        transport.respond(to: "updateReview", with: .json(Fixture.data("review"), eTag: "\"v2-def\""))
        _ = await form.submit()
        let beer = try #require(transport.sent("updateReview").first?.json?["beer"] as? [String: Any])
        #expect(beer["volumeCl"] as? Int == 40)
    }

    /// Omitting `volumeCl` keeps the stored value, so a cleared field must send null.
    @Test func savingWithoutAVolumeClearsIt() async throws {
        let form = try await editForm()
        form.draft.volumeCl = nil
        transport.respond(to: "updateReview", with: .json(Fixture.data("review"), eTag: "\"v2-def\""))
        _ = await form.submit()
        let beer = try #require(transport.sent("updateReview").first?.json?["beer"] as? [String: Any])
        #expect(beer.keys.contains("volumeCl"))
        #expect(beer["volumeCl"] is NSNull)
        // The rewrite keeps the rest of the request.
        let json = try #require(transport.sent("updateReview").first?.json)
        #expect(json["title"] as? String == "Majornas bryggeri")
        #expect(beer["priceKr"] as? Int == 69)
        #expect(json["imageFocus"] is [String: Any])
    }

    @Test func clPerKrIsVolumeDividedByPriceWithTwoDecimals() {
        #expect(Formatting.clPerKr(volumeCl: 40, priceKr: 74, isHappyHour: false) == "0,54 cl/kr")
        #expect(Formatting.clPerKr(volumeCl: 50, priceKr: 38, isHappyHour: false) == "1,32 cl/kr")
    }

    /// The statistics leave happy hour prices out of cl/kr, so the detail page does too.
    @Test func thereIsNoClPerKrWithoutVolumePriceOrForHappyHour() {
        #expect(Formatting.clPerKr(volumeCl: nil, priceKr: 74, isHappyHour: false) == nil)
        #expect(Formatting.clPerKr(volumeCl: 40, priceKr: nil, isHappyHour: false) == nil)
        #expect(Formatting.clPerKr(volumeCl: 40, priceKr: 74, isHappyHour: true) == nil)
    }
}
