package se.enstorstarkreview.app.model

/** The text after an edit, and where the cursor goes. */
data class MarkdownEdit(val text: String, val cursor: Int)

/** The review editor's formatting buttons and list continuation, as in the iOS editor. */
object MarkdownEditing {
    private val linePrefixes = listOf("- ", "## ")

    /** Adds or removes a prefix (`- ` or `## `) at the start of the line with the cursor. */
    fun toggleLinePrefix(text: String, cursor: Int, prefix: String): MarkdownEdit {
        val position = cursor.coerceIn(0, text.length)
        val lineStart = text.lastIndexOf('\n', position - 1) + 1
        val line = text.substring(lineStart).substringBefore('\n')
        val builder = StringBuilder(text)
        var change = 0
        if (line.startsWith(prefix)) {
            builder.delete(lineStart, lineStart + prefix.length)
            change = -prefix.length
        } else {
            linePrefixes.firstOrNull { line.startsWith(it) }?.let {
                builder.delete(lineStart, lineStart + it.length)
                change -= it.length
            }
            builder.insert(lineStart, prefix)
            change += prefix.length
        }
        return MarkdownEdit(builder.toString(), (position + change).coerceIn(0, builder.length))
    }

    /** Puts a marker before and after the selection, or two markers around the cursor. */
    fun wrapSelection(text: String, start: Int, end: Int, marker: String): MarkdownEdit {
        val from = minOf(start, end).coerceIn(0, text.length)
        val to = maxOf(start, end).coerceIn(0, text.length)
        val wrapped = text.substring(0, from) + marker + text.substring(from, to) + marker + text.substring(to)
        return MarkdownEdit(wrapped, if (from == to) from + marker.length else to + marker.length * 2)
    }

    /**
     * After a new line at the end of a list item, starts the next item. A new line after an empty
     * item ends the list. Null when the edit was something else.
     */
    fun continueList(old: String, new: String): MarkdownEdit? {
        if (new.length != old.length + 1) return null
        var position = 0
        while (position < old.length && old[position] == new[position]) position++
        if (new[position] != '\n') return null
        val lineStart = new.lastIndexOf('\n', position - 1) + 1
        val line = new.substring(lineStart, position)
        if (!line.startsWith("- ")) return null
        return if (line.trim() == "-") {
            MarkdownEdit(new.removeRange(lineStart, position + 1), lineStart)
        } else {
            MarkdownEdit(new.substring(0, position + 1) + "- " + new.substring(position + 1), position + 3)
        }
    }
}
