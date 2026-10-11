import SwiftUI
import EnStorStarkModel

// Building blocks of the Android design: a Material 3 take on the iOS app. Dark only, amber
// primary, tonal surfaces instead of glass. The colours match `essDarkColorScheme()` in
// `AndroidMaterial.swift`, which Material components get from the theme.
#if os(Android)
enum Ess {
    static let amber = Color(red: 1.0, green: 0.722, blue: 0.2)
    static let onAmber = Color(red: 0.169, green: 0.106, blue: 0.0)
    static let amberContainer = Color(red: 0.361, green: 0.247, blue: 0.0)
    static let onAmberContainer = Color(red: 1.0, green: 0.867, blue: 0.659)
    static let surface = Color(red: 0.055, green: 0.051, blue: 0.043)
    static let low = Color(red: 0.09, green: 0.082, blue: 0.071)
    static let container = Color(red: 0.11, green: 0.102, blue: 0.086)
    static let high = Color(red: 0.149, green: 0.137, blue: 0.122)
    static let highest = Color(red: 0.192, green: 0.176, blue: 0.157)
    static let onSurface = Color(red: 0.929, green: 0.882, blue: 0.831)
    static let variant = Color(red: 0.812, green: 0.769, blue: 0.71)
    static let outline = Color(red: 0.596, green: 0.561, blue: 0.506)
    static let outlineVariant = Color(red: 0.298, green: 0.275, blue: 0.235)
    static let error = Color(red: 1.0, green: 0.541, blue: 0.502)
    static let errorContainer = Color(red: 0.361, green: 0.102, blue: 0.086)
    static let good = Color(red: 0.561, green: 0.839, blue: 0.608)
    static let goodContainer = Color(red: 0.11, green: 0.302, blue: 0.165)

    static func num(_ size: CGFloat) -> Font { .system(size: size, weight: .black) }
    static let displaySmall = Font.system(size: 34, weight: .bold)
    static let headlineMedium = Font.system(size: 28, weight: .bold)
    static let headlineSmall = Font.system(size: 24, weight: .semibold)
    static let titleLarge = Font.system(size: 22, weight: .semibold)
    static let titleMedium = Font.system(size: 16, weight: .semibold)
    static let titleSmall = Font.system(size: 14, weight: .semibold)
    static let bodyLarge = Font.system(size: 16)
    static let bodyMedium = Font.system(size: 14)
    static let bodySmall = Font.system(size: 12)
    static let labelLarge = Font.system(size: 14, weight: .medium)
    static let labelMedium = Font.system(size: 12, weight: .medium)

    /// A stable pastel per name, the same as on iOS.
    static func avatarColor(for name: String) -> Color {
        let value = name.lowercased().unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return Color(hue: Double(value % 12) / 12, saturation: 0.35, brightness: 0.95)
    }

    /// The icon of a rating aspect in the wizard.
    static func icon(for key: RatingKey) -> String {
        switch key {
        case .atmosphere: return "light"
        case .service: return "service"
        case .selection: return "taps"
        case .quality: return "quality"
        case .price: return "payments"
        case .cleanliness: return "clean"
        case .soundLevel: return "volume"
        case .barhopPotential: return "walk"
        }
    }
}

extension View {
    /// A tonal surface with rounded corners, the Material 3 card without elevation.
    func tonal(_ color: Color = Ess.low, radius: CGFloat = 24) -> some View {
        background(RoundedRectangle(cornerRadius: radius).fill(color))
    }

    /// Clips to a rounded rectangle and adds an outline.
    func outlined(radius: CGFloat = 16, color: Color = Ess.outlineVariant) -> some View {
        overlay(RoundedRectangle(cornerRadius: radius).stroke(color, lineWidth: 1))
    }
}

/// Three stars for the overall rating (0–3).
struct Stars: View {
    let rating: Int
    var size: CGFloat = 14

    var body: some View {
        HStack(spacing: size * 0.15) {
            ForEach(0..<3, id: \.self) { index in
                Image(systemName: "star.fill")
                    .font(.system(size: size))
                    .foregroundStyle(index < rating ? Ess.amber : Ess.onSurface.opacity(0.22))
            }
        }
        .accessibilityLabel(Text("Betyg \(rating) av 3, \(Formatting.ratingWord(rating))"))
    }
}

/// Stars and the rating word.
struct RatingLine: View {
    let rating: Int
    var size: CGFloat = 13
    var wordColor: Color = Ess.variant

    var body: some View {
        HStack(spacing: 6) {
            Stars(rating: rating, size: size)
            Text(Formatting.ratingWord(rating))
                .font(.system(size: size - 1, weight: .medium))
                .foregroundStyle(wordColor)
        }
    }
}

