#if os(Android)
import SwiftUI
import EnStorStarkModel

/// Design tokens of the Android app: the Material 3 take on the iOS design.
///
/// Shared with iOS: the black page, white text, amber, glowing prices and rating numbers, the
/// feed card with its text on the photo, and the round 0–5 buttons. Kept Material: 8 dp filter
/// chips, filled fields with an underline, surfaces with a slight warm tint, sentence-case
/// section labels, heavy type only on large titles and numbers, and no glass. The Material
/// colour scheme with the same values is in `Android/app/src/main/kotlin/Main.kt`.
enum Ess {
    static let bg = Color.black
    static let raised = Color(red: 0x1C / 255, green: 0x1A / 255, blue: 0x17 / 255)
    static let raised2 = Color(red: 0x2A / 255, green: 0x27 / 255, blue: 0x24 / 255)
    static let raised3 = Color(red: 0x39 / 255, green: 0x35 / 255, blue: 0x31 / 255)
    static let text = Color.white
    static let warmWhite = Color(red: 0xF5 / 255, green: 0xEF / 255, blue: 0xE8 / 255)
    static let secondary = warmWhite.opacity(0.62)
    static let tertiary = warmWhite.opacity(0.38)
    static let hairline = warmWhite.opacity(0.12)
    static let amber = Color(red: 1.0, green: 0xB8 / 255, blue: 0x33 / 255)
    static let amberDeep = Color(red: 0xEB / 255, green: 0x8C / 255, blue: 0x0D / 255)
    static let amberContainer = Color(red: 0x33 / 255, green: 0x26 / 255, blue: 0x0A / 255)
    static let foam = Color(red: 1.0, green: 0xF5 / 255, blue: 0xDB / 255)
    static let good = Color(red: 0x73 / 255, green: 0xDB / 255, blue: 0x85 / 255)
    static let goodContainer = Color(red: 0x12 / 255, green: 0x26 / 255, blue: 0x1A / 255)
    static let bad = Color(red: 1.0, green: 0x75 / 255, blue: 0x66 / 255)
    static let badContainer = Color(red: 0x2E / 255, green: 0x14 / 255, blue: 0x12 / 255)

    // Material 3 type roles. Heavy weights only for large titles and numbers.
    /// Step titles (headlineLarge, extra bold).
    static let stepTitle = Font.system(size: 32, weight: .heavy)
    static let headlineMedium = Font.system(size: 28, weight: .bold)
    static let headlineSmall = Font.system(size: 24, weight: .semibold)
    static let titleLarge = Font.system(size: 22, weight: .semibold)
    static let titleMedium = Font.system(size: 16, weight: .semibold)
    static let titleSmall = Font.system(size: 14, weight: .medium)
    static let bodyLarge = Font.system(size: 16)
    static let bodyMedium = Font.system(size: 14)
    static let bodySmall = Font.system(size: 12)
    static let labelLarge = Font.system(size: 14, weight: .medium)
    static let labelMedium = Font.system(size: 12, weight: .medium)

    /// Big prices and rating numbers.
    static func num(_ size: CGFloat) -> Font { .system(size: size, weight: .black) }

    /// A stable pastel per name, so a reviewer always has the same colour.
    static func avatarColor(for name: String) -> Color {
        let value = name.lowercased().unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return Color(hue: Double(value % 12) / 12, saturation: 0.35, brightness: 0.95)
    }
}

extension View {
    /// A filled rounded surface.
    func essCard(_ radius: CGFloat = 24, fill: Color = Ess.raised) -> some View {
        background(RoundedRectangle(cornerRadius: radius).fill(fill))
    }

    /// The amber glow on prices and large rating numbers.
    func glow(_ on: Bool = true, color: Color = Ess.amber, radius: CGFloat = 12) -> some View {
        shadow(color: on ? color.opacity(0.65) : .clear, radius: radius)
    }
}

// MARK: Ratings, prices, people

/// Three filled stars for the overall rating (0–3); the empty ones are dim.
struct Stars: View {
    let rating: Int
    var size: CGFloat = 14
    var empty: Color = Color.white.opacity(0.22)

    var body: some View {
        HStack(spacing: size * 0.1) {
            ForEach(0..<3, id: \.self) { index in
                EssIconView(.star, size: size, color: index < rating ? Ess.amber : empty)
            }
        }
        .accessibilityLabel(Text("Betyg \(rating) av 3, \(Formatting.ratingWord(rating))"))
    }
}

/// Stars and the rating word, for example "★★☆ Riktigt bra".
struct RatingLine: View {
    let rating: Int
    var size: CGFloat = 15
    var wordColor: Color = Ess.secondary

