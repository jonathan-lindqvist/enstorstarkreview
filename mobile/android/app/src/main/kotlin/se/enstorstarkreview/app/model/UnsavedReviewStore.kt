package se.enstorstarkreview.app.model

import android.util.Log
import java.io.File
import java.io.IOException
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

/**
 * A local copy of a new review that is not saved yet. Reviewers often write at the bar, and the
 * system can stop the app before they save. The copy stays on the device only: it holds draft
 * data, so a sign-out removes it, and another user never gets it.
 */
@Serializable
data class UnsavedReview(
    val username: String,
    val draft: ReviewDraft,
    /** The wizard step that was open ([ReviewWizardStep.ordinal]). */
    val step: Int,
    val hasImage: Boolean,
)

/** Keeps one [UnsavedReview] and its photo in the app's private files. */
class UnsavedReviewStore(private val directory: File) {
    private val reviewFile get() = File(directory, "review.json")
    private val imageFile get() = File(directory, "image.jpg")

    /** The saved copy of this user, with its photo. Null when there is none. */
    fun load(username: String): Pair<UnsavedReview, ByteArray?>? {
        val review = try {
            ApiJson.decodeFromString<UnsavedReview>(reviewFile.readText())
        } catch (_: IOException) {
            return null
        } catch (_: SerializationException) {
            return null
        } catch (_: IllegalArgumentException) {
            return null
        }
        if (review.username != username) return null
        val image = if (review.hasImage) runCatching { imageFile.readBytes() }.getOrNull() else null
        return review to image
    }

    /** Writes the copy. Writes the photo only when [image] is not null: it rarely changes and can be large. */
    fun save(review: UnsavedReview, image: ByteArray?) {
        try {
            directory.mkdirs()
            if (image != null) atomicWrite(imageFile, image) else if (!review.hasImage) imageFile.delete()
            atomicWrite(reviewFile, ApiJson.encodeToString(UnsavedReview.serializer(), review).toByteArray())
        } catch (error: IOException) {
            Log.i("UnsavedReviewStore", "Could not keep the unsaved review: ${error.message}")
        }
    }

    fun clear() {
        directory.deleteRecursively()
    }

    private fun atomicWrite(file: File, bytes: ByteArray) {
        val temporary = File(directory, "${file.name}.tmp")
        temporary.writeBytes(bytes)
        if (!temporary.renameTo(file)) throw IOException("Could not replace ${file.name}")
    }
}
