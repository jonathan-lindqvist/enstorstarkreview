package se.enstorstarkreview.app.model

/** A block of a review description. */
sealed interface MarkdownBlock {
    data class Heading(val level: Int, val text: String) : MarkdownBlock

    /** Lines keep their line breaks (the web renders with `breaks: true`). */
    data class Paragraph(val text: String) : MarkdownBlock
    data class BulletList(val items: List<String>) : MarkdownBlock
    data class OrderedList(val items: List<String>) : MarkdownBlock
}

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
