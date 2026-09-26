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

    private var generation = 0
    private let fetch: @Sendable () async throws -> Value

    public init(initialValue: Value? = nil, fetch: @escaping @Sendable () async throws -> Value) {
        self.value = initialValue
        self.fetch = fetch
    }

    public func load() async {
        // Only the most recently started load may write its result. An older request that
        // finishes later (for example one without the new token) must not replace it.
        generation += 1
        let current = generation
        isLoading = true
        defer {
            if current == generation { isLoading = false }
        }
        do {
            let result = try await fetch()
            guard current == generation else { return }
            value = result
            errorMessage = nil
        } catch APIError.cancelled {
            // The view went away or a newer load replaced this one.
        } catch {
            guard current == generation else { return }
            logger.error("Load failed: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    /// Replaces the value, for example with the response of a write request.
    public func replace(with value: Value) {
        generation += 1
        self.value = value
        isLoading = false
        errorMessage = nil
    }

    /// Loads only when there is no value yet.
    public func loadIfNeeded() async {
        if value == nil && !isLoading {
            await load()
        }
    }
}
