package se.enstorstarkreview.app.model

import java.io.File
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BeerBrandLogoTest {
    /** Every brand the API offers has a bundled logo, like the web's static/beer-brands. */
    @Test fun everyListedBrandHasABundledLogo() {
        val brands = Fixtures.json("review-metadata").getValue("beerBrands").jsonArray.map { it.jsonPrimitive.content }
        brands.forEach { brand ->
            val name = BeerBrandLogo.resourceName(brand) ?: error("No logo for $brand")
            assertTrue("Missing drawable $name", File("src/main/res/drawable-nodpi/$name.png").exists())
        }
    }

    @Test fun otherBrandsHaveNoLogo() {
        assertNull(BeerBrandLogo.resourceName("Husets stora stark"))
        assertNull(BeerBrandLogo.resourceName(""))
    }
}
