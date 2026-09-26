import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Observation
import SkipFuse

/// The app-wide state. One instance lives for the whole app session.
@MainActor @Observable public final class AppModel {
    public let api: APIClient
    public let session: SessionModel
    public let reviewList: ReviewListModel
    public let metadata: Loader<ReviewMetadata>
    public let statistics: Loader<ReviewStatistics>
    public let map: Loader<ReviewMap>
    public let reviewRequest: ReviewRequestModel

    public init(api: APIClient = APIClient()) {
        self.api = api
        self.session = SessionModel(api: api)
        self.reviewList = ReviewListModel(api: api)
        self.metadata = Loader { try await api.reviewMetadata() }
        self.statistics = Loader { try await api.statistics() }
        self.map = Loader { try await api.map() }
        self.reviewRequest = ReviewRequestModel(api: api)
        session.onChange = { [weak self] in self?.sessionDidChange() }
    }

    /// Drafts appear or disappear, so reload the list. Remove cached responses, so no draft
    /// data stays on the device after a sign-out.
    func sessionDidChange() {
        URLCache.shared.removeAllCachedResponses()
        Task { await reviewList.load() }
    }

    /// Publishes a draft and updates the list. Statistics and the map include the review
    /// on their next load.
    public func publish(slug: String) async throws -> Tagged<Review> {
        let published = try await api.publish(slug: slug)
        Task {
            await reviewList.load()
            await statistics.load()
            await map.load()
        }
        return published
    }

    /// Signed-in reviewers resolve at most one missing map address each time the map loads.
    public func resolveNextMapMarker() async {
        guard session.isSignedIn else { return }
        do {
            if let updated = try await api.resolveNextMapMarker() {
                map.replace(with: updated)
            }
        } catch {
            logger.info("Geocoding did not complete: \(error)")
        }
    }

    /// The rating aspects in display order, with Swedish labels. Empty until metadata loads.
    public var ratingMetrics: [RatingMetric] {
        metadata.value?.ratingMetrics ?? []
    }

    public func reviewLoader(slug: String, preview: Review?) -> Loader<Tagged<Review>> {
        let api = api
        return Loader(initialValue: preview.map { Tagged(value: $0, eTag: nil) }) {
            try await api.review(slug: slug)
        }
    }

    public func historyLoader(slug: String) -> Loader<ReviewHistory> {
        let api = api
        return Loader { try await api.reviewHistory(slug: slug) }
    }
}
