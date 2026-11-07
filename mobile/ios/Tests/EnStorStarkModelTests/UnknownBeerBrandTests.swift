import Foundation
import Testing
@testable import EnStorStarkModel

/// The brand is optional, like the web's "Okänd öl": unknown is the default and is sent as null.
@MainActor @Suite struct UnknownBeerBrandTests {
    let transport = FakeTransport()
    var api: APIClient { .fake(transport) }

    func metadata() async throws -> ReviewMetadata {
        transport.respond(to: "getReviewMetadata", with: .json(Fixture.data("review-metadata")))
        return try await api.reviewMetadata()
    }

    func editForm(brand: Any) async throws -> ReviewFormModel {
        var review = Fixture.object("review")
        var beer = try #require(review["beer"] as? [String: Any])
        beer["brand"] = brand
        review["beer"] = beer
        let metadata = try await metadata()
        transport.respond(to: "getReview", with: .json(Fixture.json(review), eTag: "\"v2-abc\""))
        let tagged = try await api.review(slug: "majornas-bryggeri")
        return ReviewFormModel(api: api, metadata: metadata, currentUser: "test", editing: tagged)
    }

    func savedBeer(_ form: ReviewFormModel) async throws -> [String: Any] {
        transport.respond(to: "updateReview", with: .json(Fixture.data("review"), eTag: "\"v2-def\""))
        _ = await form.submit()
        return try #require(transport.sent("updateReview").first?.json?["beer"] as? [String: Any])
    }

    @Test func aNewReviewStartsWithAnUnknownBrand() async throws {
        let form = ReviewFormModel(api: api, metadata: try await metadata(), currentUser: "test", editing: nil)
        #expect(form.draft.brandChoice == ReviewFormModel.unknownBrand)
        #expect(form.brand == nil)
        form.draft.priceKr = 65
        #expect(form.validate(.beer))
        #expect(form.error(for: "/beer/brand") == nil)
    }

    @Test func aReviewWithoutABrandIsEditedAsUnknown() async throws {
        let form = try await editForm(brand: NSNull())
        #expect(form.draft.brandChoice == ReviewFormModel.unknownBrand)
        #expect(form.brand == nil)
        #expect(form.validate(.beer))
    }

    /// Omitting `brand` is a 422, so an unknown brand must be sent as null, also when it clears one.
    @Test func savingAnUnknownBrandSendsNull() async throws {
        let form = try await editForm(brand: "Falcon Export")
        #expect(form.draft.brandChoice == "Falcon Export")
        form.draft.brandChoice = ReviewFormModel.unknownBrand
        let beer = try await savedBeer(form)
        #expect(beer.keys.contains("brand"))
        #expect(beer["brand"] is NSNull)
        #expect(beer["priceKr"] as? Int == 69)
    }

    @Test func savingAListedBrandSendsItsName() async throws {
        let form = try await editForm(brand: NSNull())
        form.draft.brandChoice = "Fat21"
        let beer = try await savedBeer(form)
        #expect(beer["brand"] as? String == "Fat21")
    }

    @Test func anotherBrandNeedsAName() async throws {
        let form = try await editForm(brand: NSNull())
        form.draft.brandChoice = ReviewFormModel.otherBrand
        form.draft.customBrand = "  "
        #expect(form.validate(.beer) == false)
        #expect(form.error(for: "/beer/brand") == "Skriv märkets namn.")
    }

    /// Cards name an unknown beer "Stor stark"; the detail page leaves it out.
    @Test func cardsCallAnUnknownBrandStorStark() {
        #expect(Formatting.beerBrand(nil) == "Stor stark")
        #expect(Formatting.beerBrand("  ") == "Stor stark")
        #expect(Formatting.beerBrand(" Falcon Export ") == "Falcon Export")
        #expect(Formatting.knownBeerBrand(nil) == nil)
        #expect(Formatting.knownBeerBrand("  ") == nil)
        #expect(Formatting.knownBeerBrand(" Falcon Export ") == "Falcon Export")
    }
}
