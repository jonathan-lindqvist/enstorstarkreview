import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Holds the bearer token. The API ignores cookies, so this is the only credential.
final class TokenBox: @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?
    private var unauthorizedHandler: (@Sendable () -> Void)?

    var token: String? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return value
        }
        set {
            lock.lock()
            defer { lock.unlock() }
            value = newValue
        }
    }

    func setUnauthorizedHandler(_ handler: (@Sendable () -> Void)?) {
        lock.lock()
        defer { lock.unlock() }
        unauthorizedHandler = handler
    }

    /// Clears the token after a 401, but only when it is still the token that the failed
    /// request sent. A late 401 from an old session must not sign out a new one.
    func expire(sentToken: String) {
        lock.lock()
        guard value == sentToken else {
            lock.unlock()
            return
        }
        value = nil
        let handler = unauthorizedHandler
        lock.unlock()
        handler?()
    }
}

/// Adds `Authorization: Bearer <token>` when the app has a token.
struct AuthenticationMiddleware: ClientMiddleware {
    let tokens: TokenBox

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if let token = tokens.token {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        return try await next(request, body, baseURL)
    }
}

/// Converts every `application/problem+json` response into a thrown `APIProblem`, so the
/// generated output enums only reach the app for success responses.
///
/// A 401 on a request that sent a token means that the token is invalid or expired:
/// the middleware then expires the token, and the app falls back to reader mode.
struct ProblemMiddleware: ClientMiddleware {
    static let maxProblemBytes = 64 * 1024

    let tokens: TokenBox

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await next(request, body, baseURL)

        if response.status == .unauthorized, let authorization = request.headerFields[.authorization] {
            tokens.expire(sentToken: String(authorization.dropFirst("Bearer ".count)))
        }

        guard let contentType = response.headerFields[.contentType],
              contentType.lowercased().hasPrefix("application/problem+json") else {
            return (response, responseBody)
        }

        var data = Data()
        if let responseBody {
            data = try await Data(collecting: responseBody, upTo: Self.maxProblemBytes)
        }
        if let problem = try? JSONDecoder().decode(APIProblem.self, from: data) {
            throw problem
        }
        throw APIError.invalidResponse("Undecodable problem response with status \(response.status.code)")
    }
}

/// Sends `If-Match` and `If-None-Match` as raw entity tags.
///
/// The generated client writes header parameters in URI "simple" style, so the quotes of an
/// entity tag (`"v1-…"`) arrive as `%22v1-…%22` and never match. HTTP conditional headers are
/// not URI-encoded, so this middleware decodes them before sending.
struct ConditionalHeaderMiddleware: ClientMiddleware {
    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        for name in [HTTPField.Name.ifMatch, .ifNoneMatch] {
            if let value = request.headerFields[name], let decoded = value.removingPercentEncoding {
                request.headerFields[name] = decoded
            }
        }
        return try await next(request, body, baseURL)
    }
}
