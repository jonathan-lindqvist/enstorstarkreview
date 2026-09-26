import Foundation
import Observation
import SkipFuse

/// Loads one value from the API and keeps the last value, the loading flag, and the last error.
///
/// A failed reload keeps the old value, so a screen does not go blank on a network error.
@MainActor @Observable public final class Loader<Value: Sendable> {
    public private(set) var value: Value?
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?

    private let fetch: @Sendable () async throws -> Value

    public init(initialValue: Value? = nil, fetch: @escaping @Sendable () async throws -> Value) {
        self.value = initialValue
        self.fetch = fetch
    }

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            value = try await fetch()
            errorMessage = nil
        } catch APIError.cancelled {
            // The view went away or a newer load replaced this one.
        } catch {
            logger.error("Load failed: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    /// Loads only when there is no value yet.
    public func loadIfNeeded() async {
        if value == nil && !isLoading {
            await load()
        }
    }
}
