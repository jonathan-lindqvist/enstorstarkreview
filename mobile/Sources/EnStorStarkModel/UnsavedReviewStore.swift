import Foundation
import SkipFuse

/// A local copy of a new review that is not saved yet.
///
/// Reviewers often write at the bar, and the system can stop the app before they save. The
/// copy stays on the device only: it holds draft data, so a sign-out removes it, and another
/// user never gets it.
public struct UnsavedReview: Codable, Sendable {
    public var username: String
    public var draft: ReviewDraft
    /// The wizard step that was open (`ReviewWizardStep.rawValue`).
    public var step: Int
    public var hasImage: Bool
}

/// Keeps one `UnsavedReview` and its photo in Application Support.
public struct UnsavedReviewStore: Sendable {
    let directory: URL

    public init(directory: URL? = nil) {
        if let directory {
            self.directory = directory
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? FileManager.default.temporaryDirectory
            self.directory = base.appendingPathComponent("UnsavedReview", isDirectory: true)
        }
    }

    var reviewURL: URL { directory.appendingPathComponent("review.json") }
    var imageURL: URL { directory.appendingPathComponent("image.jpg") }

    /// The saved copy of this user, with its photo. Nil when there is none.
    public func load(username: String) -> (review: UnsavedReview, image: Data?)? {
        guard let data = try? Data(contentsOf: reviewURL),
              let review = try? JSONDecoder().decode(UnsavedReview.self, from: data),
              review.username == username else { return nil }
        let image = review.hasImage ? try? Data(contentsOf: imageURL) : nil
        return (review, image)
    }

    /// Writes the copy. Writes the photo only when `image` is not nil, because it does not
    /// change often and can be large.
    public func save(_ review: UnsavedReview, image: Data?) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            if let image {
                try image.write(to: imageURL, options: [.atomic])
            } else if !review.hasImage {
                try? FileManager.default.removeItem(at: imageURL)
            }
            try JSONEncoder().encode(review).write(to: reviewURL, options: [.atomic])
        } catch {
            logger.info("Could not keep the unsaved review: \(error)")
        }
    }

    public func clear() {
        try? FileManager.default.removeItem(at: directory)
    }
}
