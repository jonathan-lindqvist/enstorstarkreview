import Foundation
import Observation

/// Reviewed bars near the address, for the barhop rating, like the web's review form. The centre
/// is the address's saved position on the server; the app never sends the device location.
@MainActor @Observable public final class NearbyReviewsModel {
    public struct Result: Equatable, Sendable {
        public var radiiMetres: [Int]
        /// Cumulative counts per radius, drafts included.
        public var counts: [Int]
        public var nearest: [NearbyReview]
        public var locatedCount: Int
        public var totalCount: Int
    }

    public enum State: Equatable, Sendable {
        case loading
        case results(Result)
        /// No review with this address has a saved position.
        case noPosition
        /// No other review has a known position.
        case noneLocated
        case unavailable
    }

    public private(set) var state: State = .loading

    private let api: APIClient
    private let excluding: String?
    /// The address of the current state, trimmed.
    private var address: String?
    private var generation = 0

    /// The API's limit for `address`.
    static let maxAddressLength = 300

    init(api: APIClient, excluding slug: String?) {
        self.api = api
        self.excluding = slug
    }

    /// Loads the comparison for `address`, unless it is already shown or loading.
    public func load(address: String) async {
        let address = address.trimmingCharacters(in: .whitespacesAndNewlines)
        if address == self.address, state != .unavailable { return }
        self.address = address
        generation += 1
        let current = generation
        guard !address.isEmpty, address.count <= Self.maxAddressLength else {
            state = .noPosition
            return
        }
        state = .loading
        let next: State
        do {
            let nearby = try await api.nearbyReviews(address: address, excluding: excluding)
            if let summary = nearby.summary {
                next = .results(Result(radiiMetres: nearby.radiiMetres, counts: summary.counts, nearest: summary.nearest,
                                       locatedCount: summary.locatedCount, totalCount: summary.totalCount))
            } else {
                next = nearby.addressKnown ? .noneLocated : .noPosition
            }
        } catch {
            logger.info("Nearby reviews did not load: \(error)")
            next = .unavailable
        }
        // A newer address replaced this request.
        guard current == generation else { return }
        state = next
    }

    public func retry() async {
        guard let address else { return }
        self.address = nil
        await load(address: address)
    }
}