    var body: some View {
        HStack(spacing: 6) {
            Stars(rating: rating, size: size)
            Text(Formatting.ratingWord(rating))
                .font(.system(size: size - 2, weight: .semibold))
                .foregroundStyle(wordColor)
        }
    }
}

/// A beer price in large numbers, `74 kr` or `74 kr*` for happy hour. Amber prices glow.
struct PriceLabel: View {
    let priceKr: Int?
    var isHappyHour = false
    var size: CGFloat = 40
    var color: Color = Ess.amber
    var glows = true

    var body: some View {
        if let priceKr, Formatting.beerPrice(priceKr, isHappyHour: isHappyHour) != nil {
            HStack(alignment: .lastTextBaseline, spacing: size * 0.08) {
                Text(verbatim: "\(priceKr)").font(Ess.num(size))
                Text(verbatim: isHappyHour ? "kr*" : "kr").font(Ess.num(size * 0.4))
            }
            .foregroundStyle(color)
            .glow(glows, color: color, radius: size * 0.3)
            .accessibilityLabel(Text(isHappyHour ? "\(priceKr) kronor, happy hour-pris" : "\(priceKr) kronor"))
        } else {
            Text(verbatim: "–").font(Ess.num(size)).foregroundStyle(Ess.tertiary)
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
        Text(String(Formatting.authorName(name).prefix(1)).uppercased())
            .font(.system(size: size * 0.44, weight: .bold))
            .foregroundStyle(Color.black.opacity(dimmed ? 0.5 : 0.85))
            .frame(width: size, height: size)
            .background(Circle().fill(Ess.avatarColor(for: name).opacity(dimmed ? 0.35 : 1)))
            .accessibilityHidden(true)
    }
}

/// Overlapping avatars and "av Victor, Jonathan & Theo".
struct ReviewerLine: View {
    let names: [String]
    var avatarSize: CGFloat = 24
    var ring: Color = Ess.raised

    var body: some View {
        let shown = Array(names.prefix(4))
        HStack(spacing: 8) {
            ZStack(alignment: .leading) {
                ForEach(Array(shown.enumerated()), id: \.offset) { index, name in
                    Avatar(name: name, size: avatarSize)
                        .padding(1.5)
                        .background(Circle().fill(ring))
                        .padding(.leading, CGFloat(index) * avatarSize * 0.7)
                }
            }
            Text("av \(Formatting.authorList(names.map(Formatting.authorName)))")
                .font(Ess.labelLarge)
                .foregroundStyle(Ess.text)
                .lineLimit(1)
        }
        .accessibilityLabel(Text("av \(Formatting.authorList(names.map(Formatting.authorName)))"))
    }
}

/// "Utkast" with a lock, on a photo (amber) or on a surface.
struct DraftTag: View {
    var onPhoto = false

    var body: some View {
        HStack(spacing: 5) {
            EssIconView(.lock, size: 14, color: onPhoto ? .black : Ess.amber)
            Text("Utkast").font(.system(size: 14, weight: .bold))
                .foregroundStyle(onPhoto ? Color.black : Ess.amber)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(onPhoto ? Ess.amber : Ess.amberContainer))
        .accessibilityLabel(Text("Utkast"))
    }
}

/// A sentence-case section label (Material titleSmall).
struct SectionLabel: View {
    let text: String
    var color: Color = Ess.secondary

    var body: some View {
        Text(text).font(Ess.titleSmall).foregroundStyle(color)
    }
}

/// The amber disc with a black icon (happy hour, map privacy).
struct AmberDisc: View {
    let icon: EssIcon
    var size: CGFloat = 36

    var body: some View {
        EssIconView(icon, size: size * 0.55, color: .black)
            .frame(width: size, height: size)
            .background(Circle().fill(Ess.amber))
    }
}

// MARK: Chips

/// A Material 3 filter chip (8 dp corners), filled; amber with black text when selected.
struct EssChip: View {
    let label: String
    var isOn = false
    var leading: EssChipLeading = .none
    var height: CGFloat = 32
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon = leadingIcon {
                    EssIconView(icon, size: 18, color: isOn ? Color.black : Ess.text)
                } else if let name = leading.avatarName {
                    Avatar(name: name, size: 22)
                }
                Text(label).font(Ess.labelLarge).lineLimit(1)
                    .foregroundStyle(isOn ? Color.black : Ess.text)
            }
            .padding(.leading, hasLeading ? 8 : 16)
            .padding(.trailing, 16)
            .frame(height: height)
            .background(RoundedRectangle(cornerRadius: 8).fill(isOn ? Ess.amber : Ess.raised2))
        }
        .buttonStyle(.plain)
        .selectedTrait(isOn)
    }

    var hasLeading: Bool { leadingIcon != nil || leading.avatarName != nil }

    /// A selected chip shows a check in place of its leading content.
    var leadingIcon: EssIcon? {
        switch leading {
        case .none: return nil
        case .check: return isOn ? .check : nil
        case .add: return .add
        case .checkOrAdd: return isOn ? .check : .add
        case .avatar: return isOn ? .check : nil
        }
    }
}

