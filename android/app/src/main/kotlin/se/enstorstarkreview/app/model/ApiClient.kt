package se.enstorstarkreview.app.model

import java.io.IOException
import kotlin.coroutines.resumeWithException
import kotlin.io.encoding.Base64
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.serializer
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import se.enstorstarkreview.api.models.ImageContentType
import se.enstorstarkreview.api.models.NearbyReviews
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewFields
import se.enstorstarkreview.api.models.ReviewHistory
import se.enstorstarkreview.api.models.ReviewList
import se.enstorstarkreview.api.models.ReviewMap
import se.enstorstarkreview.api.models.ReviewMetadata
import se.enstorstarkreview.api.models.ReviewRequestAccepted
import se.enstorstarkreview.api.models.ReviewSort
import se.enstorstarkreview.api.models.ReviewStatistics
import se.enstorstarkreview.api.models.Session
import se.enstorstarkreview.api.models.SessionCreated
import se.enstorstarkreview.api.models.UserList

/** A response value with the `ETag` that the server sent for it. */
data class Tagged<T>(val value: T, val eTag: String?)

/** A photo to upload: JPEG, PNG, or WebP bytes. */
class ImageUploadData(val bytes: ByteArray, val contentType: String)

/** A server-scaled WebP copy of a review photo (see `getImage` in the contract). */
enum class ImagePreview(val value: String) {
    /** At most 768 pixels wide, for list rows and cards. */
    Card("card-v1"),

    /** At most 1280 pixels wide, for detail screens and the review form. */
    Detail("detail-v1"),
}

/**
 * An `application/problem+json` response. `code` is a string, so a new server code does not
 * make the error undecodable.
 */
@Serializable
data class ApiProblem(
    val status: Int,
    val code: String,
    val title: String = "",
    val detail: String,
    val errors: List<FieldError>? = null,
) {
    @Serializable
    data class FieldError(val pointer: String, val detail: String)

    /** The field messages keyed by JSON Pointer, for example `/beer/priceKr`. */
    val fieldErrors: Map<String, String>
        get() = buildMap { errors.orEmpty().forEach { if (it.pointer !in this) put(it.pointer, it.detail) } }

    val isConflict: Boolean get() = code == "precondition_failed" || code == "concurrent_update"
}

/** The errors that [ApiClient] throws. The message is Swedish and can be shown as is. */
sealed class ApiException(message: String) : Exception(message) {
    class Problem(val problem: ApiProblem) : ApiException(problem.detail)
    class Transport(cause: Throwable) : ApiException("Kunde inte nå servern. Kontrollera anslutningen och försök igen.") {
        init { initCause(cause) }
    }
    class InvalidResponse(val reason: String) : ApiException("Servern skickade ett oväntat svar.")

    val problemOrNull: ApiProblem? get() = (this as? Problem)?.problem
}

/** Holds the bearer token. The API ignores cookies, so this is the only credential. */
class TokenBox {
    @Volatile var token: String? = null
    @Volatile var onUnauthorized: (() -> Unit)? = null

    /**
     * Clears the token after a 401, but only when it is still the token that the failed request
     * sent. A late 401 from an old session must not sign out a new one.
     */
    fun expire(sentToken: String) {
        val expired = synchronized(this) {
            if (token != sentToken) return
            token = null
            true
        }
        if (expired) onUnauthorized?.invoke()
    }
}

/**
 * The app's entry point to the JSON API (`/api/v1`). Methods throw [ApiException]. The device
 * location is never sent to the API.
 */
class ApiClient(val serverOrigin: String, http: OkHttpClient = OkHttpClient()) {
    val tokens = TokenBox()
    private val apiBase: HttpUrl = "$serverOrigin/api/v1/".toHttpUrl()

    var token: String?
        get() = tokens.token
        set(value) { tokens.token = value }

    /** Called when the server rejects the token. The token is already cleared. */
    var onUnauthorized: (() -> Unit)?
        get() = tokens.onUnauthorized
        set(value) { tokens.onUnauthorized = value }

    /** Also used for review photos: drafts need the token. */
    val http: OkHttpClient = http.newBuilder().addInterceptor(AuthInterceptor(tokens)).build()

