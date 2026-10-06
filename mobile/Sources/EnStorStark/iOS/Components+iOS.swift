#if !os(Android)
import SwiftUI
import EnStorStarkModel

// Small building blocks of the iOS design.

/// A selectable capsule, for example a sort option or a bar attribute.
struct Pill: View {
    let text: String
    var isOn = false
    var icon: String? = nil
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let icon { Image(systemName: icon).font(.system(size: 11, weight: .bold)) }
                Text(text).font(Theme.label(13)).lineLimit(1)
            }
            .foregroundStyle(isOn ? Color.black : Theme.text)
            .padding(.horizontal, 14)
            .frame(height: 32)
            .background(isOn ? Theme.amber : Color.white.opacity(0.12), in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// The amber capsule button.
struct PrimaryButtonStyle: ButtonStyle {
    var fill: Color = Theme.amber
    var height: CGFloat = 56

    func makeBody(configuration: Configuration) -> some View {
        PrimaryBody(configuration: configuration, fill: fill, height: height)
    }

    private struct PrimaryBody: View {
        let configuration: Configuration
        let fill: Color
        let height: CGFloat
        @Environment(\.isEnabled) var isEnabled

        var body: some View {
            configuration.label
                .font(Theme.body(17, .bold))
                .foregroundStyle(Color.black)
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .background(fill.opacity(isEnabled ? 1 : 0.4), in: Capsule())
                .shadow(color: fill.opacity(isEnabled ? 0.35 : 0), radius: 16, y: 4)
                .scaleEffect(configuration.isPressed ? 0.97 : 1)
                .animation(.snappy(duration: 0.15), value: configuration.isPressed)
        }
    }
}

/// The grey capsule button.
struct SecondaryButtonStyle: ButtonStyle {
    var height: CGFloat = 50

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.body(15, .semibold))
            .foregroundStyle(Theme.text)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(Color.white.opacity(configuration.isPressed ? 0.2 : 0.12), in: Capsule())
    }
}

/// Label and icon of a button, with the icon after the text.
struct ButtonLabel: View {
    let text: String
    var icon: String? = nil
    var isLoading = false

    var body: some View {
        HStack(spacing: 8) {
            Text(text)
            if isLoading {
                ProgressView().tint(.black)
            } else if let icon {
                Image(systemName: icon).font(.system(size: 15, weight: .bold))
            }
        }
    }
}

/// A small uppercase label.
struct Eyebrow: View {
    let text: String
    var color: Color = Theme.secondary

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.4)
            .foregroundStyle(color)
    }
}

/// A section title.
struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text).font(Theme.title(22)).foregroundStyle(Theme.text)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Three stars for the overall rating (0–3).
struct Stars: View {
    let rating: Int
    var size: CGFloat = 13
    var empty: Color = .white.opacity(0.2)
    var glow = false

    var body: some View {
        HStack(spacing: size * 0.2) {
            ForEach(0..<3, id: \.self) { index in
                Image(systemName: "star.fill")
                    .font(.system(size: size))
                    .foregroundStyle(index < rating ? Theme.amber : empty)
                    .shadow(color: glow && index < rating ? Theme.amber.opacity(0.7) : .clear, radius: size * 0.5)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Betyg \(rating) av 3, \(Formatting.ratingWord(rating))"))
    }
}

/// Stars and the rating word, for example "★★☆ Riktigt bra".
struct RatingLine: View {
    let rating: Int
    var size: CGFloat = 13
    var wordColor: Color = Theme.secondary
    var glow = false

    var body: some View {
        HStack(spacing: 6) {
            Stars(rating: rating, size: size, glow: glow)
            Text(Formatting.ratingWord(rating))
                .font(.system(size: size - 1, weight: .semibold))
                .foregroundStyle(wordColor)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Betyg \(rating) av 3, \(Formatting.ratingWord(rating))"))
    }
}

/// A beer price in large rounded numbers, `74 kr` or `74 kr*` for happy hour.
struct PriceLabel: View {
    let priceKr: Int?
    var isHappyHour = false
    var size: CGFloat = 40
    var color: Color = Theme.amber
    var glow = true

    var body: some View {
        if let priceKr, Formatting.beerPrice(priceKr, isHappyHour: isHappyHour) != nil {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: "\(priceKr)").font(Theme.num(size))
                Text(verbatim: isHappyHour ? "kr*" : "kr").font(Theme.num(size * 0.4))
            }
            .foregroundStyle(color)
            .glow(glow, color: color)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(isHappyHour ? "\(priceKr) kronor, happy hour-pris" : "\(priceKr) kronor"))
        } else {
            Text(verbatim: "–").font(Theme.num(size)).foregroundStyle(Theme.tertiary)
                .accessibilityLabel(Text("Pris saknas"))
        }
    }
}

