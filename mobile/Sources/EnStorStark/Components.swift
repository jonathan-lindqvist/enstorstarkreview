import SwiftUI
import EnStorStarkModel

/// A photo that fills its frame and keeps the review's focus point visible, like CSS
/// `object-fit: cover` with `object-position: <focusX>% <focusY>%` on the web.
struct FocusedImage: View {
    let url: URL?
    var focusX: Double = 50
    var focusY: Double = 50

    var body: some View {
        Rectangle()
            .fill(Color.secondary.opacity(0.15))
            .overlay {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        FocusedFill(image: image, focusX: focusX, focusY: focusY)
                    } else if phase.error != nil {
                        Image(systemName: "photo")
                            .foregroundStyle(.secondary)
                    } else {
                        ProgressView()
                    }
                }
            }
            .clipped()
    }
}

struct FocusedFill: View {
    let image: Image
    let focusX: Double
    let focusY: Double
    @State var imageSize: CGSize = .zero

    var body: some View {
        GeometryReader { proxy in
            let frame = proxy.size
            image
                .resizable()
                .scaledToFill()
                .onGeometryChange(for: CGSize.self) { $0.size } action: { imageSize = $0 }
                // Move the overflow so the focus point lines up with the same point of the frame.
                .offset(
                    x: max(0, imageSize.width - frame.width) * (0.5 - focusX / 100),
                    y: max(0, imageSize.height - frame.height) * (0.5 - focusY / 100)
                )
                .frame(width: frame.width, height: frame.height)
                .clipped()
        }
    }
}

/// The overall rating, for example `2/3`.
struct RatingBadge: View {
    let rating: Int

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 1) {
            Text(verbatim: "\(rating)")
                .font(.headline)
            Text(verbatim: "/3")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Capsule().fill(Color.secondary.opacity(0.15)))
        #if !os(Android)
        .accessibilityElement(children: .ignore)
        #endif
        .accessibilityLabel(Text("Betyg \(rating) av 3"))
    }
}

struct DraftBadge: View {
    var body: some View {
        Text("Utkast")
            .font(.caption2.weight(.bold))
            .textCase(.uppercase)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(Color.orange)
            .background(Capsule().fill(Color.orange.opacity(0.15)))
    }
}

/// A non-blocking error message with an optional retry button.
struct ErrorBanner: View {
    let message: String
    var retry: (() async -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label {
                Text(message)
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill")
            }
            .foregroundStyle(Color.red)
            if let retry {
                Button("Försök igen") {
                    Task { await retry() }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct EmptyStateView: View {
    let systemImage: String
    let title: LocalizedStringKey
    var message: LocalizedStringKey? = nil

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// Inline Markdown (emphasis, code). Links are removed, like on the web.
struct InlineMarkdownText: View {
    let source: String

    var body: some View {
        #if os(Android)
        Text(verbatim: ReviewMarkdown.stripInline(source))
        #else
        Text(Self.attributed(source))
        #endif
    }

    #if !os(Android)
    static func attributed(_ source: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        guard var result = try? AttributedString(markdown: source, options: options) else {
            return AttributedString(source)
        }
        for run in result.runs where run.link != nil {
            result[run.range].link = nil
        }
        return result
    }
    #endif
}

/// A review description: headings, paragraphs, and lists.
struct ReviewDescriptionView: View {
    let source: String

    var body: some View {
        let blocks = ReviewMarkdown.blocks(source)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text):
            InlineMarkdownText(source: text)
                .font(level == 1 ? .title2.bold() : level == 2 ? .title3.bold() : .headline)
        case .paragraph(let text):
            InlineMarkdownText(source: text)
        case .bulletList(let items):
            listView(items) { _ in "•" }
        case .orderedList(let items):
            listView(items) { index in "\(index + 1)." }
        }
    }

    func listView(_ items: [String], marker: @escaping (Int) -> String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(verbatim: marker(index))
                        .foregroundStyle(.secondary)
                    InlineMarkdownText(source: item)
                }
            }
        }
    }
}

enum ExternalLinks {
    /// Opens the address in the platform's map app.
    static func mapsURL(for address: String) -> URL? {
        #if os(Android)
        var components = URLComponents(string: "https://www.google.com/maps/search/")
        components?.queryItems = [
            URLQueryItem(name: "api", value: "1"),
            URLQueryItem(name: "query", value: address)
        ]
        #else
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "q", value: address)]
        #endif
        return components?.url
    }
}