    // Reader endpoints

    suspend fun reviewMetadata(): ReviewMetadata = get("review-metadata")

    suspend fun reviews(search: String? = null, sort: ReviewSort = ReviewSort.latest): List<Review> =
        get<ReviewList>("reviews") {
            addQueryParameter("sort", sort.value)
            search?.trim()?.takeIf { it.isNotEmpty() }?.let { addQueryParameter("search", it) }
        }.reviews

    /** The review and its `ETag`. Send the `ETag` as `If-Match` when you edit it. */
    suspend fun review(slug: String): Tagged<Review> = tagged(request(url("reviews", slug)).build())

    suspend fun reviewHistory(slug: String): ReviewHistory = get(url("reviews", slug, "history"))

    suspend fun map(): ReviewMap = get("map")

    suspend fun statistics(): ReviewStatistics = get("statistics")

    /** Sends a "tipsa om en bar" request. Returns the Swedish confirmation. */
    suspend fun submitReviewRequest(barName: String, location: String, motivation: String?): String {
        val body = JsonObject(buildMap {
            put("barName", JsonPrimitive(barName))
            put("location", JsonPrimitive(location))
            motivation?.takeIf { it.isNotEmpty() }?.let { put("motivation", JsonPrimitive(it)) }
        })
        return send<ReviewRequestAccepted>(request(url("review-requests")).post(body.toRequestBody()).build()).message
    }

    /** A review photo URL; pass a preview for anything on screen, originals can be huge. */
    fun imageUrl(path: String, preview: ImagePreview): String =
        serverOrigin.toHttpUrl().resolve(path)!!.newBuilder().addQueryParameter("preview", preview.value).build().toString()

    /** The web page of a review, for sharing. */
    fun webUrl(slug: String): String = serverOrigin.toHttpUrl().newBuilder().addPathSegment(slug).build().toString()

    // Sessions

    data class SignedIn(val username: String, val token: String)

    /** Signs in. The caller stores the token and sets [token]. */
    suspend fun signIn(username: String, password: String): SignedIn {
        val body = JsonObject(mapOf("username" to JsonPrimitive(username), "password" to JsonPrimitive(password)))
        val created = send<SessionCreated>(request(url("sessions")).post(body.toRequestBody()).build())
        return SignedIn(created.user.username, created.token)
    }

    /** Checks the token. Throws a 401 problem when it is not valid. */
    suspend fun currentUsername(): String = get<Session>(url("sessions", "current")).user.username

    /** Invalidates the token on the server. */
    suspend fun signOut() {
        execute(request(url("sessions", "current")).delete().build()).close()
    }

    // Reviewer endpoints

    /** Reviewer usernames for the author picker, in Swedish order. */
    suspend fun users(): List<String> = get<UserList>("users").users.map { it.username }

    /** Creates a draft. New reviews are always drafts. */
    suspend fun createReview(fields: ReviewFields, image: ImageUploadData): Tagged<Review> =
        tagged(request(url("reviews")).post(reviewWrite(fields, image).toRequestBody()).build())

    /**
     * Replaces the editable fields if the review is still the version with [eTag]. A null
     * [image] keeps the current photo. The slug may change.
     */
    suspend fun updateReview(slug: String, eTag: String, fields: ReviewFields, image: ImageUploadData?): Tagged<Review> =
        tagged(request(url("reviews", slug)).header("If-Match", eTag).put(reviewWrite(fields, image).toRequestBody()).build())

    /** Publishes a draft. Publication is one-way. */
    suspend fun publish(slug: String): Tagged<Review> =
        tagged(request(url("reviews", slug, "publication")).post(ByteArray(0).toRequestBody()).build())

    /** Deletes the review if it is still the version with [eTag]; otherwise 412. */
    suspend fun deleteReview(slug: String, eTag: String) {
        execute(request(url("reviews", slug)).header("If-Match", eTag).delete().build()).close()
    }

    /** Counts reviewed bars near the saved position of [address]. Requires a token. */
    suspend fun nearbyReviews(address: String, excluding: String?): NearbyReviews = get("nearby-reviews") {
        addQueryParameter("address", address)
        excluding?.let { addQueryParameter("exclude", it) }
    }

