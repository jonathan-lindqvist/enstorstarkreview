import Foundation
import HTTPTypes
import Testing
@testable import EnStorStarkModel

@MainActor @Suite struct DeleteReviewTests {
    let transport = FakeTransport()

    func editForm() async throws -> ReviewFormModel {
        transport.respond(to: "getReviewMetadata", with: .json(Fixture.data("review-metadata")))
        transport.respond(to: "getReview", with: .json(Fixture.data("review"), eTag: "\"v2-abc\""))
        let api = APIClient.fake(transport)
        return ReviewFormModel(api: api, metadata: try await api.reviewMetadata(), currentUser: "test",
                               editing: try await api.review(slug: "majornas-bryggeri"))
    }

    /// The server only deletes the version the reviewer saw, so the strong tag goes out unchanged.
    @Test func deleteSendsTheReadETagAsIfMatch() async throws {
        let form = try await editForm()
        transport.respond(to: "deleteReview", with: FakeResponse(status: .noContent))
        #expect(await form.delete() == true)
        let request = try #require(transport.sent("deleteReview").first?.request)
        #expect(request.method == .delete)
        // The server URL holds /api/v1.
        #expect(request.path == "/reviews/majornas-bryggeri")
        #expect(request.headerFields[.ifMatch] == "\"v2-abc\"")
        #expect(form.errorMessage == nil)
    }

    /// 412: someone saved in between, nothing was deleted. The form offers the new version.
    @Test func aChangedReviewIsNotDeletedAndOffersAReload() async throws {
        let form = try await editForm()
        transport.respond(to: "deleteReview", with: .problem(status: .preconditionFailed, code: "precondition_failed",
                                                             detail: "Recensionen har ändrats."))
        #expect(await form.delete() == false)
        #expect(form.needsReload)
        #expect(form.errorMessage == "Recensionen har ändrats.")
    }

    /// 409: a save raced the delete.
    @Test func aConcurrentSaveAlsoOffersAReload() async throws {
        let form = try await editForm()
        transport.respond(to: "deleteReview", with: .problem(status: .conflict, code: "concurrent_update"))
        #expect(await form.delete() == false)
        #expect(form.needsReload)
    }

    /// 404: already deleted by someone else. The review is gone either way.
    @Test func anAlreadyDeletedReviewCountsAsGone() async throws {
        let form = try await editForm()
        transport.respond(to: "deleteReview", with: .problem(status: .notFound, code: "not_found"))
        #expect(await form.delete() == true)
    }

    @Test func anExpiredSessionShowsTheErrorAndKeepsTheReview() async throws {
        let form = try await editForm()
        transport.respond(to: "deleteReview", with: .problem(status: .unauthorized, code: "unauthorized",
                                                             detail: "Logga in igen."))
        #expect(await form.delete() == false)
        #expect(form.needsReload == false)
        #expect(form.errorMessage == "Logga in igen.")
    }

    /// A new review has nothing on the server to delete.
    @Test func aNewReviewCannotBeDeleted() async throws {
        transport.respond(to: "getReviewMetadata", with: .json(Fixture.data("review-metadata")))
        let api = APIClient.fake(transport)
        let form = ReviewFormModel(api: api, metadata: try await api.reviewMetadata(), currentUser: "test", editing: nil)
        #expect(form.canDelete == false)
        #expect(await form.delete() == false)
        #expect(transport.sent("deleteReview").isEmpty)
    }

    /// The feed drops the review at once, before its reload finishes.
    @Test func theListDropsADeletedReview() async throws {
        let review = Fixture.object("review")
        transport.respond(to: "listReviews", with: .json(Fixture.json(["reviews": [review]])))
        let list = ReviewListModel(api: .fake(transport))
        await list.load()
        #expect(list.reviews.count == 1)
        list.remove(slug: "majornas-bryggeri")
        #expect(list.reviews.isEmpty)
    }
}
