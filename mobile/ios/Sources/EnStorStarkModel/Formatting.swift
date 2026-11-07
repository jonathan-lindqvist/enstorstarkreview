import Foundation
import EnStorStarkAPI

// Display rules. They match the web client (src/lib/utils/price.ts, authors.ts, beer-brands.ts).

public enum Formatting {
    static let swedish = Locale(identifier: "sv_SE")

    /// What cards show for an unknown brand, like the web's UNKNOWN_BEER_BRAND_CARD_LABEL.
    public static let unknownBeerBrand = "Stor stark"
    public static let happyHourNote = "* happy hour"

    /// `65 kr`, or `65 kr*` for a happy-hour price. Nil when the price is missing or invalid.
    public static func beerPrice(_ priceKr: Int?, isHappyHour: Bool) -> String? {
        guard let priceKr, (1...999).contains(priceKr) else { return nil }
        return "\(priceKr) kr\(isHappyHour ? "*" : "")"
    }

    /// The brand for a card: "Stor stark" when it is unknown.
    public static func beerBrand(_ brand: String?) -> String {
        knownBeerBrand(brand) ?? unknownBeerBrand
    }

    /// The brand without surrounding space, or nil when it is unknown.
    public static func knownBeerBrand(_ brand: String?) -> String? {
        let trimmed = brand?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    /// "Statistiken säger 4 vid 1,38 kr/cl (antar 40 cl).", like the web's PriceValueHint.
    public static func priceValueHint(_ suggestion: PriceValue.Suggestion) -> String {
        let assumed = suggestion.assumedVolume ? " (antar \(PriceValue.assumedVolumeCl) cl)" : ""
        return "Statistiken säger \(suggestion.rating) vid \(krPerCl(suggestion.krPerCl)) kr/cl\(assumed)."
    }

    /// "under 1,15", "1,15–1,60" or "från 2,61" kr/cl, like the web's price gate table.
    public static func krPerClRange(_ gate: PriceValue.Gate) -> String {
        guard let below = gate.belowKrPerCl else { return "från \(krPerCl(gate.fromKrPerCl))" }
        if gate.fromKrPerCl == 0 { return "under \(krPerCl(below))" }
        return "\(krPerCl(gate.fromKrPerCl))–\(krPerCl(below))"
    }

    /// "Hörnan: 45 kr för 40 cl (antaget), 1,13 kr/cl, betyg 5, väntat betyg 5", like the web's chart.
    public static func priceValueBar(_ bar: PriceValue.Bar) -> String {
        let volume = bar.point.beerVolumeCl ?? PriceValue.assumedVolumeCl
        return "\(bar.point.title): \(bar.point.beerPriceKr) kr för \(volume) cl\(bar.assumedVolume ? " (antaget)" : ""), "
            + "\(krPerCl(bar.krPerCl)) kr/cl, betyg \(decimal(bar.valueRating)), väntat betyg \(bar.gateRating)"
    }

    /// Kronor per centilitre with two decimals. Rounds the shortest decimal form half up, like
    /// the web's toLocaleString, so the gate 2.605 is 2,61.
    static func krPerCl(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = swedish
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.roundingMode = .halfUp
        return formatter.string(from: NSDecimalNumber(string: "\(value)")) ?? String(value)
    }

    /// Volume per krona, `0,54 cl/kr`. Nil without a volume or price, and for happy hour prices,
    /// which the statistics also leave out of cl/kr.
    public static func clPerKr(volumeCl: Int?, priceKr: Int?, isHappyHour: Bool) -> String? {
        guard let volumeCl, let priceKr, priceKr > 0, !isHappyHour else { return nil }
        return clPerKr(Double(volumeCl) / Double(priceKr))
    }

    /// `1,2 km`, like the web's formatDistanceKm.
    public static func distance(kilometres: Double) -> String {
        "\(decimal(kilometres, minimumFractionDigits: 1, maximumFractionDigits: 1)) km"
    }

    /// `0,77 cl/kr`, like the web's formatClPerKr.
    public static func clPerKr(_ value: Double) -> String {
        "\(decimal(value, minimumFractionDigits: 2, maximumFractionDigits: 2)) cl/kr"
    }

    /// `6 953`, with Swedish thousands separators.
    public static func wholeNumber(_ value: Int) -> String {
        decimal(Double(value), maximumFractionDigits: 0)
    }

    /// The word for an overall rating (0–3), as on the about page of the web.
    public static func ratingWord(_ rating: Int) -> String {
        ["Inget extra", "Sticker ut", "Riktigt bra", "Måste upplevas"][min(max(rating, 0), 3)]
    }

    /// The overall rating (0–3) is shown as 0–3 stamps of excellence, never as "x av 3".
    public static func stampCount(_ rating: Int) -> Int { min(max(rating, 0), 3) }

    /// "Ingen stämpel", "En stämpel", "Två stämplar", "Tre stämplar".
    public static func stamps(_ rating: Int) -> String {
        ["Ingen stämpel", "En stämpel", "Två stämplar", "Tre stämplar"][stampCount(rating)]
    }

    /// "Riktigt bra · två stämplar"
    public static func stampAward(_ rating: Int) -> String {
        "\(ratingWord(rating)) · \(stamps(rating).lowercased())"
    }

    /// "Tre stämplar, Måste upplevas"
    public static func stampAccessibilityLabel(_ rating: Int) -> String {
        "\(stamps(rating)), \(ratingWord(rating))"
    }

    /// The longer explanation of an overall rating (0–3).
    public static func ratingExplanation(_ rating: Int) -> String {
        ["Inget extra.", "Sticker ut lite från mängden.", "Riktigt bra.", "Måste upplevas. Väldigt sällsynt."][min(max(rating, 0), 3)]
    }

    /// "Victor, Jonathan & Theo"
    public static func authorList(_ names: [String]) -> String {
        let names = names.map(authorName)
        guard names.count > 1, let last = names.last else { return names.first ?? "" }
        return names.dropLast().joined(separator: ", ") + " & " + last
    }

    /// `27 sep 2026`
    public static func shortDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = swedish
        formatter.setLocalizedDateFormatFromTemplate("d MMM yyyy")
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
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
    public static func decimal(_ value: Double, minimumFractionDigits: Int = 0, maximumFractionDigits: Int = 1) -> String {
        let formatter = NumberFormatter()
        formatter.locale = swedish
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = minimumFractionDigits
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
    /// The primary author first, then the co-authors, without duplicates or empty names.
    public var authorNames: [String] {
        var seen = Set<String>()
        return ([author] + coAuthors).filter { !$0.isEmpty && seen.insert($0).inserted }
    }
    /// The description as one line of plain text, for cards and rows.
    public var excerpt: String { ReviewMarkdown.plainText(description) }
    /// The street part of the address (before the first comma).
    public var street: String {
        location.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? location
    }
    /// The brand for cards, "Stor stark" when it is unknown.
    public var beerBrandText: String { Formatting.beerBrand(beer.brand) }
    /// Nil when the brand is unknown; the detail page then leaves it out.
    public var knownBeerBrand: String? { Formatting.knownBeerBrand(beer.brand) }
    public var beerPriceText: String? {
        Formatting.beerPrice(beer.priceKr, isHappyHour: beer.isHappyHourPrice)
    }
}
