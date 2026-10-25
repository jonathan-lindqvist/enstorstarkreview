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
    let preview: APIClient.ImagePreview
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
                    Image(systemName: "photo")
                        .foregroundStyle(.secondary)
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
            let data = try await app.api.imageData(path: path, preview: preview)
            if let uiImage = await DisplayImage.decode(data) {
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

/// Keeps decoded photos small enough to hold in memory. Uploaded originals reach 8160 × 6144
/// pixels, about 200 MB as a bitmap. Server previews are already small; this also covers picked
/// photos and any original that is still decoded.
enum DisplayImage {
    /// About 20 MB as a bitmap.
    static let maxDimension: CGFloat = 2560

    static func limited(_ image: UIImage) -> UIImage {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > maxDimension else { return image }
        let scale = maxDimension / longest
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        return image.preparingThumbnail(of: target) ?? image
    }

    /// Decodes and limits a photo off the main thread; a large original takes a while to decode.
    static func decode(_ data: Data) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            UIImage(data: data).map(limited)
        }.value
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
        Text(Self.attributed(source))
    }

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
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "q", value: address)]
        return components?.url
    }
}

/// A field message under a form field.
struct FieldError: View {
    let message: String?

    var body: some View {
        if let message {
            Text(message)
                .font(.caption)
                .foregroundStyle(Color.red)
        }
    }
}