/// A round avatar with the first letter of a name.
struct Avatar: View {
    let name: String
    var size: CGFloat = 30
    var dimmed = false

    var body: some View {
        Text(String(name.prefix(1)).uppercased())
            .font(.system(size: size * 0.44, weight: .bold))
            .foregroundStyle(.black)
            .frame(width: size, height: size)
            .background(Circle().fill(Theme.avatarColor(for: name)))
            .overlay(Circle().strokeBorder(.black.opacity(0.55), lineWidth: 1.5))
            .opacity(dimmed ? 0.35 : 1)
            .accessibilityHidden(true)
    }
}

/// Overlapping avatars and "av Victor, Jonathan & Theo".
struct ReviewerLine: View {
    let names: [String]
    var text: Color = .white
    var secondary: Color = .white.opacity(0.7)
    var avatarSize: CGFloat = 24
    var showNames = true

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: -avatarSize * 0.3) {
                ForEach(names.prefix(4), id: \.self) { Avatar(name: $0, size: avatarSize) }
                if names.count > 4 {
                    Text(verbatim: "+\(names.count - 4)")
                        .font(.system(size: avatarSize * 0.42, weight: .bold)).foregroundStyle(.white)
                        .frame(width: avatarSize, height: avatarSize)
                        .background(Circle().fill(.black.opacity(0.6)))
                }
            }
            if showNames {
                Text("\(Text("av ").foregroundStyle(secondary))\(Text(Formatting.authorList(names)).foregroundStyle(text))")
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("av \(Formatting.authorList(names))"))
    }
}

/// "UTKAST" with a lock.
struct DraftTag: View {
    var onPhoto = false

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "lock.fill").font(.system(size: 10, weight: .bold))
            Text("UTKAST").font(.system(size: 11, weight: .heavy)).tracking(1.1)
        }
        .foregroundStyle(onPhoto ? Color.black : Theme.amber)
        .padding(.horizontal, 10)
        .frame(height: 26)
        .background(onPhoto ? Theme.amber : Theme.amber.opacity(0.14), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Utkast"))
    }
}

/// Bar attributes as small capsules.
struct AttributeTags: View {
    let labels: [String]

    var body: some View {
        if !labels.isEmpty {
            FlowLayout(spacing: 8) {
                ForEach(labels, id: \.self) { label in
                    Text(label)
                        .font(Theme.label(13))
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 12)
                        .frame(height: 30)
                        .background(Color.white.opacity(0.1), in: Capsule())
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(Text("Aktiviteter och utbud: \(labels.joined(separator: ", "))"))
        }
    }
}

/// A glass capsule message, for example after a publication.
struct Toast: View {
    let text: String
    var icon: String? = nil
    var avatar: String? = nil

