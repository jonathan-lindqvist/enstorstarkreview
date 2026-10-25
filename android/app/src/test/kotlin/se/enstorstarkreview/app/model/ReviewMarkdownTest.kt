package se.enstorstarkreview.app.model

import org.junit.Assert.assertEquals
import org.junit.Test

class ReviewMarkdownTest {
    @Test fun splitsHeadingsParagraphsAndLists() {
        val blocks = ReviewMarkdown.blocks("# Rubrik\nEn rad\nTill\n\n- ett\n- två\nfortsätter\n\n1. först")
        assertEquals(
            listOf(
                MarkdownBlock.Heading(1, "Rubrik"),
                MarkdownBlock.Paragraph("En rad\nTill"),
                MarkdownBlock.BulletList(listOf("ett", "två\nfortsätter")),
                MarkdownBlock.OrderedList(listOf("först")),
            ),
            blocks,
        )
    }

    @Test fun plainTextJoinsListItemsAndDropsEmphasis() {
        assertEquals("Mysigt **ställe** · Bra öl".replace("**", ""), ReviewMarkdown.plainText("- Mysigt **ställe**\n- Bra öl"))
    }
}

class InlineMarkdownTest {
    private fun spans(text: String) = ReviewMarkdown.inline(text).map { it.text to it.style }

    @Test fun plainTextIsOneSpan() {
        assertEquals(listOf("Mysig lokal" to InlineStyle.Plain), spans("Mysig lokal"))
    }

    @Test fun boldItalicAndCode() {
        assertEquals(
            listOf("Riktigt " to InlineStyle.Plain, "bra" to InlineStyle.Bold, " och " to InlineStyle.Plain,
                "billig" to InlineStyle.Italic, " " to InlineStyle.Plain, "öl" to InlineStyle.Code),
            spans("Riktigt **bra** och *billig* `öl`"),
        )
        assertEquals(listOf("fet" to InlineStyle.Bold, " " to InlineStyle.Plain, "kursiv" to InlineStyle.Italic), spans("__fet__ _kursiv_"))
    }

    /** An unclosed marker is text, and links are not rendered (the web disables them). */
    @Test fun unclosedMarkersAndLinksStayText() {
        assertEquals(listOf("2 * 3 = 6" to InlineStyle.Plain), spans("2 * 3 = 6"))
        assertEquals(listOf("**halv" to InlineStyle.Plain), spans("**halv"))
        assertEquals(listOf("[länk](https://x.se)" to InlineStyle.Plain), spans("[länk](https://x.se)"))
    }

    /** Snake_case inside words is not emphasis. */
    @Test fun underscoresInsideWordsStay() {
        assertEquals(listOf("snake_case_namn" to InlineStyle.Plain), spans("snake_case_namn"))
    }
}
