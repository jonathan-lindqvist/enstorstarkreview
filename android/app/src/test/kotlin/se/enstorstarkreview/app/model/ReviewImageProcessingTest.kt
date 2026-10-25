package se.enstorstarkreview.app.model

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class ReviewImageProcessingTest {
    private fun jpeg(width: Int, height: Int, exif: Map<String, String> = emptyMap()): ByteArray {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
        val bytes = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
        if (exif.isEmpty()) return bytes
        val file = File.createTempFile("photo", ".jpg").apply { writeBytes(bytes) }
        ExifInterface(file).apply { exif.forEach { (tag, value) -> setAttribute(tag, value) }; saveAttributes() }
        return file.readBytes()
    }

    private fun size(bytes: ByteArray): Pair<Int, Int> =
        BitmapFactory.Options().apply { inJustDecodeBounds = true }.also { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, it) }.let { it.outWidth to it.outHeight }

    /** Like iOS: at most 2560 px on the longest side. */
    @Test fun largePhotosAreScaledDown() {
        val prepared = ReviewImageProcessing.prepare(jpeg(4000, 3000))
        assertNotNull(prepared)
        assertEquals(2560 to 1920, size(prepared!!.jpeg))
    }

    @Test fun smallPhotosKeepTheirSize() {
        assertEquals(300 to 200, size(ReviewImageProcessing.prepare(jpeg(300, 200))!!.jpeg))
    }

    /** Camera photos are often stored sideways with an EXIF rotation; the upload is upright. */
    @Test fun theExifRotationIsApplied() {
        val prepared = ReviewImageProcessing.prepare(jpeg(300, 200, mapOf(ExifInterface.TAG_ORIENTATION to ExifInterface.ORIENTATION_ROTATE_90.toString())))
        assertEquals(200 to 300, size(prepared!!.jpeg))
    }

    /** The upload must not reveal where the photo was taken or with what. */
    @Test fun locationAndCameraMetadataAreRemoved() {
        val input = jpeg(300, 200, mapOf(
            ExifInterface.TAG_GPS_LATITUDE to "57/1,41/1,47/1", ExifInterface.TAG_GPS_LATITUDE_REF to "N",
            ExifInterface.TAG_GPS_LONGITUDE to "11/1,55/1,32/1", ExifInterface.TAG_GPS_LONGITUDE_REF to "E",
            ExifInterface.TAG_MAKE to "Telefon",
        ))
        assertNotNull("the test photo has a location", ExifInterface(input.inputStream()).latLong)
        val output = ExifInterface(ReviewImageProcessing.prepare(input)!!.jpeg.inputStream())
        assertNull(output.latLong)
        assertNull(output.getAttribute(ExifInterface.TAG_MAKE))
    }

    @Test fun somethingElseThanAPhotoIsRejected() {
        assertNull(ReviewImageProcessing.prepare("inte en bild".toByteArray()))
    }
}
