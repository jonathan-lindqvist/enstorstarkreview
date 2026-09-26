import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
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
                ConditionalHeaderMiddleware(),
                ProblemMiddleware(tokens: tokens)
            ]
        )
    }

    /// The bearer token for signed-in requests, or nil in reader mode.
    public var token: String? {
        get { tokens.token }
        set { tokens.token = newValue }
    }

    /// Called (on any thread) when the server rejects the token. The token is already cleared.
    public func setUnauthorizedHandler(_ handler: (@Sendable () -> Void)?) {
        tokens.setUnauthorizedHandler(handler)
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

    // MARK: Images

    /// Downloads a review photo. Sends the token, because photos of drafts need it.
    /// Published photos are immutable, so `URLCache` serves them after the first download.
    public func imageData(path: String) async throws -> Data {
        guard let url = url(forPath: path) else {
            throw APIError.invalidResponse("Invalid image path: \(path)")
        }
        var request = URLRequest(url: url)
        let token = tokens.token
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.from(error)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401, let token {
            tokens.expire(sentToken: token)
        }
        guard status == 200 else {
            throw APIError.invalidResponse("Image request failed with status \(status)")
        }
        return data
    }

    // MARK: Sessions

    public struct SignedIn: Sendable {
        public var username: String
        public var token: String
        public var expiresAt: Date
    }

    /// Signs in. The caller stores the token and sets `token`.
    public func signIn(username: String, password: String) async throws -> SignedIn {
        try await call {
            let body = Components.Schemas.SessionCreateRequest(username: username, password: password)
            switch try await client.createSession(body: .json(body)) {
            case .created(let created):
                let session = try created.body.json
                return SignedIn(
                    username: session.value1.user.username,
                    token: session.value2.token,
                    expiresAt: session.value1.expiresAt
                )
            case let other: throw unexpected(other)
            }
        }
    }

    /// Checks the token. Throws `APIError.problem` with status 401 when it is not valid.
    public func currentUsername() async throws -> String {
        try await call {
            switch try await client.getCurrentSession() {
            case .ok(let ok): return try ok.body.json.user.username
            case let other: throw unexpected(other)
            }
        }
    }

    /// Invalidates the token on the server.
    public func signOut() async throws {
        try await call {
            switch try await client.deleteCurrentSession() {
            case .noContent: return
            case let other: throw unexpected(other)
            }
        }
    }

    // MARK: Reviewer endpoints

    /// Reviewer usernames for the author picker, sorted with Swedish collation.
    public func users() async throws -> [String] {
        try await call {
            switch try await client.listUsers() {
            case .ok(let ok): return try ok.body.json.users.map(\.username)
            case let other: throw unexpected(other)
            }
        }
    }

    /// Creates a draft. New reviews are always drafts.
    public func createReview(_ fields: ReviewFields, image: ImageUpload) async throws -> Tagged<Review> {
        try await call {
            let body = Components.Schemas.ReviewCreateRequest(value1: fields, value2: .init(image: image))
            switch try await client.createReview(body: .json(body)) {
            case .created(let created): return Tagged(value: try created.body.json, eTag: created.headers.eTag)
            case let other: throw unexpected(other)
            }
        }
    }

    /// Replaces the editable fields. `eTag` is the `ETag` from the last read (sent as
    /// `If-Match`). A nil `image` keeps the current photo. The slug may change.
    public func updateReview(slug: String, eTag: String, _ fields: ReviewFields, image: ImageUpload?) async throws -> Tagged<Review> {
        try await call {
            let body = Components.Schemas.ReviewUpdateRequest(value1: fields, value2: .init(image: image))
            switch try await client.updateReview(path: .init(slug: slug), headers: .init(ifMatch: eTag), body: .json(body)) {
            case .ok(let ok): return Tagged(value: try ok.body.json, eTag: ok.headers.eTag)
            case let other: throw unexpected(other)
            }
        }
    }

    /// Publishes a draft. Publication is one-way.
    public func publish(slug: String) async throws -> Tagged<Review> {
        try await call {
            switch try await client.publishReview(path: .init(slug: slug)) {
            case .ok(let ok): return Tagged(value: try ok.body.json, eTag: ok.headers.eTag)
            case let other: throw unexpected(other)
            }
        }
    }

    /// Asks the server to geocode at most one published address. Returns the updated map,
    /// or nil when nothing was resolved.
    public func resolveNextMapMarker() async throws -> ReviewMap? {
        try await call {
            switch try await client.resolveNextMapMarker() {
            case .ok(let ok): return try ok.body.json
            case .noContent: return nil
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
