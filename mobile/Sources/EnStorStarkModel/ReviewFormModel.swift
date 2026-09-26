import Foundation
import Observation
import SkipFuse
import OpenAPIRuntime

/// The editable fields of a review, as the form shows them.
public struct ReviewDraft: Equatable, Sendable {
    public var title = ""
    public var description = ""
    public var location = ""
    /// Empty means "derive from the title" (create) or "keep deriving" (edit).
    public var slug = ""
    public var ratings: [RatingKey: Int] = Dictionary(uniqueKeysWithValues: RatingKey.allCases.map { ($0, 0) })
    /// Nil means "use the suggestion from the aspect ratings".
    public var overallRating: Int?
    /// A listed brand, `ReviewFormModel.otherBrand`, or empty (nothing chosen).
    public var brandChoice = ""
    public var customBrand = ""
    public var priceText = ""
    public var isHappyHourPrice = false
    public var authors: Set<String> = []
    public var focusX: Double = 50
    public var focusY: Double = 50
}

/// State and rules for creating a draft or editing a review.
///
/// The server validates everything. This model only checks what it must before it can build
/// a request (a whole-number price, a brand, an author, a photo on create), and shows server
/// errors next to the field that the problem pointer names.
@MainActor @Observable public final class ReviewFormModel {
    public enum Mode: Equatable, Sendable {
        case create
        case edit(slug: String, eTag: String)
    }

    /// The picker value for "another brand".
    public static let otherBrand = "__other__"

    public private(set) var mode: Mode
    public var draft: ReviewDraft
    public let metadata: ReviewMetadata
    /// Author checklist order: the signed-in user, existing credits, then everyone else.
    public private(set) var authorOptions: [String]
    /// The current photo of an edited review. A new photo replaces it.
    public let existingImagePath: String?
    public private(set) var newImage: ImageUpload?

    public private(set) var isSubmitting = false
    public private(set) var isReloading = false
    public private(set) var fieldErrors: [String: String] = [:]
    public private(set) var errorMessage: String?
    /// True after a 412 or `concurrent_update`: someone else saved first.
    public private(set) var needsReload = false

    private var initialDraft: ReviewDraft
    private let api: APIClient
    private let currentUser: String?
    private var existingCredits: [String]

    init(api: APIClient, metadata: ReviewMetadata, currentUser: String?, editing: Tagged<Review>?) {
        self.api = api
        self.metadata = metadata
        self.currentUser = currentUser
        var draft = ReviewDraft()
        var credits: [String] = []
        if let editing, let eTag = editing.eTag {
            let review = editing.value
            mode = .edit(slug: review.slug, eTag: eTag)
            existingImagePath = review.image.url
            credits = [review.author] + review.coAuthors
            draft = Self.draft(from: review, metadata: metadata, currentUser: currentUser)
        } else {
            mode = .create
            existingImagePath = nil
            if let currentUser { draft.authors = [currentUser] }
        }
        self.draft = draft
        initialDraft = draft
        existingCredits = credits
        authorOptions = Self.authorOptions(currentUser: currentUser, credits: credits, users: [])
    }

    public var isEditing: Bool { mode != .create }

    public var hasChanges: Bool { draft != initialDraft || newImage != nil }

    /// The weighted sum of the aspect ratings.
    public var weightedScore: Double {
        metadata.ratingMetrics.reduce(0) { sum, metric in
            sum + metric.weight * Double(draft.ratings[metric.key] ?? 0)
        }
    }

    /// The highest overall rating whose threshold the weighted score reaches.
    public var suggestedOverallRating: Int {
        metadata.overallRating.thresholds
            .filter { $0.minimumWeightedScore <= weightedScore }
            .map(\.rating)
            .max() ?? metadata.overallRating.minimum
    }

    public var effectiveOverallRating: Int { draft.overallRating ?? suggestedOverallRating }

    /// The field message for the first pointer that has one.
    public func error(for pointers: String...) -> String? {
        pointers.lazy.compactMap { self.fieldErrors[$0] }.first
    }

    /// Field messages that no form field shows.
    public var unplacedErrors: [String] {
        fieldErrors.filter { pointer, _ in !Self.placedPointers.contains(pointer) && !pointer.hasPrefix("/ratings/") }
            .sorted { $0.key < $1.key }
            .map(\.value)
    }

    static let placedPointers: Set<String> = [
        "/title", "/description", "/location", "/slug", "/overallRating", "/beer/brand",
        "/beer/priceKr", "/beer/isHappyHourPrice", "/authors", "/image", "/image/data",
        "/image/contentType", "/imageFocus", "/imageFocus/x", "/imageFocus/y"
    ]

    /// Loads all reviewers for the author checklist. Without them, the checklist still has
    /// the signed-in user and the existing credits.
    public func loadAuthors() async {
        do {
            let users = try await api.users()
            authorOptions = Self.authorOptions(currentUser: currentUser, credits: existingCredits, users: users)
        } catch {
            logger.info("Could not load reviewers: \(error)")
        }
    }

    /// Sets a new photo. The caller converts it to JPEG, PNG, or WebP first.
    public func setImage(data: Data, contentType: ImageContentType) {
        fieldErrors["/image"] = nil
        fieldErrors["/image/data"] = nil
        if data.count > metadata.limits.imageMaxBytes {
            newImage = nil
            fieldErrors["/image"] = "Bilden är för stor."
            return
        }
        newImage = ImageUpload(contentType: contentType, data: Base64EncodedData(data))
    }

