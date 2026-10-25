package se.enstorstarkreview.app.model

import org.junit.Assert.assertEquals
import org.junit.Test
import se.enstorstarkreview.api.models.RatingKey

class RatingWordsTest {
    /** Every aspect has a word for each value 0–5, as on iOS. */
    @Test fun everyAspectHasSixWords() {
        assertEquals("Död", RatingWords.word(RatingKey.atmosphere, 0))
        assertEquals("Magisk", RatingWords.word(RatingKey.atmosphere, 5))
        assertEquals("Öronbedövande", RatingWords.word(RatingKey.soundLevel, 0))
        assertEquals("Mitt i smeten", RatingWords.word(RatingKey.barhopPotential, 5))
        RatingKey.entries.forEach { key -> assertEquals(6, (0..5).map { RatingWords.word(key, it) }.filter { it.isNotEmpty() }.distinct().size) }
    }

    /** Out-of-range values clamp to 0–5. */
    @Test fun valuesClamp() {
        assertEquals("Fynd", RatingWords.word(RatingKey.price, 9))
        assertEquals("Rån", RatingWords.word(RatingKey.price, -1))
    }
}
