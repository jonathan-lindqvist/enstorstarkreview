import Foundation
import Observation
import SkipFuse
import OpenAPIRuntime

/// The editable fields of a review, as the form shows them.
public struct ReviewDraft: Equatable, Codable, Sendable {
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
    public var attributes: Set<BarAttributeKey> = []
    public var authors: Set<String> = []
    public var focusX: Double = 50
    public var focusY: Double = 50

    /// The price as a number. Nil when the text is empty or not a whole number.
    public var priceKr: Int? {
        get { Int(priceText.trimmingCharacters(in: .whitespaces)) }
        set { priceText = newValue.map(String.init) ?? "" }
    }

    public init() {}
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
    /// True for a new review and for an edited draft.
    public let isDraft: Bool
    public private(set) var newImage: ImageUpload?
    /// The bytes of `newImage`, so a view can show it.
    public private(set) var newImageData: Data?
    /// True when the form started from a local copy of unsaved work.
    public private(set) var restoredFromLocalCopy = false
    /// The wizard step of the local copy.
    public private(set) var restoredStep: ReviewWizardStep?

    public private(set) var isSubmitting = false
    public private(set) var isReloading = false
    public private(set) var fieldErrors: [String: String] = [:]
    public private(set) var errorMessage: String?
    /// True after a 412 or `concurrent_update`: someone else saved first.
    public private(set) var needsReload = false

    private var initialDraft: ReviewDraft
    private let api: APIClient
    /// The signed-in reviewer.
    public let currentUser: String?
    private var existingCredits: [String]
    /// Only new reviews keep a local copy.
    private let localStore: UnsavedReviewStore?
    private var localImageIsSaved = false

    init(api: APIClient, metadata: ReviewMetadata, currentUser: String?, editing: Tagged<Review>?,
         localStore: UnsavedReviewStore? = nil) {
        self.api = api
        self.metadata = metadata
        self.currentUser = currentUser
        var draft = ReviewDraft()
        var credits: [String] = []
        if let editing, let eTag = editing.eTag {
            let review = editing.value
            mode = .edit(slug: review.slug, eTag: eTag)
            existingImagePath = review.image.url
            isDraft = review.isDraft
            credits = [review.author] + review.coAuthors
            draft = Self.draft(from: review, metadata: metadata, currentUser: currentUser)
        } else {
            mode = .create
            existingImagePath = nil
            isDraft = true
            if let currentUser { draft.authors = [currentUser] }
        }
        self.draft = draft
        initialDraft = draft
        existingCredits = credits
        self.localStore = editing == nil ? localStore : nil
        authorOptions = Self.authorOptions(currentUser: currentUser, credits: credits, users: [])
        restoreLocalCopy()
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
        "/image/contentType", "/imageFocus", "/imageFocus/x", "/imageFocus/y", "/attributes"
    ]

    // MARK: Wizard

    /// The first step that shows a field error.
    public var firstStepWithError: ReviewWizardStep? {
        fieldErrors.keys.compactMap(ReviewWizardStep.step(for:)).min { $0.rawValue < $1.rawValue }
    }

    /// True when a field of the step has an error.
    public func hasErrors(in step: ReviewWizardStep) -> Bool {
        fieldErrors.keys.contains { ReviewWizardStep.step(for: $0) == step }
    }

    /// Checks the fields of one step and shows their problems. Returns true when the step is
    /// complete. The server checks everything again when the review is saved.
    @discardableResult public func validate(_ step: ReviewWizardStep) -> Bool {
        for pointer in fieldErrors.keys where ReviewWizardStep.step(for: pointer) == step {
            fieldErrors[pointer] = nil
        }
        let problems = problems(in: step)
        for (pointer, message) in problems { fieldErrors[pointer] = message }
        if problems.isEmpty && fieldErrors.isEmpty { errorMessage = nil }
        return problems.isEmpty
    }

    /// True when the step has no local problems. It does not change the shown errors.
    public func isComplete(_ step: ReviewWizardStep) -> Bool {
        problems(in: step).isEmpty
    }

