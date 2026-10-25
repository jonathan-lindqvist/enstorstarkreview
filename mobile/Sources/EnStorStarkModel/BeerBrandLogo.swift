import Foundation

/// Bundled logos for the listed brands, from the web's `static/beer-brands` (see
/// `src/lib/beer-brands.ts`). The API sends brand names only.
public enum BeerBrandLogo {
    static let assetNames: [String: String] = [
        "Norrlands Guld Export": "Brand/norrlands-guld-export",
        "Falcon Export": "Brand/falcon-export",
        "Mariestads Export": "Brand/mariestads-export",
        "Pripps Blå Export": "Brand/pripps-bla-export",
        "Eriksberg Original": "Brand/eriksberg-original",
        "Eriksberg Karaktär": "Brand/eriksberg-karaktar",
        "Åbro Original": "Brand/abro-original",
        "Sofiero Original": "Brand/sofiero-original",
        "Spendrups Premium Gold": "Brand/spendrups-premium-gold",
        "Carlsberg Export": "Brand/carlsberg-export",
        "Heineken": "Brand/heineken",
        "Staropramen": "Brand/staropramen",
        "Grängesberg": "Brand/grangesberg",
        "Ey’Bro": "Brand/ey-bro",
        "Melleruds Utmärkta Pilsner": "Brand/melleruds-utmarkta-pilsner",
    ]

    /// The asset catalog name, or nil for a brand without a logo.
    public static func assetName(for brand: String) -> String? {
        assetNames[brand]
    }
}
