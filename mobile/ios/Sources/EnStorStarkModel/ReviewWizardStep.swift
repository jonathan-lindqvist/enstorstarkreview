import Foundation

/// The steps of the review wizard, in order.
public enum ReviewWizardStep: Int, CaseIterable, Codable, Sendable, Hashable {
    case photo, bar, beer, ratings, text, authors

    public var title: String {
        switch self {
        case .photo: return "Bild"
        case .bar: return "Bar"
        case .beer: return "Stor stark"
        case .ratings: return "Betyg"
        case .text: return "Helhet & text"
        case .authors: return "Vem"
        }
    }

    public var next: ReviewWizardStep? { ReviewWizardStep(rawValue: rawValue + 1) }
    public var previous: ReviewWizardStep? { ReviewWizardStep(rawValue: rawValue - 1) }

    /// The step that shows the field of a problem pointer. Nil for pointers that no step shows.
    public static func step(for pointer: String) -> ReviewWizardStep? {
        if pointer.hasPrefix("/image") { return .photo }
        if pointer == "/title" || pointer == "/location" || pointer == "/slug" || pointer.hasPrefix("/attributes") {
            return .bar
        }
        if pointer.hasPrefix("/beer") { return .beer }
        if pointer.hasPrefix("/ratings") { return .ratings }
        if pointer == "/overallRating" || pointer == "/description" { return .text }
        if pointer.hasPrefix("/authors") { return .authors }
        return nil
    }
}
