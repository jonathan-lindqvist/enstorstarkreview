import Foundation
import Observation
import SkipFuse

/// One review and its `ETag`. An edit can change the slug, so the slug is state too.
@MainActor @Observable public final class ReviewDetailModel {
    public private(set) var slug: String
    public private(set) var review: Review?
    /// The `ETag` from the last read. Nil until the review is loaded from the server.
    public private(set) var eTag: String?
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?

    private let api: APIClient
    private var generation = 0

    init(api: APIClient, slug: String, preview: Review?) {
        self.api = api
        self.slug = slug
        self.review = preview
    }

    public func load() async {
        generation += 1
        let current = generation
        isLoading = true
        defer {
            if current == generation { isLoading = false }
        }
        do {
            let result = try await api.review(slug: slug)
            guard current == generation else { return }
            apply(result)
        } catch APIError.cancelled {
            // The view went away.
        } catch {
            guard current == generation else { return }
            logger.error("Could not load review \(self.slug): \(error)")
            errorMessage = error.localizedDescription
        }
    }

    /// Uses the response of a write request (edit or publication).
    public func replace(with result: Tagged<Review>) {
        generation += 1
        isLoading = false
        apply(result)
    }

    private func apply(_ result: Tagged<Review>) {
        review = result.value
        eTag = result.eTag
        slug = result.value.slug
        errorMessage = nil
    }
}
