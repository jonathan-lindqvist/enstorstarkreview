import Foundation

/// A block of a review description.
public enum MarkdownBlock: Hashable, Sendable {
    case heading(level: Int, text: String)
    /// Lines in a paragraph keep their line breaks (the web renders with `breaks: true`).
    case paragraph(String)
    case bulletList([String])
    case orderedList([String])
}

/// Splits review Markdown into blocks.
///
/// The web renders descriptions with markdown-it: headings, paragraphs, lists, and inline
/// emphasis. Links, images, and raw HTML are not supported. SwiftUI `Text` renders inline
/// Markdown but not blocks, so the app splits the blocks here and renders each block as text.
public enum ReviewMarkdown {
    public static func blocks(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var bullets: [String] = []
        var ordered: [String] = []

        func flush() {
            if !paragraph.isEmpty {
                blocks.append(.paragraph(paragraph.joined(separator: "\n")))
                paragraph = []
            }
            if !bullets.isEmpty {
                blocks.append(.bulletList(bullets))
                bullets = []
            }
            if !ordered.isEmpty {
                blocks.append(.orderedList(ordered))
                ordered = []
            }
        }

        let lines = source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        for rawLine in lines {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty {
                flush()
            } else if let heading = heading(line) {
                flush()
                blocks.append(heading)
            } else if let item = bulletItem(line) {
                if bullets.isEmpty { flush() }
                bullets.append(item)
            } else if let item = orderedItem(line) {
                if ordered.isEmpty { flush() }
                ordered.append(item)
            } else if !bullets.isEmpty || !ordered.isEmpty {
                // A continuation line belongs to the last list item.
                if !bullets.isEmpty {
                    bullets[bullets.count - 1] += "\n" + line
                } else {
                    ordered[ordered.count - 1] += "\n" + line
                }
            } else {
                paragraph.append(line)
            }
        }
        flush()
        return blocks
    }

    /// The description as one line of plain text, for list previews.
    public static func plainText(_ source: String) -> String {
        blocks(source).map { block -> String in
            switch block {
            case .heading(_, let text), .paragraph(let text): return text
            case .bulletList(let items), .orderedList(let items): return items.joined(separator: " · ")
            }
        }
        .joined(separator: " ")
        .replacingOccurrences(of: "\n", with: " ")
        .strippingInlineMarkdown
    }

    /// Removes inline emphasis and code markers. Used where the platform cannot render
    /// inline Markdown.
    public static func stripInline(_ text: String) -> String {
        text.strippingInlineMarkdown
    }

    private static func heading(_ line: String) -> MarkdownBlock? {
        let hashes = line.prefix { $0 == "#" }.count
        guard (1...6).contains(hashes) else { return nil }
        let rest = line.dropFirst(hashes)
        guard rest.first == " " else { return nil }
        let text = rest.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        return .heading(level: hashes, text: text.trimmingCharacters(in: .whitespaces))
    }

    private static func bulletItem(_ line: String) -> String? {
        for marker in ["- ", "* ", "+ "] where line.hasPrefix(marker) {
            return String(line.dropFirst(marker.count))
        }
        return nil
    }

    private static func orderedItem(_ line: String) -> String? {
        let digits = line.prefix { $0.isASCII && $0.isNumber }
        guard !digits.isEmpty, digits.count <= 9 else { return nil }
        let rest = line.dropFirst(digits.count)
        guard rest.hasPrefix(". ") || rest.hasPrefix(") ") else { return nil }
        return String(rest.dropFirst(2))
    }
}

extension String {
    fileprivate var strippingInlineMarkdown: String {
        replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "__", with: "")
            .replacingOccurrences(of: "`", with: "")
    }
}
