import Foundation
import Observation
import SkipFuse

/// State for the "tipsa om en bar" form.
@MainActor @Observable public final class ReviewRequestModel {
    public var barName = ""
    public var location = ""
    public var motivation = ""

    public private(set) var isSubmitting = false
    /// Field messages keyed by JSON Pointer (`/barName`, `/location`, `/motivation`).
    public private(set) var fieldErrors: [String: String] = [:]
    public private(set) var errorMessage: String?
    public private(set) var successMessage: String?

    private let api: APIClient

    public init(api: APIClient) {
        self.api = api
    }

    public var canSubmit: Bool {
        !isSubmitting
            && !barName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public func submit() async {
        guard canSubmit else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        errorMessage = nil
        successMessage = nil
        do {
            let message = try await api.submitReviewRequest(
                barName: barName.trimmingCharacters(in: .whitespacesAndNewlines),
                location: location.trimmingCharacters(in: .whitespacesAndNewlines),
                motivation: motivation.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            fieldErrors = [:]
            barName = ""
            location = ""
            motivation = ""
            successMessage = message
        } catch let error as APIError {
            fieldErrors = error.problem?.fieldErrors ?? [:]
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
