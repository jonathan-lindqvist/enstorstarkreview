import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
import EnStorStarkModel

/// A review photo that fills its frame and keeps the focus point visible, like CSS
/// `object-fit: cover` with `object-position: <focusX>% <focusY>%` on the web.
///
/// It loads through `APIClient`, because photos of drafts need the token.
struct FocusedImage: View {
    let path: String
    var focusX: Double = 50
    var focusY: Double = 50
    @Environment(AppModel.self) var app
    @State var image: Image?
    @State var failed = false

    var body: some View {
        Rectangle()
            .fill(Color.secondary.opacity(0.15))
            .overlay {
                if let image {
                    FocusedFill(image: image, focusX: focusX, focusY: focusY)
                } else if failed {
                    if let symbol = Symbol.imageUnavailable {
                        Image(systemName: symbol)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    ProgressView()
                }
            }
            .clipped()
            .task(id: path) {
                await load()
            }
    }

    func load() async {
        do {
            let data = try await app.api.imageData(path: path)
            if let uiImage = UIImage(data: data) {
                image = Image(uiImage: uiImage)
                failed = false
            } else {
                failed = true
            }
        } catch APIError.cancelled {
            // The row scrolled away.
        } catch {
            failed = true
        }
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

/// SF Symbol names for icons that SkipUI cannot show on Android. Skip maps only a fixed set of
/// symbol names to Material icons and shows a warning triangle for the others, so Android uses
/// the nearest supported name, or no icon (`nil`) when no supported icon fits.
enum Symbol {
    #if os(Android)
    static let map = "mappin.circle"
    static let statistics = "chart.bar.xaxis"
    static let location = "mappin.circle"
    static let sort = "ellipsis"
    static let signedIn = "person.crop.circle"
    static let imageUnavailable: String? = nil
    static let pickImage: String? = nil
    static let takePhoto: String? = nil
    static let history: String? = nil
    #else
    static let map = "map"
    static let statistics = "chart.bar"
    static let location = "mappin.and.ellipse"
    static let sort = "arrow.up.arrow.down"
    static let signedIn = "person.crop.circle.badge.checkmark"
    static let imageUnavailable: String? = "photo"
    static let pickImage: String? = "photo.on.rectangle"
    static let takePhoto: String? = "camera"
    static let history: String? = "clock.arrow.circlepath"
    #endif
}

/// A `Label` whose icon is optional; without an icon it shows only the title.
struct SymbolLabel: View {
    let title: LocalizedStringKey
    let systemImage: String?

    init(_ title: LocalizedStringKey, systemImage: String?) {
        self.title = title
        self.systemImage = systemImage
    }

    var body: some View {
        if let systemImage {
            Label(title, systemImage: systemImage)
        } else {
            Text(title)
        }
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
