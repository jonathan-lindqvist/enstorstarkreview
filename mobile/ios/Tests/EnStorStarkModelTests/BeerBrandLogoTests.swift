import Foundation
import Testing
@testable import EnStorStarkModel

@Suite struct BeerBrandLogoTests {
    static let metadata = try! JSONDecoder().decode(MetadataBrands.self, from: Fixture.data("review-metadata"))
    struct MetadataBrands: Decodable { var beerBrands: [String] }

    static let catalog = URL(filePath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appending(path: "Sources/EnStorStark/Resources/Module.xcassets")

    /// Every brand the API offers has a bundled logo, like the web's static/beer-brands.
    @Test(arguments: metadata.beerBrands)
    func everyListedBrandHasABundledLogo(brand: String) throws {
        let name = try #require(BeerBrandLogo.assetName(for: brand))
        let imageset = Self.catalog.appending(path: "\(name).imageset/Contents.json")
        #expect(FileManager.default.fileExists(atPath: imageset.path()))
    }

    @Test func otherBrandsHaveNoLogo() {
        #expect(BeerBrandLogo.assetName(for: "Husets stora stark") == nil)
        #expect(BeerBrandLogo.assetName(for: "") == nil)
    }
}
