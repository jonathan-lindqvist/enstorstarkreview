import Foundation
import Observation
import SkipFuse

/// The app-wide state. One instance lives for the whole app session.
@MainActor @Observable public final class AppModel {
    public let api: APIClient
    public let reviewList: ReviewListModel
    public let metadata: Loader<ReviewMetadata>
    public let statistics: Loader<ReviewStatistics>
    public let map: Loader<ReviewMap>
    public let reviewRequest: ReviewRequestModel

    public init(api: APIClient = APIClient()) {
        self.api = api
        self.reviewList = ReviewListModel(api: api)
        self.metadata = Loader { try await api.reviewMetadata() }
        self.statistics = Loader { try await api.statistics() }
        self.map = Loader { try await api.map() }
        self.reviewRequest = ReviewRequestModel(api: api)
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
