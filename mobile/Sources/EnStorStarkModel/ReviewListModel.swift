import Foundation
import Observation
import Observation

/// State for the review list: the loaded reviews, the query, and the last error.
@MainActor @Observable public final class ReviewListModel {
    public private(set) var reviews: [Review] = []
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?
    public var search = ""
    public var sort: ReviewSort = .latest
    /// Selected bar attributes. Like the web, a review matches when it has any of them;
    /// an empty selection matches all reviews.
    public var attributeFilter: Set<BarAttributeKey> = []
    /// "Närmast": the newest first from the API, ordered by distance on the device.
    public var nearest = false
    /// The device location, in memory only. Nil until known or when access is off.
    public var origin: GeoPoint?
    /// Saved positions by slug, from the map markers.
    public var positions: [String: GeoPoint] = [:]

    /// Chooses an API sort and leaves "Närmast".
    public func choose(_ sort: ReviewSort) {
        nearest = false
        self.sort = sort
    }

    /// Kilometres from the device, when both positions are known.
    public func distanceKm(for slug: String) -> Double? {
        guard let origin, let position = positions[slug] else { return nil }
        return ReviewDistance.kilometres(from: origin, to: position)
    }

    /// The API sort to load: "Närmast" starts from the newest.
    var loadedSort: ReviewSort { nearest ? .latest : sort }

    /// The loaded reviews that match the attribute filter.
    public var visibleReviews: [Review] {
        let filtered = attributeFilter.isEmpty
            ? reviews
            : reviews.filter { review in review.attributes.contains { attributeFilter.contains($0) } }
        guard nearest, origin != nil else { return filtered }
        return ReviewDistance.sorted(filtered) { distanceKm(for: $0.slug) }
    }

    private let api: APIClient
    private var generation = 0

    public init(api: APIClient) {
        self.api = api
    }

    /// Drops a deleted review without waiting for the next load.
    public func remove(slug: String) {
        reviews.removeAll { $0.slug == slug }
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
            let result = try await api.reviews(search: search, sort: loadedSort)
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
