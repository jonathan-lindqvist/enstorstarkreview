package se.enstorstarkreview.app.model

import se.enstorstarkreview.api.models.RatingKey

/** A short word for each value 0–5 of an aspect, as in the iOS wizard. */
object RatingWords {
    private val words = mapOf(
        RatingKey.atmosphere to listOf("Död", "Steril", "Sådär", "Trivsam", "Mysig", "Magisk"),
        RatingKey.service to listOf("Ignorerad", "Sur", "Långsam", "Okej", "Snabb", "Stammisvänlig"),
        RatingKey.selection to listOf("Bara en", "Två kranar", "Några", "Bra", "Brett", "Ölhimmel"),
        RatingKey.quality to listOf("Avslagen", "Tunn", "Okej", "God", "Fräsch", "Perfekt"),
        RatingKey.price to listOf("Rån", "Dyrt", "Sådär", "Okej", "Prisvärt", "Fynd"),
        RatingKey.cleanliness to listOf("Kladdigt", "Smutsigt", "Sådär", "Rent", "Skinande", "Kliniskt"),
        RatingKey.soundLevel to listOf("Öronbedövande", "Högljutt", "Livligt", "Sorl", "Lugnt", "Tyst"),
        RatingKey.barhopPotential to listOf("Återvändsgränd", "Långt bort", "Sådär", "Nära till mer", "Bra nav", "Mitt i smeten"),
    )

    fun word(key: RatingKey, value: Int): String = words.getValue(key)[clamp(value)]

    fun clamp(value: Int): Int = value.coerceIn(0, 5)
}
