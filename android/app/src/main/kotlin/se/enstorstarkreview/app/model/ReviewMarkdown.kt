package se.enstorstarkreview.app.model

/** A block of a review description. */
sealed interface MarkdownBlock {
    data class Heading(val level: Int, val text: String) : MarkdownBlock

    /** Lines keep their line breaks (the web renders with `breaks: true`). */
    data class Paragraph(val text: String) : MarkdownBlock
    data class BulletList(val items: List<String>) : MarkdownBlock
    data class OrderedList(val items: List<String>) : MarkdownBlock
}

enum class InlineStyle { Plain, Bold, Italic, Code }

/** A run of text with one inline style. */
data class InlineSpan(val text: String, val style: InlineStyle)

/**
 * Splits review Markdown into blocks, like the iOS app. The web renders descriptions with
 * markdown-it: headings, paragraphs, lists, and inline emphasis; no links, images, or HTML.
 */
object ReviewMarkdown {
    fun blocks(source: String): List<MarkdownBlock> {
        val blocks = mutableListOf<MarkdownBlock>()
        val paragraph = mutableListOf<String>()
        val bullets = mutableListOf<String>()
        val ordered = mutableListOf<String>()
        fun flush() {
            if (paragraph.isNotEmpty()) blocks += MarkdownBlock.Paragraph(paragraph.joinToString("\n")).also { paragraph.clear() }
            if (bullets.isNotEmpty()) blocks += MarkdownBlock.BulletList(bullets.toList()).also { bullets.clear() }
            if (ordered.isNotEmpty()) blocks += MarkdownBlock.OrderedList(ordered.toList()).also { ordered.clear() }
        }
        for (raw in source.replace("\r\n", "\n").split("\n")) {
            val line = raw.trim()
            val heading = heading(line)
            val bullet = bulletItem(line)
            val numbered = orderedItem(line)
            when {
                line.isEmpty() -> flush()
                heading != null -> { flush(); blocks += heading }
                bullet != null -> { if (bullets.isEmpty()) flush(); bullets += bullet }
                numbered != null -> { if (ordered.isEmpty()) flush(); ordered += numbered }
                // A continuation line belongs to the last list item.
                bullets.isNotEmpty() -> bullets[bullets.lastIndex] += "\n$line"
                ordered.isNotEmpty() -> ordered[ordered.lastIndex] += "\n$line"
                else -> paragraph += line
            }
        }
        flush()
        return blocks
    }

    /** The description as one line of plain text, for list previews. */
    fun plainText(source: String): String = blocks(source).joinToString(" ") { block ->
        when (block) {
            is MarkdownBlock.Heading -> block.text
            is MarkdownBlock.Paragraph -> block.text
            is MarkdownBlock.BulletList -> block.items.joinToString(" · ")
            is MarkdownBlock.OrderedList -> block.items.joinToString(" · ")
        }
    }.replace("\n", " ").let(::stripInline)

    /**
     * Inline emphasis and code. Unclosed markers stay text, `_` inside a word is not emphasis,
     * and links stay literal text, as on the web.
     */
    fun inline(text: String): List<InlineSpan> {
        val spans = mutableListOf<InlineSpan>()
        val plain = StringBuilder()
        fun add(span: InlineSpan) {
            if (plain.isNotEmpty()) spans += InlineSpan(plain.toString(), InlineStyle.Plain).also { plain.clear() }
            spans += span
        }
        var index = 0
        while (index < text.length) {
            val marker = markers.firstOrNull { text.startsWith(it.first, index) }
            val end = marker?.let { closing(text, index, it.first) } ?: -1
            if (marker != null && end > index + marker.first.length) {
                add(InlineSpan(text.substring(index + marker.first.length, end), marker.second))
                index = end + marker.first.length
            } else {
                plain.append(text[index])
                index++
            }
        }
        if (plain.isNotEmpty()) spans += InlineSpan(plain.toString(), InlineStyle.Plain)
        return spans
    }

    private val markers = listOf("**" to InlineStyle.Bold, "__" to InlineStyle.Bold, "*" to InlineStyle.Italic, "_" to InlineStyle.Italic, "`" to InlineStyle.Code)

    /** The index of the closing [marker] for one opening at [start], or -1. */
    private fun closing(text: String, start: Int, marker: String): Int {
        val contentStart = start + marker.length
        // An opening marker needs text right after it, and `_` must start a word.
        if (contentStart >= text.length || text[contentStart].isWhitespace()) return -1
        if (marker.startsWith("_") && start > 0 && text[start - 1].isLetterOrDigit()) return -1
        var end = text.indexOf(marker, contentStart)
        while (end != -1) {
            val after = end + marker.length
            val closesWord = !marker.startsWith("_") || after >= text.length || !text[after].isLetterOrDigit()
            if (!text[end - 1].isWhitespace() && closesWord) return end
            end = text.indexOf(marker, end + 1)
        }
        return -1
    }

    /** Removes the emphasis and code markers that are not rendered. */
    fun stripInline(text: String): String = text.replace("**", "").replace("__", "").replace("`", "")

    private fun heading(line: String): MarkdownBlock? {
        val hashes = line.takeWhile { it == '#' }.length
        if (hashes !in 1..6) return null
        val rest = line.drop(hashes)
        if (!rest.startsWith(" ")) return null
        return MarkdownBlock.Heading(hashes, rest.trim().trim('#').trim())
    }

    private fun bulletItem(line: String): String? =
        listOf("- ", "* ", "+ ").firstOrNull { line.startsWith(it) }?.let { line.drop(it.length) }

    private fun orderedItem(line: String): String? {
        val digits = line.takeWhile { it in '0'..'9' }
        if (digits.isEmpty() || digits.length > 9) return null
        val rest = line.drop(digits.length)
        return if (rest.startsWith(". ") || rest.startsWith(") ")) rest.drop(2) else null
    }
}
