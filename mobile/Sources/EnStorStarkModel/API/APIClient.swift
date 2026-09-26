import Foundation
import EnStorStarkAPI
import OpenAPIRuntime
import OpenAPIURLSession

/// The app's entry point to the JSON API (`/api/v1`).
///
/// It wraps the generated `Client`: it adds the bearer token, converts problem responses
/// into `APIError.problem`, and returns plain values. All methods throw `APIError`.
public final class APIClient: Sendable {
    public let serverOrigin: URL
    private let tokens: TokenBox
    private let client: Client

    public init(serverOrigin: URL = AppConfiguration.serverOrigin) {
        let tokens = TokenBox()
        self.serverOrigin = serverOrigin
        self.tokens = tokens
        self.client = Client(
            serverURL: serverOrigin.appendingPathComponent("api/v1"),
            // The server writes dates with `Date.toISOString()`, which always has milliseconds.
            configuration: Configuration(dateTranscoder: .iso8601WithFractionalSeconds),
            transport: URLSessionTransport(),
            middlewares: [
                AuthenticationMiddleware(tokens: tokens),
                ProblemMiddleware(onUnauthorized: { [tokens] in tokens.token = nil })
            ]
        )
    }

    /// The bearer token for signed-in requests, or nil in reader mode.
    public var token: String? {
        get { tokens.token }
        set { tokens.token = newValue }
    }

    /// Resolves a path from the API (for example `review.image.url`) against the server origin.
    public func url(forPath path: String) -> URL? {
        URL(string: path, relativeTo: serverOrigin)?.absoluteURL
    }

    // MARK: Reader endpoints

    public func reviewMetadata() async throws -> ReviewMetadata {
        try await call {
            switch try await client.getReviewMetadata() {
            case .ok(let ok): return try ok.body.json
            case let other: throw unexpected(other)
            }
        }
    }

    public func reviews(search: String? = nil, sort: ReviewSort = .latest) async throws -> [Review] {
        let search = search?.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await call {
            let query = Operations.ListReviews.Input.Query(
                search: search?.isEmpty == false ? search : nil,
                sort: sort
            )
            switch try await client.listReviews(query: query) {
            case .ok(let ok): return try ok.body.json.reviews
            case let other: throw unexpected(other)
            }
        }
    }

    /// Returns the review and its `ETag`. Send the `ETag` as `If-Match` when you edit it.
    public func review(slug: String) async throws -> Tagged<Review> {
        try await call {
            switch try await client.getReview(path: .init(slug: slug)) {
            case .ok(let ok): return Tagged(value: try ok.body.json, eTag: ok.headers.eTag)
            case let other: throw unexpected(other)
            }
        }
    }

    public func reviewHistory(slug: String) async throws -> ReviewHistory {
        try await call {
            switch try await client.getReviewHistory(path: .init(slug: slug)) {
            case .ok(let ok): return try ok.body.json
            case let other: throw unexpected(other)
            }
        }
    }

    /// Map markers. The device location is never sent to the API.
    public func map() async throws -> ReviewMap {
        try await call {
            switch try await client.getMap() {
            case .ok(let ok): return try ok.body.json
            case let other: throw unexpected(other)
            }
        }
    }

    public func statistics() async throws -> ReviewStatistics {
        try await call {
            switch try await client.getStatistics() {
            case .ok(let ok): return try ok.body.json
            case let other: throw unexpected(other)
            }
        }
    }

    /// Sends a "tipsa om en bar" request. Returns the Swedish confirmation message.
    public func submitReviewRequest(barName: String, location: String, motivation: String?) async throws -> String {
        try await call {
            let body = Components.Schemas.ReviewRequestCreateRequest(
                barName: barName,
                location: location,
                motivation: motivation?.isEmpty == false ? motivation : nil
            )
            switch try await client.createReviewRequest(body: .json(body)) {
            case .accepted(let accepted): return try accepted.body.json.message
            case let other: throw unexpected(other)
            }
        }
    }

    // MARK: Helpers

    private func call<T>(_ operation: () async throws -> T) async throws -> T {
        do {
            return try await operation()
        } catch {
            throw APIError.from(error)
        }
    }

    private func unexpected(_ output: Any) -> APIError {
        .invalidResponse("Unexpected response: \(output)")
    }
}
