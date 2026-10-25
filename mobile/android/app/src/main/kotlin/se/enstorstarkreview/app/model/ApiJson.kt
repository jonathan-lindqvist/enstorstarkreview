package se.enstorstarkreview.app.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.SerializersModule
import se.enstorstarkreview.api.infrastructure.Serializer
import se.enstorstarkreview.api.models.BarAttributeKey
import se.enstorstarkreview.api.models.ImageContentType

/**
 * JSON for the API. Requests leave out null fields: an omitted `slug` keeps deriving it and an
 * omitted `image` keeps the photo. `beer.volumeCl` is the exception, see [ApiClient].
 */
val ApiJson = Json {
    serializersModule = SerializersModule {
        include(Serializer.kotlinxSerializationAdapters)
        // The generated models mark enum elements of sets as contextual.
        contextual(BarAttributeKey::class, BarAttributeKey.serializer())
        contextual(ImageContentType::class, ImageContentType.serializer())
    }
    // A new server field must not break an older app.
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}
