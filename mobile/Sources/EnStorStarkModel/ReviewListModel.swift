import Foundation
import Observation
import SkipFuse

/// State for the review list: the loaded reviews, the query, and the last error.
@MainActor @Observable public final class ReviewListModel {
    public private(set) var reviews: [Review] = []
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?
    public var search = ""
    public var sort: ReviewSort = .latest

    private let api: APIClient

    public init(api: APIClient) {
        self.api = api
    }

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            reviews = try await api.reviews(search: search, sort: sort)
            errorMessage = nil
        } catch APIError.cancelled {
            // A newer load replaced this one.
        } catch {
            logger.error("Could not load reviews: \(error)")
            errorMessage = error.localizedDescription
        }
    }
}
