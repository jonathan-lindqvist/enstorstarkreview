package se.enstorstarkreview.app.model

/**
 * Bundled logos for the listed brands, from the web's `static/beer-brands` (see
 * `src/lib/beer-brands.ts`). The API sends brand names only.
 */
object BeerBrandLogo {
    private val resources = mapOf(
        "Norrlands Guld Export" to "brand_norrlands_guld_export",
        "Falcon Export" to "brand_falcon_export",
        "Mariestads Export" to "brand_mariestads_export",
        "Pripps Blå Export" to "brand_pripps_bla_export",
        "Eriksberg Original" to "brand_eriksberg_original",
        "Eriksberg Karaktär" to "brand_eriksberg_karaktar",
        "Åbro Original" to "brand_abro_original",
        "Sofiero Original" to "brand_sofiero_original",
        "Spendrups Premium Gold" to "brand_spendrups_premium_gold",
        "Carlsberg Export" to "brand_carlsberg_export",
        "Heineken" to "brand_heineken",
        "Staropramen" to "brand_staropramen",
        "Grängesberg" to "brand_grangesberg",
        "Ey’Bro" to "brand_ey_bro",
        "Melleruds Utmärkta Pilsner" to "brand_melleruds_utmarkta_pilsner",
    )

    /** The drawable name, or null for a brand without a logo. */
    fun resourceName(brand: String): String? = resources[brand]
}
