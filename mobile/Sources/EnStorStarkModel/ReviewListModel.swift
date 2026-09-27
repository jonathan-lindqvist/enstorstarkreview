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
    private var generation = 0

    public init(api: APIClient) {
        self.api = api
    }

    /// The API accepts at most 80 characters.
    public static let maxSearchLength = 80

    public struct SortOption: Hashable, Sendable {
        public let sort: ReviewSort
        public let label: String
    }

    public static let sortOptions: [SortOption] = [
        SortOption(sort: .latest, label: "Senaste"),
        SortOption(sort: .oldest, label: "Äldsta"),
        SortOption(sort: .score, label: "Högst betyg")
    ]

    public func load() async {
        if search.count > Self.maxSearchLength {
            search = String(search.prefix(Self.maxSearchLength))
        }
        // Only the most recently started load may write its result. An older request that
        // finishes later (for example one without the new token) must not replace it.
        generation += 1
        let current = generation
        isLoading = true
        defer {
            if current == generation { isLoading = false }
        }
        do {
            let result = try await api.reviews(search: search, sort: sort)
            guard current == generation else { return }
            reviews = result
            errorMessage = nil
        } catch APIError.cancelled {
            // A newer load replaced this one.
        } catch {
            guard current == generation else { return }
            logger.error("Could not load reviews: \(error)")
            errorMessage = error.localizedDescription
        }
    }
}
