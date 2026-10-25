package se.enstorstarkreview.app.ui

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException
import kotlin.math.min
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import se.enstorstarkreview.api.models.ImageContentType
import se.enstorstarkreview.app.model.ReviewFormModel
import se.enstorstarkreview.app.model.ReviewImageProcessing

/** Step 1: take or choose a photo, then move the square that the feed card shows. */
@Composable
fun WizardPhotoStep(form: ReviewFormModel, photo: ImageBitmap?, setPhoto: (ImageBitmap) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isProcessing by remember { mutableStateOf(false) }
    val hasCamera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }
    var cameraFile by remember { mutableStateOf<File?>(null) }

    fun use(read: suspend () -> ByteArray?, cleanUp: () -> Unit = {}) {
        isProcessing = true
        scope.launch {
            val prepared = withContext(Dispatchers.IO) {
                try {
                    read()?.let(ReviewImageProcessing::prepare)
                } catch (error: IOException) {
                    Log.i("WizardPhotoStep", "Could not read the photo: ${error.message}")
                    null
                } finally {
                    cleanUp()
                }
            }
            isProcessing = false
            if (prepared == null) return@launch
            form.setImage(prepared.jpeg, ImageContentType.imageSlashJpeg)
            form.draft = form.draft.copy(focusX = 50.0, focusY = 50.0)
            setPhoto(prepared.preview.asImageBitmap())
        }
    }

    val library = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) use({ readBytes(context, uri) })
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { taken ->
        val file = cameraFile ?: return@rememberLauncherForActivityResult
        // The camera's original keeps its location in EXIF: delete it once it is prepared.
        if (taken) use({ file.readBytes() }, cleanUp = { file.delete() }) else file.delete()
    }

    fun takePhoto() {
        val file = File(context.cacheDir, "camera").apply { mkdirs() }.let { File(it, "photo.jpg") }
        cameraFile = file
        camera.launch(FileProvider.getUriForFile(context, "${context.packageName}.photos", file))
    }

    fun pickPhoto() = library.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))

    WizardPage {
        if (photo != null) {
            WizardTitle("Välj utsnitt", "Dra rutan. Det som syns i den blir kortet i flödet.")
            PhotoCropper(photo, form.draft.focusX, form.draft.focusY) { x, y -> form.draft = form.draft.copy(focusX = x, focusY = y) }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (hasCamera) {
                    FilledTonalButton(onClick = ::takePhoto, Modifier.weight(1f).height(52.dp), enabled = !isProcessing) {
                        Icon(Ic.camera, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Ta nytt", fontWeight = FontWeight.Bold)
                    }
                }
                FilledTonalButton(onClick = ::pickPhoto, Modifier.weight(1f).height(52.dp), enabled = !isProcessing) {
                    Icon(Ic.library, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Välj en annan", fontWeight = FontWeight.Bold)
                }
            }
        } else {
            WizardTitle("Börja med en bild", "Få med baren. Bilden blir kortet i flödet.", large = true)
            Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(28.dp)).background(Color.White.copy(alpha = 0.04f)).clearAndSetSemantics {},
                contentAlignment = Alignment.Center) {
                CropCorners(Modifier.fillMaxSize().padding(2.dp))
                if (isProcessing) CircularProgressIndicator(color = Ess.amber)
                else Icon(Ic.mug, null, Modifier.size(64.dp), tint = Color.White.copy(alpha = 0.14f))
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (hasCamera) {
                    Button(onClick = ::takePhoto, Modifier.fillMaxWidth().height(56.dp), enabled = !isProcessing) {
                        Icon(Ic.camera, null, Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Ta foto", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    }
                    FilledTonalButton(onClick = ::pickPhoto, Modifier.fillMaxWidth().height(56.dp), enabled = !isProcessing) {
                        Icon(Ic.library, null, Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Välj från biblioteket", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                } else {
                    Button(onClick = ::pickPhoto, Modifier.fillMaxWidth().height(56.dp), enabled = !isProcessing) {
                        Icon(Ic.library, null, Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Välj från biblioteket", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        FieldError(form.error("/image", "/image/data", "/image/contentType", "/imageFocus", "/imageFocus/x", "/imageFocus/y"))
    }
}

/** Reads a picked photo, refusing files far larger than any upload could be. */
private fun readBytes(context: Context, uri: Uri): ByteArray? {
    val stream = context.contentResolver.openInputStream(uri) ?: return null
    return stream.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            if (output.size() > MAX_SOURCE_BYTES) return null
        }
        output.toByteArray()
    }
}

/** A source photo larger than this is not decoded (a 200-megapixel JPEG is about 60 MB). */
private const val MAX_SOURCE_BYTES = 80 * 1024 * 1024

/**
 * The whole photo with the square crop of the feed card lit and the rest dimmed. Drag to move
 * the square; the focus point (0–100) uses the same rule as the feed's cropping.
 */
@Composable
private fun PhotoCropper(image: ImageBitmap, focusX: Double, focusY: Double, onChange: (Double, Double) -> Unit) {
    val aspect = if (image.height > 0) image.width.toFloat() / image.height else 1f
    val focus by rememberUpdatedState(focusX to focusY)
    val change by rememberUpdatedState(onChange)
    val wide = aspect >= 1
    val shown = if (wide) focusX else focusY
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        // At most 460 dp high, like on iOS; the width follows the photo.
        val width = min(maxWidth.value, 460f * aspect).dp
        Box(
            Modifier.width(width).aspectRatio(aspect).clip(RoundedCornerShape(24.dp))
                .clearAndSetSemantics {
                    contentDescription = "Bildutsnitt"
                    stateDescription = if (wide) "${shown.toInt()} procent från vänster" else "${shown.toInt()} procent uppifrån"
                    progressBarRangeInfo = ProgressBarRangeInfo(shown.toFloat(), 0f..100f, steps = 9)
                    setProgress { target ->
                        val value = target.toDouble().coerceIn(0.0, 100.0)
                        if (wide) change(value, focus.second) else change(focus.first, value)
                        true
                    }
                },
        ) {
            Image(image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            Canvas(Modifier.fillMaxSize().pointerInput(Unit) {
                detectDragGestures { _, drag ->
                    val side = min(size.width, size.height).toFloat()
                    val slackX = size.width - side
                    val slackY = size.height - side
                    val (x, y) = focus
                    change(
                        if (slackX > 1) (x + drag.x / slackX * 100).coerceIn(0.0, 100.0) else x,
                        if (slackY > 1) (y + drag.y / slackY * 100).coerceIn(0.0, 100.0) else y,
                    )
                }
            }) {
                val side = min(size.width, size.height)
                val left = (size.width - side) * (focusX / 100).toFloat()
                val top = (size.height - side) * (focusY / 100).toFloat()
                val hole = Path().apply { addRoundRect(RoundRect(left, top, left + side, top + side, CornerRadius(22.dp.toPx()))) }
                clipPath(hole, ClipOp.Difference) { drawRect(Color.Black.copy(alpha = 0.6f)) }
            }
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val side = min(maxWidth.value, maxHeight.value)
                val x = (maxWidth.value - side) * (focusX / 100).toFloat()
                val y = (maxHeight.value - side) * (focusY / 100).toFloat()
                CropCorners(Modifier.offset(x = (x + 4).dp, y = (y + 4).dp).size((side - 8).dp))
            }
        }
    }
}

/** Four rounded corner brackets in amber, like a camera guide. */
@Composable
fun CropCorners(modifier: Modifier) {
    Canvas(modifier) {
        val length = min(34.dp.toPx(), size.width / 4)
        val radius = min(26.dp.toPx(), size.width / 6)
        val stroke = Stroke(4.dp.toPx(), cap = StrokeCap.Round)
        val corners = listOf(
            Offset(0f, 0f) to 180f, Offset(size.width - 2 * radius, 0f) to 270f,
            Offset(size.width - 2 * radius, size.height - 2 * radius) to 0f, Offset(0f, size.height - 2 * radius) to 90f,
        )
        corners.forEach { (origin, start) -> drawArc(Ess.amber, start, 90f, false, origin, Size(2 * radius, 2 * radius), style = stroke) }
        val w = stroke.width
        fun line(from: Offset, to: Offset) = drawLine(Ess.amber, from, to, w, StrokeCap.Round)
        line(Offset(radius, 0f), Offset(radius + length, 0f))
        line(Offset(size.width - radius - length, 0f), Offset(size.width - radius, 0f))
        line(Offset(radius, size.height), Offset(radius + length, size.height))
        line(Offset(size.width - radius - length, size.height), Offset(size.width - radius, size.height))
        line(Offset(0f, radius), Offset(0f, radius + length))
        line(Offset(0f, size.height - radius - length), Offset(0f, size.height - radius))
        line(Offset(size.width, radius), Offset(size.width, radius + length))
        line(Offset(size.width, size.height - radius - length), Offset(size.width, size.height - radius))
    }
}