    private func problems(in step: ReviewWizardStep) -> [String: String] {
        let limits = metadata.limits
        var problems: [String: String] = [:]
        func trimmed(_ text: String) -> String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
        switch step {
        case .photo:
            if mode == .create && newImage == nil { problems["/image"] = "Ta eller välj en bild." }
        case .bar:
            if trimmed(draft.title).isEmpty {
                problems["/title"] = "Skriv barens namn."
            } else if draft.title.count > limits.titleMaxLength {
                problems["/title"] = "Namnet får vara högst \(limits.titleMaxLength) tecken."
            }
            if trimmed(draft.location).isEmpty {
                problems["/location"] = "Skriv adressen."
            } else if draft.location.count > limits.locationMaxLength {
                problems["/location"] = "Adressen får vara högst \(limits.locationMaxLength) tecken."
            }
        case .beer:
            if let price = draft.priceKr {
                if price < limits.beerPriceMinKr || price > limits.beerPriceMaxKr {
                    problems["/beer/priceKr"] = "Priset ska vara mellan \(limits.beerPriceMinKr) och \(limits.beerPriceMaxKr) kr."
                }
            } else {
                problems["/beer/priceKr"] = "Välj priset i hela kronor."
            }
            if trimmed(brand).isEmpty {
                problems["/beer/brand"] = "Välj ett ölmärke eller skriv ett eget."
            } else if brand.count > limits.beerBrandMaxLength {
                problems["/beer/brand"] = "Märket får vara högst \(limits.beerBrandMaxLength) tecken."
            }
        case .ratings:
            break
        case .text:
            if trimmed(draft.description).isEmpty {
                problems["/description"] = "Skriv några rader om baren."
            } else if draft.description.count > limits.descriptionMaxLength {
                problems["/description"] = "Texten får vara högst \(limits.descriptionMaxLength) tecken."
            }
        case .authors:
            if !authorOptions.contains(where: draft.authors.contains) {
                problems["/authors"] = "Välj minst en författare."
            }
        }
        return problems
    }

    /// The chosen brand: a listed brand or the custom name.
    public var brand: String {
        (draft.brandChoice == Self.otherBrand ? draft.customBrand : draft.brandChoice)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Local copy

    /// Keeps a local copy of a new review. `step` is the open wizard step.
    public func saveLocalCopy(step: ReviewWizardStep) {
        guard let localStore, let currentUser, hasChanges else { return }
        let image = localImageIsSaved ? nil : newImageData
        localStore.save(
            UnsavedReview(username: currentUser, draft: draft, step: step.rawValue, hasImage: newImageData != nil),
            image: image
        )
        localImageIsSaved = newImageData != nil
    }

    /// Removes the local copy, for example when the reviewer discards the review.
    public func discardLocalCopy() {
        localStore?.clear()
        localImageIsSaved = false
    }

    private func restoreLocalCopy() {
        guard let localStore, let currentUser, let saved = localStore.load(username: currentUser) else { return }
        draft = saved.review.draft
        if let image = saved.image {
            newImage = ImageUpload(contentType: .imageJpeg, data: Base64EncodedData(image))
            newImageData = image
            localImageIsSaved = true
        }
        restoredStep = ReviewWizardStep(rawValue: saved.review.step)
        restoredFromLocalCopy = true
    }

    /// Starts again with an empty review, and removes the local copy.
    public func startOver() {
        discardLocalCopy()
        draft = initialDraft
        newImage = nil
        newImageData = nil
        fieldErrors = [:]
        errorMessage = nil
        restoredFromLocalCopy = false
        restoredStep = nil
    }

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
            newImageData = nil
            fieldErrors["/image"] = "Bilden är för stor."
            return
        }
        newImage = ImageUpload(contentType: contentType, data: Base64EncodedData(data))
        newImageData = data
        localImageIsSaved = false
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
                let created = try await api.createReview(fields, image: newImage)
                discardLocalCopy()
                return created
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
        for step in ReviewWizardStep.allCases {
            errors.merge(problems(in: step)) { first, _ in first }
        }
        let authors = authorOptions.filter { draft.authors.contains($0) }
        guard errors.isEmpty, let price = draft.priceKr else {
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
            // Always the full selection: an empty array removes all attributes on an edit.
            attributes: .init(value1: metadata.barAttributes.map(\.key).filter { draft.attributes.contains($0) }),
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
        draft.attributes = Set(review.attributes)
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
