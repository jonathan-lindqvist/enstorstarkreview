import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import OpenAPIRuntime

/// An `application/problem+json` response from the API.
///
/// `code` is a string (not the generated enum) so that a new server code does not
/// make the whole error undecodable. Use `knownCode` to branch.
public struct APIProblem: Error, Decodable, Sendable, Hashable {
    public struct FieldError: Decodable, Sendable, Hashable {
        /// JSON Pointer into the request body, for example `/beer/priceKr`.
        public var pointer: String
        /// Swedish message to show next to the field.
        public var detail: String
    }

    public var status: Int
    public var code: String
    public var title: String
    /// Swedish message that the app can show.
    public var detail: String
    public var errors: [FieldError]?

    public var knownCode: ProblemCode? { ProblemCode(rawValue: code) }

    /// The field messages keyed by JSON Pointer.
    public var fieldErrors: [String: String] {
        var result: [String: String] = [:]
        for error in errors ?? [] where result[error.pointer] == nil {
            result[error.pointer] = error.detail
        }
        return result
    }
}

/// The errors that `APIClient` throws.
public enum APIError: Error, LocalizedError, Sendable {
    /// The server answered with problem details.
    case problem(APIProblem)
    /// The server could not be reached.
    case transport(String)
    /// The server answered with a status or body that the app does not expect.
    case invalidResponse(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .problem(let problem):
            return problem.detail
        case .transport:
            return "Kunde inte nå servern. Kontrollera anslutningen och försök igen."
        case .invalidResponse:
            return "Servern skickade ett oväntat svar."
        case .cancelled:
            return "Förfrågan avbröts."
        }
    }

    public var problem: APIProblem? {
        if case .problem(let problem) = self { return problem }
        return nil
    }

    /// Converts any error from the generated client into an `APIError`.
    static func from(_ error: any Error) -> APIError {
        switch error {
        case let error as APIError:
            return error
        case let error as ClientError:
            return from(error.underlyingError)
        case let problem as APIProblem:
            return .problem(problem)
        case is CancellationError:
            return .cancelled
        case let error as URLError:
            return error.code == .cancelled ? .cancelled : .transport(error.localizedDescription)
        case is DecodingError:
            return .invalidResponse(String(describing: error))
        default:
            return .transport(String(describing: error))
        }
    }
}
