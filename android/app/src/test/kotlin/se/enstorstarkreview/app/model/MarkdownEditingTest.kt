package se.enstorstarkreview.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MarkdownEditingTest {
    @Test fun aPrefixGoesAtTheStartOfTheCursorsLine() {
        assertEquals(MarkdownEdit("ett\n- två", 8), MarkdownEditing.toggleLinePrefix("ett\ntvå", 6, "- "))
    }

    @Test fun anExistingPrefixIsRemoved() {
        assertEquals(MarkdownEdit("ett\ntvå", 5), MarkdownEditing.toggleLinePrefix("ett\n- två", 7, "- "))
    }

    /** A heading replaces a list marker instead of stacking on it. */
    @Test fun aHeadingReplacesAListMarker() {
        assertEquals(MarkdownEdit("## Rubrik", 9), MarkdownEditing.toggleLinePrefix("- Rubrik", 8, "## "))
    }

    @Test fun boldWrapsTheSelection() {
        assertEquals(MarkdownEdit("en **fet** text", 10), MarkdownEditing.wrapSelection("en fet text", 3, 6, "**"))
    }

    /** Without a selection, the cursor lands between the markers. */
    @Test fun boldWithoutASelectionPutsTheCursorInside() {
        assertEquals(MarkdownEdit("text ****", 7), MarkdownEditing.wrapSelection("text ", 5, 5, "**"))
    }

    /** A new line at the end of a list item starts the next item. */
    @Test fun aNewLineContinuesTheList() {
        assertEquals(MarkdownEdit("- ett\n- ", 8), MarkdownEditing.continueList("- ett", "- ett\n"))
    }

    /** A new line after an empty item ends the list. */
    @Test fun aNewLineAfterAnEmptyItemEndsTheList() {
        assertEquals(MarkdownEdit("- ett\n", 6), MarkdownEditing.continueList("- ett\n- ", "- ett\n- \n"))
    }

    @Test fun otherTypingIsLeftAlone() {
        assertNull(MarkdownEditing.continueList("ett", "ett\n"))
        assertNull(MarkdownEditing.continueList("- ett", "- etta"))
        assertNull(MarkdownEditing.continueList("- ett", "- ett\n\n"))
    }
}
