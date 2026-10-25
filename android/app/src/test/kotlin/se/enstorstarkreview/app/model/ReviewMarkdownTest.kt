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
