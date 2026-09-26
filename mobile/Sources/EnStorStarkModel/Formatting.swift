import Foundation
import EnStorStarkAPI

// Display rules. They match the web client (src/lib/utils/price.ts, authors.ts, beer-brands.ts).

public enum Formatting {
    static let swedish = Locale(identifier: "sv_SE")

    public static let unknownBeerBrand = "Öl ej angiven"
    public static let happyHourNote = "* happy hour"

    /// `65 kr`, or `65 kr*` for a happy-hour price. Nil when the price is missing or invalid.
    public static func beerPrice(_ priceKr: Int?, isHappyHour: Bool) -> String? {
        guard let priceKr, (1...999).contains(priceKr) else { return nil }
        return "\(priceKr) kr\(isHappyHour ? "*" : "")"
    }

    public static func beerBrand(_ brand: String?) -> String {
        let trimmed = brand?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? unknownBeerBrand : trimmed
    }

    public static func authorName(_ name: String) -> String {
        guard let first = name.first else { return name }
        return first.uppercased() + name.dropFirst()
    }

    /// The primary author first, then the co-authors, without duplicates.
    public static func authors(_ author: String, coAuthors: [String]) -> String {
        var seen = Set<String>()
        return ([author] + coAuthors)
            .filter { !$0.isEmpty && seen.insert($0).inserted }
            .map(authorName)
            .joined(separator: ", ")
    }

    /// `26 september 2026`
    public static func date(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = swedish
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    /// `26 september 2026 23:05`
    public static func dateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = swedish
        formatter.dateStyle = .long
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    /// A number with at most `maximumFractionDigits` decimals and a Swedish decimal comma.
    public static func decimal(_ value: Double, maximumFractionDigits: Int = 1) -> String {
        let formatter = NumberFormatter()
        formatter.locale = swedish
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = maximumFractionDigits
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}

extension Components.Schemas.Ratings {
    /// The rating (0–5) for one aspect.
    public func value(for key: Components.Schemas.RatingKey) -> Double {
        switch key {
        case .atmosphere: return atmosphere
        case .service: return service
        case .selection: return selection
        case .quality: return quality
        case .price: return price
        case .cleanliness: return cleanliness
        case .soundLevel: return soundLevel
        case .barhopPotential: return barhopPotential
        }
    }
}

extension Components.Schemas.Review {
    public var isDraft: Bool { publicationStatus == .draft }
    public var authorsText: String { Formatting.authors(author, coAuthors: coAuthors) }
    public var beerBrandText: String { Formatting.beerBrand(beer.brand) }
    public var beerPriceText: String? {
        Formatting.beerPrice(beer.priceKr, isHappyHour: beer.isHappyHourPrice)
    }
}
