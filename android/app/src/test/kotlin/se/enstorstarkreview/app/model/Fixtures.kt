package se.enstorstarkreview.app.model

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/** API responses captured from the local server, shared with the iOS model tests. */
object Fixtures {
    fun text(name: String): String =
        checkNotNull(Fixtures::class.java.getResource("/$name.json")) { "Missing fixture $name" }.readText()

    fun json(name: String): JsonObject = ApiJson.parseToJsonElement(text(name)).jsonObject
}