/// A beer price in large numbers, `74 kr` or `74 kr*` for happy hour.
struct PriceText: View {
    let priceKr: Int?
    var isHappyHour = false
    var size: CGFloat = 32
    var color: Color = Ess.amber

    var body: some View {
        if let priceKr, Formatting.beerPrice(priceKr, isHappyHour: isHappyHour) != nil {
            HStack(alignment: .lastTextBaseline, spacing: 3) {
                Text(verbatim: "\(priceKr)").font(Ess.num(size))
                Text(verbatim: isHappyHour ? "kr*" : "kr").font(Ess.num(size * 0.42))
            }
            .foregroundStyle(color)
            .accessibilityLabel(Text(isHappyHour ? "\(priceKr) kronor, happy hour-pris" : "\(priceKr) kronor"))
        } else {
            Text(verbatim: "–").font(Ess.num(size)).foregroundStyle(Ess.outline)
                .accessibilityLabel(Text("Pris saknas"))
        }
    }
}

/// A round avatar with the first letter of a name.
struct Avatar: View {
    let name: String
    var size: CGFloat = 28
    var dimmed = false

    var body: some View {
        Text(verbatim: String(name.prefix(1)).uppercased())
            .font(.system(size: size * 0.44, weight: .bold))
            .foregroundStyle(Color.black)
            .frame(width: size, height: size)
            .background(Circle().fill(Ess.avatarColor(for: name)))
            .opacity(dimmed ? 0.4 : 1)
            .accessibilityHidden(true)
    }
}

/// Overlapping avatars and "av Victor, Jonathan & Theo".
struct AuthorLine: View {
    let names: [String]
    var size: CGFloat = 24

    var body: some View {
        HStack(spacing: 8) {
            ZStack(alignment: .leading) {
                ForEach(Array(names.prefix(4).enumerated()), id: \.offset) { index, name in
                    Avatar(name: name, size: size)
                        .padding(2)
                        .background(Circle().fill(Ess.surface))
                        .offset(x: CGFloat(index) * size * 0.7)
                }
            }
            .frame(width: size + 4 + CGFloat(max(min(names.count, 4) - 1, 0)) * size * 0.7, alignment: .leading)
            Text(verbatim: "av \(Formatting.authorList(names))")
                .font(Ess.labelLarge)
                .foregroundStyle(Ess.onSurface)
                .lineLimit(1)
        }
        .accessibilityLabel(Text("av \(Formatting.authorList(names))"))
    }
}

/// "Utkast" with a lock.
struct DraftChip: View {
    var onPhoto = false

    var body: some View {
        HStack(spacing: 4) {
            MIcon("lock", size: 14, color: onPhoto ? Ess.onAmber : Ess.amber)
            Text("Utkast").font(Ess.labelMedium)
        }
        .foregroundStyle(onPhoto ? Ess.onAmber : Ess.amber)
        .padding(.horizontal, 10)
        .frame(height: 26)
        .background(RoundedRectangle(cornerRadius: 8).fill(onPhoto ? Ess.amber : Ess.amberContainer))
        .accessibilityLabel(Text("Utkast"))
    }
}

/// A small heading above a group, for example "Märke".
struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text).font(Ess.titleSmall).foregroundStyle(Ess.variant)
    }
}

/// The heading of a part of a screen.
struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text).font(Ess.titleLarge).foregroundStyle(Ess.onSurface)
    }
}