extension View {
    /// Marks a selected chip or option for TalkBack. Skip's `AccessibilityTraits()` (and so `[]`)
    /// recurses until the stack overflows, so an unselected view gets no traits modifier.
    @ViewBuilder func selectedTrait(_ isSelected: Bool) -> some View {
        if isSelected { accessibilityAddTraits(.isSelected) } else { self }
    }
}

/// What a chip shows before its label.
enum EssChipLeading {
    case none, check, add, checkOrAdd, avatar(String)

    var avatarName: String? {
        if case .avatar(let name) = self { return name }
        return nil
    }
}

/// Wraps its items into rows, like Compose `FlowRow`. SkipUI has no custom `Layout`, so the
/// items are measured once in a hidden copy and then placed row by row.
struct FlowRows<Item: Hashable, Content: View>: View {
    let items: [Item]
    var spacing: CGFloat = 8
    @ViewBuilder let content: (Item) -> Content
    @State var widths: [Item: CGFloat] = [:]
    @State var available: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: spacing) {
                    ForEach(row, id: \.self) { item in content(item) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { available = $0 }
        .background(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                ForEach(items, id: \.self) { item in
                    content(item)
                        .fixedSize()
                        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { widths[item] = $0 }
                }
            }
            .opacity(0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    var rows: [[Item]] {
        guard available > 0 else { return items.map { [$0] } }
        var result: [[Item]] = []
        var row: [Item] = []
        var used: CGFloat = 0
        for item in items {
            let width = widths[item] ?? available
            if !row.isEmpty && used + spacing + width > available {
                result.append(row)
                row = []
                used = 0
            }
            used += row.isEmpty ? width : spacing + width
            row.append(item)
        }
        if !row.isEmpty { result.append(row) }
        return result
    }
}

// MARK: Buttons

/// The filled amber button (Material filled button, 56 dp in the wizard).
struct PrimaryButton: View {
    let text: String
    var icon: EssIcon? = nil
    var leadingIcon: EssIcon? = nil
    var height: CGFloat = 52
    var isLoading = false
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let leadingIcon { EssIconView(leadingIcon, size: 20, color: .black) }
                Text(text).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.black)
                if isLoading {
                    ProgressView().tint(Color.black).frame(width: 18, height: 18)
                } else if let icon {
                    EssIconView(icon, size: 18, color: .black)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(Capsule().fill(Ess.amber.opacity(isEnabled ? 1 : 0.38)))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isLoading)
    }
}

/// The neutral filled tonal button.
struct TonalButton: View {
    let text: String
    var icon: EssIcon? = nil
    var height: CGFloat = 52
    var color: Color = Ess.text
    var fill: Color = Ess.raised2
    var fillsWidth = true
    var isLoading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView().tint(color).frame(width: 18, height: 18)
                } else if let icon {
                    EssIconView(icon, size: 18, color: color)
                }
                Text(text).font(.system(size: 15, weight: .bold)).foregroundStyle(color)
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: fillsWidth ? .infinity : nil)
            .frame(height: height)
            .background(Capsule().fill(fill))
        }
        .buttonStyle(.plain)
    }
}

/// A round filled tonal icon button.
struct TonalIconButton: View {
    let icon: EssIcon
    let label: String
    var size: CGFloat = 40
    var fill: Color = Ess.raised2
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            EssIconView(icon, size: 24, color: .white)
                .frame(width: size, height: size)
                .background(Circle().fill(fill))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }
}

// MARK: Fields

/// A Material 3 filled text field: a raised box with rounded top corners, a floating label,
/// and an underline that turns amber and thicker on focus (red on error).
struct EssField: View {
    let label: String
    @Binding var text: String
    var icon: EssIcon? = nil
    var error: String? = nil
    var supporting: String? = nil
    var isSecure = false
    var isMultiline = false
    var minHeight: CGFloat = 56
    var font: Font = Ess.bodyLarge
    var fill: Color = Ess.raised2
    @FocusState var isFocused: Bool