    /** Geocodes at most one published address. The updated map, or null when nothing changed. */
    suspend fun resolveNextMapMarker(): ReviewMap? {
        execute(request(url("map", "geocoding")).post(ByteArray(0).toRequestBody()).build()).use { response ->
            if (response.code == 204) return null
            return decode(response, serializer())
        }
    }

    // Helpers

    /**
     * The fields and photo of a review write. The contract keeps a stored volume when
     * `beer.volumeCl` is omitted and clears it on null; the form sends its full state, so a
     * missing volume means "unknown" and goes out as null.
     */
    internal fun reviewWrite(fields: ReviewFields, image: ImageUploadData?): JsonObject {
        val json = ApiJson.encodeToJsonElement(ReviewFields.serializer(), fields).jsonObject.toMutableMap()
        val beer = json.getValue("beer").jsonObject
        if ("volumeCl" !in beer) json["beer"] = JsonObject(beer + ("volumeCl" to JsonNull))
        if (image != null) {
            json["image"] = JsonObject(mapOf(
                "contentType" to JsonPrimitive(image.contentType),
                "data" to JsonPrimitive(Base64.encode(image.bytes)),
            ))
        }
        return JsonObject(json)
    }

    private fun url(vararg segments: String): HttpUrl =
        apiBase.newBuilder().apply { segments.forEach { addPathSegment(it) } }.build()

    private fun request(url: HttpUrl) = Request.Builder().url(url).header("Accept", "application/json")

    private suspend inline fun <reified T> get(path: String, query: HttpUrl.Builder.() -> Unit = {}): T =
        get(apiBase.newBuilder().addPathSegments(path).apply(query).build())

    private suspend inline fun <reified T> get(url: HttpUrl): T = send(request(url).build())

    private suspend inline fun <reified T> send(request: Request): T =
        execute(request).use { decode(it, serializer<T>()) }

    private suspend fun tagged(request: Request): Tagged<Review> =
        execute(request).use { Tagged(decode(it, Review.serializer()), it.header("ETag")) }

    private fun <T> decode(response: Response, serializer: KSerializer<T>): T = try {
        ApiJson.decodeFromString(serializer, response.body.string())
    } catch (error: SerializationException) {
        throw ApiException.InvalidResponse(error.message ?: "Undecodable response")
    } catch (error: IllegalArgumentException) {
        throw ApiException.InvalidResponse(error.message ?: "Undecodable response")
    }

    /** Runs the request; a problem response or an unexpected status becomes an [ApiException]. */
    private suspend fun execute(request: Request): Response {
        val response = try {
            http.newCall(request).await()
        } catch (error: IOException) {
            throw ApiException.Transport(error)
        }
        if (response.isSuccessful) return response
        response.use {
            val contentType = it.header("Content-Type").orEmpty().lowercase()
            if (contentType.startsWith("application/problem+json")) {
                val problem = runCatching { ApiJson.decodeFromString<ApiProblem>(it.body.string()) }.getOrNull()
                if (problem != null) throw ApiException.Problem(problem)
            }
            throw ApiException.InvalidResponse("Unexpected status ${it.code}")
        }
    }

    private fun JsonObject.toRequestBody(): RequestBody =
        ApiJson.encodeToString(JsonObject.serializer(), this).toRequestBody(jsonType)

    private companion object {
        val jsonType = "application/json".toMediaType()
    }
}

/** Adds the bearer token, and expires it when the server answers 401 to it. */
private class AuthInterceptor(private val tokens: TokenBox) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokens.token
        val request = if (token != null) chain.request().newBuilder().header("Authorization", "Bearer $token").build() else chain.request()
        val response = chain.proceed(request)
        if (response.code == 401 && token != null) tokens.expire(sentToken = token)
        return response
    }
}

/** Runs an OkHttp call without blocking a thread, and cancels it with the coroutine. */
private suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) = continuation.resumeWith(Result.success(response))
        override fun onFailure(call: Call, e: IOException) {
            if (!continuation.isCancelled) continuation.resumeWithException(e)
        }
    })
}

/** The content type of an image upload. */
val ImageContentType.mimeType: String get() = value
