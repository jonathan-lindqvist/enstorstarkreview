import Foundation
import HTTPTypes
import OpenAPIRuntime
import Synchronization
@testable import EnStorStarkModel

/// JSON from `Fixtures/`, captured from the local API.
enum Fixture {
    static func data(_ name: String) -> Data {
        let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")!
        return try! Data(contentsOf: url)
    }

    /// The fixture as a mutable JSON object, to change single fields.
    static func object(_ name: String) -> [String: Any] {
        try! JSONSerialization.jsonObject(with: data(name)) as! [String: Any]
    }

    static func json(_ object: Any) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }
}

/// A recorded request.
struct SentRequest: Sendable {
    var operationID: String
    var request: HTTPRequest
    var body: Data?

    var json: [String: Any]? {
        body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    }
}

/// A canned response.
struct FakeResponse: Sendable {
    var status: HTTPResponse.Status = .ok
    var headers: HTTPFields = [:]
    var body: Data?

    static func json(_ data: Data, status: HTTPResponse.Status = .ok, eTag: String? = nil) -> FakeResponse {
        var headers: HTTPFields = [.contentType: "application/json"]
        if let eTag { headers[.eTag] = eTag }
        return FakeResponse(status: status, headers: headers, body: data)
    }

    static func problem(status: HTTPResponse.Status, code: String, detail: String = "Fel") -> FakeResponse {
        let body = Fixture.json(["type": "about:blank", "title": "Fel", "status": status.code, "code": code, "detail": detail])
        return FakeResponse(status: status, headers: [.contentType: "application/problem+json"], body: body)
    }
}

/// A transport that answers by operation ID and records every request.
final class FakeTransport: ClientTransport {
    private let state = Mutex<(responses: [String: FakeResponse], sent: [SentRequest])>(([:], []))

    func respond(to operationID: String, with response: FakeResponse) {
        state.withLock { $0.responses[operationID] = response }
    }

    var sent: [SentRequest] { state.withLock { $0.sent } }

    func sent(_ operationID: String) -> [SentRequest] { sent.filter { $0.operationID == operationID } }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var data: Data?
        if let body { data = try await Data(collecting: body, upTo: .max) }
        let response = state.withLock { state -> FakeResponse? in
            state.sent.append(SentRequest(operationID: operationID, request: request, body: data))
            return state.responses[operationID]
        }
        guard let response else {
            return (HTTPResponse(status: .notFound), nil)
        }
        return (HTTPResponse(status: response.status, headerFields: response.headers), response.body.map(HTTPBody.init))
    }
}

extension APIClient {
    static func fake(_ transport: FakeTransport) -> APIClient {
        APIClient(serverOrigin: URL(string: "https://test.invalid")!, transport: transport)
    }
}