    var body: some View {
        let accent = error != nil ? Ess.bad : (isFocused ? Ess.amber : Ess.tertiary)
        VStack(alignment: .leading, spacing: 4) {
            VStack(spacing: 0) {
                HStack(alignment: isMultiline ? .top : .center, spacing: 12) {
                    if let icon {
                        EssIconView(icon, size: 24, color: error != nil ? Ess.bad : Ess.secondary)
                            .padding(.top, isMultiline ? 16 : 0)
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        if isFocused || !text.isEmpty {
                            Text(label).font(Ess.bodySmall)
                                .foregroundStyle(error != nil ? Ess.bad : (isFocused ? Ess.amber : Ess.secondary))
                                .padding(.top, 8)
                        }
                        field
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, isMultiline ? 8 : 0)
                .frame(maxWidth: .infinity, minHeight: minHeight, alignment: isMultiline ? .topLeading : .leading)
                Rectangle().fill(accent).frame(height: isFocused || error != nil ? 2 : 1)
            }
            .background(UnevenRoundedRectangle(topLeadingRadius: 12, topTrailingRadius: 12).fill(fill))
            .clipped()
            if let error {
                Text(error).font(Ess.bodySmall).foregroundStyle(Ess.bad).padding(.horizontal, 16)
            } else if let supporting {
                Text(supporting).font(Ess.bodySmall).foregroundStyle(Ess.secondary).padding(.horizontal, 16)
            }
        }
    }

    @ViewBuilder var field: some View {
        let prompt = isFocused || !text.isEmpty ? "" : label
        Group {
            if isSecure {
                SecureField(prompt, text: $text)
            } else if isMultiline {
                TextField(prompt, text: $text, axis: .vertical)
                    .lineLimit(12)
            } else {
                TextField(prompt, text: $text)
            }
        }
        .textFieldStyle(.plain)
        .font(font)
        .foregroundStyle(Ess.text)
        .tint(Ess.amber)
        .focused($isFocused)
        .padding(.bottom, isFocused || !text.isEmpty ? 4 : 0)
        .padding(.horizontal, -16)
    }
}

// MARK: Messages

/// A dark Material snackbar with an optional icon and action.
struct EssSnackbar: View {
    let text: String
    var icon: EssIcon? = nil
    var avatar: String? = nil
    var actionLabel: String? = nil
    var action: () -> Void = {}

    var body: some View {
        HStack(spacing: 10) {
            if let avatar {
                Avatar(name: avatar, size: 24)
            } else if let icon {
                EssIconView(icon, size: 20, color: Ess.amber)
            }
            Text(text).font(Ess.bodyMedium).foregroundStyle(.white)
            Spacer(minLength: 8)
            if let actionLabel {
                Button(actionLabel, action: action)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Ess.amber)
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 48)
        .background(RoundedRectangle(cornerRadius: 16).fill(Ess.raised3))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

/// A non-blocking error with an optional retry button.
struct ErrorCard: View {
    let message: String
    var retry: (() async -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            EssIconView(.error, size: 22, color: Ess.bad)
            VStack(alignment: .leading, spacing: 8) {
                Text(message).font(Ess.bodyMedium).foregroundStyle(Ess.text)
                if let retry {
                    Button("Försök igen") { Task { await retry() } }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Ess.amber)
                        .buttonStyle(.plain)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .essCard(16, fill: Ess.badContainer)
    }
}

/// An icon, a title, and a message for an empty list.
struct EmptyState: View {
    let icon: EssIcon
    let title: String
    var message: String? = nil

    var body: some View {
        VStack(spacing: 10) {
            EssIconView(icon, size: 40, color: Ess.tertiary)
            Text(title).font(Ess.titleMedium).foregroundStyle(Ess.text)
            if let message {
                Text(message).font(Ess.bodyMedium).foregroundStyle(Ess.secondary).multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// An amber spinner.
struct EssProgress: View {
    var body: some View {
        ProgressView().tint(Ess.amber)
    }
}

// MARK: Text

/// A review description: headings, paragraphs, and lists with amber markers.
struct DescriptionView: View {
    let source: String
    var size: CGFloat = 16

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(ReviewMarkdown.blocks(source).enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text):
            InlineMarkdownText(source: text)
                .font(level == 1 ? Ess.titleLarge : Ess.titleMedium)
                .foregroundStyle(Ess.text)
        case .paragraph(let text):
            InlineMarkdownText(source: text)
                .font(.system(size: size))
                .foregroundStyle(Color.white.opacity(0.88))
        case .bulletList(let items):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 12) {
                        Circle().fill(Ess.amber).frame(width: 6, height: 6).padding(.top, size * 0.5)
                        InlineMarkdownText(source: item)
                            .font(.system(size: size))
                            .foregroundStyle(Color.white.opacity(0.88))
                    }
                }
            }
        case .orderedList(let items):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(verbatim: "\(index + 1).").font(Ess.num(size)).foregroundStyle(Ess.amber)
                        InlineMarkdownText(source: item)
                            .font(.system(size: size))
                            .foregroundStyle(Color.white.opacity(0.88))
                    }
                }
            }
        }
    }
}
#endif