/// A non-blocking error in an error container, with an optional retry button.
struct ErrorCard: View {
    let message: String
    var retry: (() async -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            MIcon("error", size: 22, color: Ess.error)
            VStack(alignment: .leading, spacing: 6) {
                Text(message).font(Ess.bodyMedium).foregroundStyle(Ess.onSurface)
                if let retry {
                    Button("Försök igen") { Task { await retry() } }
                        .foregroundStyle(Ess.amber)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .tonal(Ess.errorContainer.opacity(0.6), radius: 16)
    }
}

/// A placeholder when a list is empty.
struct EmptyState: View {
    let icon: String
    let title: String
    var message: String? = nil

    var body: some View {
        VStack(spacing: 10) {
            MIcon(icon, size: 40, color: Ess.outline)
            Text(title).font(Ess.titleMedium).foregroundStyle(Ess.onSurface)
            if let message {
                Text(message).font(Ess.bodyMedium).foregroundStyle(Ess.variant).multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// Grey area while a photo is missing.
struct PhotoPlaceholder: View {
    var body: some View {
        ZStack {
            Ess.high
            MIcon("beer", size: 48, color: Ess.onSurface.opacity(0.15))
        }
    }
}

/// A photo from memory, filled into its frame around the focus point.
struct LocalPhoto: View {
    let image: UIImage
    var focusX: Double = 50
    var focusY: Double = 50

    var body: some View {
        FocusedFill(image: Image(uiImage: image), focusX: focusX, focusY: focusY)
    }
}

/// A review in the feed: the photo on top, then rating, title, excerpt, authors, and price.
struct ReviewCard: View {
    let review: Review

    var body: some View {
        ReviewCardLayout(
            rating: review.overallRating,
            title: review.title,
            excerpt: review.excerpt,
            authors: review.authorNames,
            brand: review.beerBrandText,
            street: review.street,
            priceKr: review.beer.priceKr,
            isHappyHour: review.beer.isHappyHourPrice,
            isDraft: review.isDraft
        ) {
            FocusedImage(path: review.image.url, focusX: review.image.focusX, focusY: review.image.focusY)
        }
    }
}

/// The card layout, also used for the preview in the wizard.
struct ReviewCardLayout<Photo: View>: View {
    let rating: Int
    let title: String
    let excerpt: String
    let authors: [String]
    let brand: String
    let street: String
    let priceKr: Int?
    let isHappyHour: Bool
    let isDraft: Bool
    @ViewBuilder let photo: () -> Photo

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear
                .aspectRatio(16.0 / 10.0, contentMode: .fit)
                .overlay { photo() }
                .overlay(alignment: .topLeading) {
                    if isDraft { DraftChip(onPhoto: true).padding(12) }
                }
                .clipped()
            VStack(alignment: .leading, spacing: 6) {
                RatingLine(rating: rating)
                Text(title)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Ess.onSurface)
                    .lineLimit(2)
                if !excerpt.isEmpty {
                    Text(excerpt)
                        .font(Ess.bodyMedium)
                        .foregroundStyle(Ess.variant)
                        .lineLimit(2)
                }
                HStack(alignment: .bottom, spacing: 8) {
                    VStack(alignment: .leading, spacing: 6) {
                        if !authors.isEmpty { AuthorLine(names: authors) }
                        Text(verbatim: [brand, street].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(Ess.bodySmall)
                            .foregroundStyle(Ess.variant)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    PriceText(priceKr: priceKr, isHappyHour: isHappyHour, size: 30)
                }
                .padding(.top, 4)
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tonal(Ess.low, radius: 24)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }
}

/// A compact row for search results and lists.
struct ReviewRow: View {
    let review: Review

    var body: some View {
        HStack(spacing: 14) {
            FocusedImage(path: review.image.url, focusX: review.image.focusX, focusY: review.image.focusY)
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(review.title).font(Ess.titleMedium).foregroundStyle(Ess.onSurface).lineLimit(1)
                    if review.isDraft { MIcon("lock", size: 14, color: Ess.amber) }
                }
                if !review.excerpt.isEmpty {
                    Text(review.excerpt).font(Ess.bodySmall).foregroundStyle(Ess.variant).lineLimit(1)
                }
                HStack(spacing: 6) {
                    Stars(rating: review.overallRating, size: 11)
                    Text(verbatim: review.street).font(Ess.bodySmall).foregroundStyle(Ess.outline).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            PriceText(priceKr: review.beer.priceKr, isHappyHour: review.beer.isHappyHourPrice, size: 22)
        }
        .padding(.vertical, 6)
    }
}

/// One aspect: label, description, value of 5, and a progress bar.
struct MetricBar: View {
    let label: String
    let hint: String
    let value: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(label).font(Ess.titleSmall).foregroundStyle(Ess.onSurface)
                    Text(hint).font(Ess.bodySmall).foregroundStyle(Ess.variant)
                }
                Spacer()
                HStack(alignment: .lastTextBaseline, spacing: 1) {
                    Text(verbatim: Formatting.decimal(value)).font(Ess.num(20)).foregroundStyle(Ess.amber)
                    Text(verbatim: "/5").font(Ess.labelMedium).foregroundStyle(Ess.variant)
                }
            }
            ProgressView(value: min(max(value, 0), 5), total: 5)
                .tint(Ess.amber)
        }
        .accessibilityLabel(Text("\(label): \(Formatting.decimal(value)) av 5"))
    }
}

/// A field message under a form field.
struct FieldMessage: View {
    let message: String?

    var body: some View {
        if let message {
            Text(message).font(Ess.bodySmall).foregroundStyle(Ess.error)
        }
    }
}

extension View {
    /// Shows `message` in a snackbar at the bottom, and hides it after a few seconds.
    func snackbar(_ message: Binding<String?>, actionLabel: String? = nil, bottom: CGFloat = 12,
                  action: @escaping () -> Void = {}) -> some View {
        overlay(alignment: .bottom) {
            if let text = message.wrappedValue {
                Snackbar(message: text, actionLabel: actionLabel) {
                    message.wrappedValue = nil
                    action()
                }
                .padding(.bottom, bottom)
                .task(id: text) {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    if !Task.isCancelled, message.wrappedValue == text { message.wrappedValue = nil }
                }
            }
        }
    }
}
#endif