    var body: some View {
        HStack(spacing: 8) {
            if let avatar {
                Avatar(name: avatar, size: 24)
            } else if let icon {
                Image(systemName: icon).font(.system(size: 17)).foregroundStyle(Theme.amber)
            }
            Text(text).font(Theme.body(14, .semibold)).foregroundStyle(.white)
        }
        .padding(.leading, avatar == nil ? 16 : 7)
        .padding(.trailing, 16)
        .frame(height: 42)
        .glassEffect(.regular, in: .capsule)
        .accessibilityElement(children: .combine)
    }
}

/// A non-blocking error with an optional retry button.
struct ErrorCard: View {
    let message: String
    var retry: (() async -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.bad)
            VStack(alignment: .leading, spacing: 8) {
                Text(message).font(Theme.body(14)).foregroundStyle(Theme.text)
                if let retry {
                    Button("Försök igen") { Task { await retry() } }
                        .font(Theme.body(14, .semibold))
                        .tint(Theme.amber)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.bad.opacity(0.12), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// An icon, a title, and a message for an empty list.
struct EmptyState: View {
    let icon: String
    let title: String
    var message: String? = nil

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 34, weight: .semibold)).foregroundStyle(Theme.tertiary)
            Text(title).font(Theme.body(17, .bold)).foregroundStyle(Theme.text)
            if let message {
                Text(message).font(Theme.body(14)).foregroundStyle(Theme.secondary).multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// A text field in the dark box of the design, with an amber ring on focus and a red ring on error.
struct ThemedTextField: View {
    let placeholder: String
    @Binding var text: String
    var icon: String? = nil
    var error: String? = nil
    var isSecure = false
    var axis: Axis = .horizontal
    var fill: Color = Theme.raised2
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 10) {
                if let icon {
                    Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.secondary)
                }
                Group {
                    if isSecure {
                        SecureField(placeholder, text: $text)
                    } else {
                        TextField(placeholder, text: $text, axis: axis)
                            .lineLimit(axis == .vertical ? 3...8 : 1...1)
                    }
                }
                .font(Theme.body(17))
                .foregroundStyle(Theme.text)
                .tint(Theme.amber)
                .focused($isFocused)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, axis == .vertical ? 16 : 0)
            .frame(minHeight: 54)
            .background(fill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(error != nil ? Theme.bad : (isFocused ? Theme.amber : .clear), lineWidth: 2)
            }
            .contentShape(Rectangle())
            .onTapGesture { isFocused = true }
            if let error {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(Theme.body(13, .medium))
                    .foregroundStyle(Theme.bad)
            }
        }
    }
}

/// A wrapping row of chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            widest = max(widest, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? widest : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

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
                .font(Theme.title(level == 1 ? 22 : level == 2 ? 19 : 17))
                .foregroundStyle(Theme.text)
        case .paragraph(let text):
            InlineMarkdownText(source: text)
                .font(Theme.body(size))
                .foregroundStyle(.white.opacity(0.88))
        case .bulletList(let items):
            list(items) { _ in "•" }
        case .orderedList(let items):
            list(items) { "\($0 + 1)." }
        }
    }

    func list(_ items: [String], marker: @escaping (Int) -> String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(verbatim: marker(index)).font(Theme.num(size)).foregroundStyle(Theme.amber)
                    InlineMarkdownText(source: item)
                        .font(Theme.body(size))
                        .foregroundStyle(.white.opacity(0.88))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

/// One aspect: label, description, value of 5, and five segments.
struct MetricBar: View {
    let label: String
    let hint: String
    let value: Double

    var body: some View {
        let filled = Int(value.rounded())
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(label).font(Theme.body(15, .semibold)).foregroundStyle(.white)
                    Text(hint).font(Theme.body(12)).foregroundStyle(Theme.tertiary)
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(verbatim: Formatting.decimal(value)).font(Theme.num(20)).foregroundStyle(Theme.amber)
                    Text(verbatim: "/5").font(Theme.num(12)).foregroundStyle(Theme.secondary)
                }
            }
            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { index in
                    Capsule()
                        .fill(index < filled ? Theme.amber : Color.white.opacity(0.1))
                        .frame(height: 7)
                        .shadow(color: index < filled ? Theme.amber.opacity(0.4) : .clear, radius: 4)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("\(label): \(Formatting.decimal(value)) av 5"))
    }
}
#endif