    /// Saves. Returns the saved review, or nil when the form shows an error.
    public func submit() async -> Tagged<Review>? {
        guard !isSubmitting, let fields = validatedFields() else { return nil }
        isSubmitting = true
        defer { isSubmitting = false }
        errorMessage = nil
        fieldErrors = [:]
        needsReload = false
        do {
            switch mode {
            case .create:
                guard let newImage else { return nil }
                return try await api.createReview(fields, image: newImage)
            case .edit(let slug, let eTag):
                return try await api.updateReview(slug: slug, eTag: eTag, fields, image: newImage)
            }
        } catch {
            let apiError = APIError.from(error)
            if let problem = apiError.problem {
                fieldErrors = problem.fieldErrors
                needsReload = problem.knownCode == .preconditionFailed || problem.knownCode == .concurrentUpdate
            }
            errorMessage = apiError.localizedDescription
            return nil
        }
    }

    /// After a conflict: loads the latest version and replaces the fields with it. A newly
    /// chosen photo stays.
    public func reloadLatest() async {
        guard case .edit(let slug, _) = mode else { return }
        isReloading = true
        defer { isReloading = false }
        do {
            let latest = try await api.review(slug: slug)
            guard let eTag = latest.eTag else { return }
            mode = .edit(slug: latest.value.slug, eTag: eTag)
            existingCredits = [latest.value.author] + latest.value.coAuthors
            draft = Self.draft(from: latest.value, metadata: metadata, currentUser: currentUser)
            initialDraft = draft
            fieldErrors = [:]
            errorMessage = nil
            needsReload = false
            await loadAuthors()
        } catch {
            errorMessage = APIError.from(error).localizedDescription
        }
    }

    // MARK: Building the request

    private func validatedFields() -> ReviewFields? {
        var errors: [String: String] = [:]
        let price = Int(draft.priceText.trimmingCharacters(in: .whitespaces))
        if price == nil {
            errors["/beer/priceKr"] = "Ange priset i hela kronor."
        }
        let brand = (draft.brandChoice == Self.otherBrand ? draft.customBrand : draft.brandChoice)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if brand.isEmpty {
            errors["/beer/brand"] = "Välj ett ölmärke eller skriv ett eget."
        }
        let authors = authorOptions.filter { draft.authors.contains($0) }
        if authors.isEmpty {
            errors["/authors"] = "Välj minst en författare."
        }
        if mode == .create && newImage == nil {
            errors["/image"] = "Välj en bild."
        }
        guard errors.isEmpty, let price else {
            fieldErrors = errors
            errorMessage = "Kontrollera de markerade fälten."
            return nil
        }

        let slug = draft.slug.trimmingCharacters(in: .whitespacesAndNewlines)
        let ratings = draft.ratings
        return ReviewFields(
            title: draft.title,
            description: draft.description,
            location: draft.location,
            slug: slug.isEmpty ? nil : slug,
            ratings: .init(
                atmosphere: ratings[.atmosphere] ?? 0,
                service: ratings[.service] ?? 0,
                selection: ratings[.selection] ?? 0,
                quality: ratings[.quality] ?? 0,
                price: ratings[.price] ?? 0,
                cleanliness: ratings[.cleanliness] ?? 0,
                soundLevel: ratings[.soundLevel] ?? 0,
                barhopPotential: ratings[.barhopPotential] ?? 0
            ),
            overallRating: draft.overallRating,
            beer: .init(brand: brand, priceKr: price, isHappyHourPrice: draft.isHappyHourPrice),
            authors: authors,
            imageFocus: .init(x: draft.focusX.rounded(), y: draft.focusY.rounded())
        )
    }

    // MARK: Helpers

    static func draft(from review: Review, metadata: ReviewMetadata, currentUser: String?) -> ReviewDraft {
        var draft = ReviewDraft()
        draft.title = review.title
        draft.description = review.description
        draft.location = review.location
        // Send the current slug, or the server derives a new one from the title.
        draft.slug = review.slug
        for key in RatingKey.allCases {
            draft.ratings[key] = Int(review.ratings.value(for: key).rounded())
        }
        draft.overallRating = review.overallRating
        if let brand = review.beer.brand?.trimmingCharacters(in: .whitespacesAndNewlines), !brand.isEmpty {
            if metadata.beerBrands.contains(brand) {
                draft.brandChoice = brand
            } else {
                draft.brandChoice = otherBrand
                draft.customBrand = brand
            }
        }
        draft.priceText = review.beer.priceKr.map(String.init) ?? ""
        draft.isHappyHourPrice = review.beer.isHappyHourPrice
        // The editor is selected by default, like on the web. They can opt out.
        var authors = Set([review.author] + review.coAuthors)
        if let currentUser { authors.insert(currentUser) }
        draft.authors = authors
        draft.focusX = review.image.focusX
        draft.focusY = review.image.focusY
        return draft
    }

    static func authorOptions(currentUser: String?, credits: [String], users: [String]) -> [String] {
        var seen = Set<String>()
        return ([currentUser].compactMap { $0 } + credits + users)
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }
}
