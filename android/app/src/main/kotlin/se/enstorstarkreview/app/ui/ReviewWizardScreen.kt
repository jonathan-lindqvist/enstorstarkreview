@file:OptIn(ExperimentalMaterial3Api::class)

package se.enstorstarkreview.app.ui

import android.graphics.BitmapFactory
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.app.model.ApiException
import se.enstorstarkreview.app.model.ImagePreview
import se.enstorstarkreview.app.model.NearbyReviewsModel
import se.enstorstarkreview.app.model.ReviewFormModel
import se.enstorstarkreview.app.model.ReviewWizardStep
import se.enstorstarkreview.app.model.Tagged

/**
 * The review wizard, full screen. [slug] null creates a new draft; otherwise the latest version
 * of that review is loaded for editing, so the edit starts from the newest ETag.
 */
@Composable
fun ReviewWizardScreen(slug: String?) {
    val app = LocalApp.current
    val nav = LocalNav.current
    var form by remember { mutableStateOf<ReviewFormModel?>(null) }
    var loadFailed by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }

    LaunchedEffect(attempt) {
        loadFailed = false
        val made = try {
            app.metadata.loadIfNeeded()
            val metadata = app.metadata.value
            val editing: Tagged<Review>? = slug?.let { app.api.review(it) }
            metadata?.let { app.reviewForm(it, editing) }
        } catch (_: ApiException) {
            null
        }
        if (made == null) loadFailed = true else {
            form = made
            made.loadAuthors()
        }
    }

    Box(Modifier.fillMaxSize().background(Ess.bg)) {
        val current = form
        when {
            current != null -> ReviewWizard(
                current,
                onSaved = { saved ->
                    app.lastSaved = saved
                    app.didSave(saved.value)
                    if (slug == null) {
                        // A new review opens on its page, in place of the wizard.
                        nav.navigate(ReviewRoute(saved.value.slug)) { popUpTo<WizardRoute> { inclusive = true } }
                    } else {
                        nav.popBackStack()
                    }
                },
                onClose = { nav.popBackStack() },
                onDeleted = {
                    val review = current.draft
                    app.didDelete(current.editedSlug ?: return@ReviewWizard, review.title.trim())
                    nav.popBackStack(HomeRoute, inclusive = false)
                },
            )
            loadFailed -> Column(
                Modifier.fillMaxSize().statusBarsPadding().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ErrorCard("Kunde inte hämta formulärets uppgifter.") { attempt++ }
                OutlinedButton(onClick = { nav.popBackStack() }) { Text("Stäng") }
            }
            else -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = Ess.amber)
        }
    }
}

/** True when the system asks for reduced motion (animations off). */
@Composable
fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

/**
 * One question per screen, big controls low on the screen. A new review goes through the steps
 * in order. An edit starts on a list of all steps; a tap opens one step, and "Klar" returns to
 * the list.
 */
@Composable
fun ReviewWizard(form: ReviewFormModel, onSaved: (Tagged<Review>) -> Unit, onClose: () -> Unit, onDeleted: () -> Unit) {
    val app = LocalApp.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val reduceMotion = rememberReduceMotion()
    val metrics = form.metadata.ratingMetrics
    val nearby = remember(form) { NearbyReviewsModel(app.api, form.editedSlug) }

    var step by remember { mutableStateOf(ReviewWizardStep.Photo) }
    var furthest by remember { mutableStateOf(ReviewWizardStep.Photo) }
    var ratingIndex by remember { mutableIntStateOf(0) }
    var forward by remember { mutableStateOf(true) }
    var showsOverview by remember { mutableStateOf(form.isEditing) }
    var isConfirmingClose by remember { mutableStateOf(false) }
    var isConfirmingDelete by remember { mutableStateOf(false) }
    var showsDeleteConflict by remember { mutableStateOf(false) }
    var showsRestoredNote by remember { mutableStateOf(false) }
    // The photo to show: the new photo or the current photo of an edited review.
    var photo by remember { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(form) {
        if (form.isEditing) {
            furthest = ReviewWizardStep.Authors
        } else {
            form.restoredStep?.let {
                step = it
                furthest = it
                showsRestoredNote = true
            }
        }
    }
    // The current photo of an edit, or the photo of a restored local copy.
    LaunchedEffect(form) {
        val data = form.newImageData
        val path = form.existingImagePath
        photo = when {
            data != null -> withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(data, 0, data.size)?.asImageBitmap() }
            path != null -> {
                val request = ImageRequest.Builder(context).data(app.api.imageUrl(path, ImagePreview.Detail)).allowHardware(false).build()
                (SingletonImageLoader.get(context).execute(request) as? SuccessResult)?.image?.toBitmap()?.asImageBitmap()
            }
            else -> null
        }
    }
    // Keeps a local copy shortly after each change, on each step, and when the app goes away.
    LaunchedEffect(form.draft) {
        delay(600)
        form.saveLocalCopy(step)
    }
    LaunchedEffect(step) {
        if (step > furthest) furthest = step
        form.saveLocalCopy(step)
    }
    // The activity's stop, when the app goes to the background; the navigation entry also
    // stops when the wizard closes.
    val activity = LocalActivity.current as? androidx.activity.ComponentActivity
    if (activity != null) LifecycleEventEffect(Lifecycle.Event.ON_STOP, activity) { form.saveLocalCopy(step) }

    fun go(target: ReviewWizardStep) {
        forward = target >= step
        if (target == ReviewWizardStep.Ratings) ratingIndex = if (forward) 0 else (metrics.size - 1).coerceAtLeast(0)
        step = target
    }

    fun open(target: ReviewWizardStep) {
        forward = true
        ratingIndex = 0
        step = target
        showsOverview = false
    }

    fun save() {
        scope.launch {
            val saved = form.submit()
            if (saved != null) {
                onSaved(saved)
                return@launch
            }
            val errorStep = form.firstStepWithError ?: return@launch
            if (form.isEditing) showsOverview = true else if (errorStep != step) go(errorStep)
        }
    }

    fun next() {
        if (step == ReviewWizardStep.Ratings && ratingIndex < metrics.size - 1) {
            forward = true
            ratingIndex++
            return
        }
        if (!form.validate(step)) return
        when {
            form.isEditing -> showsOverview = true
            step.next != null -> go(step.next!!)
            else -> save()
        }
    }

    fun close() {
        if (form.hasChanges) isConfirmingClose = true else onClose()
    }

    fun back() {
        when {
            step == ReviewWizardStep.Ratings && ratingIndex > 0 -> {
                forward = false
                ratingIndex--
            }
            form.isEditing && !showsOverview -> showsOverview = true
            !form.isEditing && step.previous != null -> go(step.previous!!)
            else -> close()
        }
    }

    BackHandler { back() }

    val hidesStepButtons = !form.isEditing && step == ReviewWizardStep.Photo && photo == null
    val isLastStep = !form.isEditing && step == ReviewWizardStep.Authors
    val nextRating = step == ReviewWizardStep.Ratings && ratingIndex < metrics.size - 1
    val nextLabel = when {
        nextRating -> "Nästa: ${metrics[ratingIndex + 1].label}"
        form.isEditing -> "Klar"
        step.next != null -> "Nästa: ${step.next!!.title}"
        else -> "Spara utkast"
    }
    val nextIcon = when {
        isLastStep -> Ic.lock
        form.isEditing && !nextRating -> Ic.check
        else -> Ic.forward
    }
    val canGoBack = if (form.isEditing) step == ReviewWizardStep.Ratings && ratingIndex > 0 else step != ReviewWizardStep.Photo

    Column(Modifier.fillMaxSize().background(Ess.bg).statusBarsPadding().imePadding()) {
        WizardTopBar(
            form, step, furthest, showsOverview,
            showsSkip = !form.isEditing && step == ReviewWizardStep.Photo && photo == null,
            close = ::close, overview = { showsOverview = true }, skip = { go(ReviewWizardStep.Bar) }, go = ::go,
        )
        Box(Modifier.weight(1f)) {
            AnimatedContent(
                targetState = if (form.isEditing && showsOverview) null else step,
                transitionSpec = {
                    if (reduceMotion || initialState == null || targetState == null) fadeIn() togetherWith fadeOut()
                    else if (forward) (slideInHorizontally { it } + fadeIn()) togetherWith (slideOutHorizontally { -it } + fadeOut())
                    else (slideInHorizontally { -it } + fadeIn()) togetherWith (slideOutHorizontally { it } + fadeOut())
                },
                label = "step",
            ) { shown ->
                when (shown) {
                    null -> WizardOverview(form, photo, onDelete = if (form.canDelete) ({ isConfirmingDelete = true }) else null, open = ::open)
                    ReviewWizardStep.Photo -> WizardPhotoStep(form, photo) { photo = it }
                    ReviewWizardStep.Bar -> WizardBarStep(form, photo)
                    ReviewWizardStep.Beer -> WizardBeerStep(form)
                    ReviewWizardStep.Ratings -> WizardRatingStep(form, ratingIndex, forward, nearby) { ratingIndex = it }
                    ReviewWizardStep.Text -> WizardTextStep(form)
                    ReviewWizardStep.Authors -> WizardAuthorsStep(form, photo)
                }
            }
            androidx.compose.animation.AnimatedVisibility(
                showsRestoredNote, Modifier.align(Alignment.TopCenter),
                enter = slideInVertically() + fadeIn(), exit = slideOutVertically() + fadeOut(),
            ) {
                RestoredNote(dismiss = { showsRestoredNote = false }) {
                    form.startOver()
                    photo = null
                    furthest = ReviewWizardStep.Photo
                    go(ReviewWizardStep.Photo)
                    showsRestoredNote = false
                }
            }
        }
        WizardBottomBar {
            form.errorMessage?.let { ErrorCard(it) }
            if (form.isEditing && showsOverview) {
                if (form.needsReload) ReloadCard(form)
                PrimaryButton("Spara", Ic.check, isLoading = form.isSubmitting, enabled = !form.isSubmitting && form.hasChanges, action = ::save)
            } else if (!hidesStepButtons) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (canGoBack) {
                        FilledTonalIconButton(onClick = ::back, Modifier.size(56.dp)) { Icon(Ic.back, "Tillbaka") }
                    }
                    PrimaryButton(nextLabel, nextIcon, Modifier.weight(1f), isLoading = form.isSubmitting, enabled = !form.isSubmitting, action = ::next)
                }
            }
        }
    }

    if (isConfirmingClose) CloseDialog(form, dismiss = { isConfirmingClose = false }, keep = {
        form.saveLocalCopy(step)
        onClose()
    }, discard = {
        form.discardLocalCopy()
        onClose()
    })
    if (isConfirmingDelete) {
        val title = form.draft.title.trim()
        AlertDialog(
            onDismissRequest = { isConfirmingDelete = false },
            title = { Text(if (title.isEmpty()) "Ta bort recensionen?" else "Ta bort $title?") },
            text = { Text("Recensionen försvinner från sajten, kartan och statistiken för alla besökare. Den går inte att återställa från appen.") },
            confirmButton = {
                TextButton(onClick = {
                    isConfirmingDelete = false
                    scope.launch {
                        // A 412 or 409 means someone saved in between: nothing was deleted.
                        if (form.delete()) onDeleted() else if (form.needsReload) showsDeleteConflict = true
                    }
                }, colors = ButtonDefaults.textButtonColors(contentColor = Ess.bad)) { Text("Ta bort") }
            },
            dismissButton = { TextButton(onClick = { isConfirmingDelete = false }) { Text("Avbryt") } },
        )
    }
    if (showsDeleteConflict) {
        AlertDialog(
            onDismissRequest = { showsDeleteConflict = false },
            title = { Text("Recensionen har ändrats") },
            text = { Text("Någon sparade en ändring medan du hade den öppen, så den togs inte bort. Titta på den nya versionen först.") },
            confirmButton = {
                TextButton(onClick = {
                    showsDeleteConflict = false
                    scope.launch { form.reloadLatest() }
                }) { Text("Visa ändringen") }
            },
            dismissButton = { TextButton(onClick = { showsDeleteConflict = false }) { Text("Avbryt") } },
        )
    }
}

@Composable
private fun WizardTopBar(
    form: ReviewFormModel,
    step: ReviewWizardStep,
    furthest: ReviewWizardStep,
    showsOverview: Boolean,
    showsSkip: Boolean,
    close: () -> Unit,
    overview: () -> Unit,
    skip: () -> Unit,
    go: (ReviewWizardStep) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(top = 4.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (form.isEditing && !showsOverview) {
                FilledTonalIconButton(onClick = overview) { Icon(Ic.back, "Alla steg") }
            } else {
                FilledTonalIconButton(onClick = close) { Icon(Ic.close, "Stäng") }
            }
            Column(Modifier.weight(1f)) {
                if (form.isEditing) {
                    Text(if (showsOverview) "Redigera recension" else step.title, style = MaterialTheme.typography.titleMedium,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                } else {
                    Text("Ny recension", style = MaterialTheme.typography.titleMedium)
                    Text("Steg ${step.ordinal + 1} av ${ReviewWizardStep.entries.size} · ${step.title}",
                        style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
                }
            }
            if (showsSkip) FilledTonalButton(onClick = skip) { Text("Hoppa över", fontWeight = FontWeight.Bold) }
        }
        if (!form.isEditing) {
            // One segment per step. Steps that the reviewer has reached open with a tap.
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ReviewWizardStep.entries.forEach { item ->
                    val color = when {
                        form.hasErrors(item) -> Ess.bad
                        item <= step -> Ess.amber
                        item <= furthest -> Color.White.copy(alpha = 0.35f)
                        else -> MaterialTheme.colorScheme.surfaceContainerHighest
                    }
                    val label = "Steg ${item.ordinal + 1} av ${ReviewWizardStep.entries.size}, ${item.title}"
                    Box(
                        Modifier.weight(1f).height(24.dp)
                            .semantics { contentDescription = label; selected = item == step }
                            .clickable(enabled = item <= furthest && item != step, role = Role.Tab) { go(item) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(color))
                    }
                }
            }
        }
    }
}

@Composable
private fun WizardBottomBar(content: @Composable ColumnScope.() -> Unit) {
    Surface(color = Ess.bg) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(top = 10.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp), content = content,
        )
    }
}

/** The wizard's main action: amber, full width, with a spinner while it saves. */
@Composable
fun PrimaryButton(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier, isLoading: Boolean = false, enabled: Boolean = true, action: () -> Unit) {
    Button(onClick = action, modifier.fillMaxWidth().height(56.dp), enabled = enabled) {
        if (isLoading) {
            CircularProgressIndicator(Modifier.size(20.dp), color = Ess.onAmber, strokeWidth = 2.dp)
        } else {
            Text(text, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.width(8.dp))
            Icon(icon, null, Modifier.size(18.dp))
        }
    }
}

@Composable
private fun ReloadCard(form: ReviewFormModel) {
    val scope = rememberCoroutineScope()
    Surface(shape = RoundedCornerShape(18.dp), color = Ess.raised) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Någon annan har sparat recensionen efter att du öppnade den. Hämta den senaste versionen och gör dina ändringar igen.",
                style = MaterialTheme.typography.bodyMedium)
            FilledTonalButton(onClick = { scope.launch { form.reloadLatest() } }, Modifier.fillMaxWidth(), enabled = !form.isReloading) {
                if (form.isReloading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else {
                    Icon(Ic.restore, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Hämta senaste versionen")
                }
            }
        }
    }
}

@Composable
private fun RestoredNote(dismiss: () -> Unit, startOver: () -> Unit) {
    LaunchedEffect(Unit) {
        delay(6000)
        dismiss()
    }
    Snackbar(
        Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        action = { TextButton(onClick = startOver) { Text("Börja om", color = Ess.amber, fontWeight = FontWeight.Bold) } },
        shape = RoundedCornerShape(16.dp), containerColor = Ess.raised3, contentColor = Color.White,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Ic.restore, null, Modifier.size(20.dp), tint = Ess.amber)
            Text("Du fortsätter där du slutade.")
        }
    }
}

@Composable
private fun CloseDialog(form: ReviewFormModel, dismiss: () -> Unit, keep: () -> Unit, discard: () -> Unit) {
    if (form.isEditing) {
        AlertDialog(
            onDismissRequest = dismiss,
            title = { Text("Vill du slänga ändringarna?") },
            confirmButton = { TextButton(onClick = dismiss) { Text("Fortsätt redigera", fontWeight = FontWeight.Bold) } },
            dismissButton = {
                TextButton(onClick = discard, colors = ButtonDefaults.textButtonColors(contentColor = Ess.bad)) { Text("Släng ändringarna") }
            },
        )
        return
    }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Vill du stänga recensionen?") },
        text = { Text("Recensionen finns kvar på telefonen tills du sparar den eller slänger den.") },
        // Three choices, stacked at the end as in the Material 3 design.
        confirmButton = {
            Column(horizontalAlignment = Alignment.End) {
                TextButton(onClick = keep) { Text("Spara till senare") }
                TextButton(onClick = discard, colors = ButtonDefaults.textButtonColors(contentColor = Ess.bad)) { Text("Släng recensionen") }
                TextButton(onClick = dismiss) { Text("Fortsätt skriva", fontWeight = FontWeight.Bold) }
            }
        },
    )
}

/** The big title and the hint at the top of a step. */
@Composable
fun WizardTitle(title: String, subtitle: String? = null, large: Boolean = false) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, Modifier.semantics { heading() },
            style = if (large) MaterialTheme.typography.displaySmall else MaterialTheme.typography.headlineLarge)
        if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = Ess.secondaryText)
    }
}

/** A step's scrolling page. */
@Composable
fun WizardPage(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(top = 8.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp), content = content,
    )
}

/** A form error below a control, or nothing. */
@Composable
fun FieldError(message: String?) {
    if (message != null) Text(message, style = MaterialTheme.typography.bodySmall, color = Ess.bad,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
}

fun stepIcon(step: ReviewWizardStep) = when (step) {
    ReviewWizardStep.Photo -> Ic.photo
    ReviewWizardStep.Bar -> Ic.place
    ReviewWizardStep.Beer -> Ic.mug
    ReviewWizardStep.Ratings -> Ic.star
    ReviewWizardStep.Text -> Ic.notes
    ReviewWizardStep.Authors -> Ic.group
}

/** Edit mode: every step as a row with a summary. A tap opens the step. */
@Composable
private fun WizardOverview(form: ReviewFormModel, photo: ImageBitmap?, onDelete: (() -> Unit)?, open: (ReviewWizardStep) -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ReviewWizardStep.entries.forEach { step ->
            val hasError = form.hasErrors(step)
            Surface(onClick = { open(step) }, shape = RoundedCornerShape(18.dp), color = Ess.raised) {
                Row(Modifier.fillMaxWidth().height(66.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (step == ReviewWizardStep.Photo && photo != null) {
                        Image(photo, null, Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)), contentScale = ContentScale.Crop)
                    } else {
                        Box(Modifier.size(40.dp).clip(CircleShape).background(if (hasError) Ess.bad else Ess.amber), contentAlignment = Alignment.Center) {
                            Icon(if (hasError) Ic.error else stepIcon(step), null, Modifier.size(20.dp), tint = Ess.onAmber)
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Text(step.title, style = MaterialTheme.typography.titleMedium)
                        Text(form.summary(step), style = MaterialTheme.typography.bodyMedium, color = if (hasError) Ess.bad else Ess.secondaryText,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Icon(Ic.chevronRight, null, tint = Ess.tertiaryText)
                }
            }
        }
        if (onDelete != null) {
            // Away from Spara, as on the web's edit page.
            Spacer(Modifier.height(14.dp))
            FilledTonalButton(
                onClick = onDelete, Modifier.fillMaxWidth().height(50.dp), enabled = !form.isSubmitting,
                colors = ButtonDefaults.filledTonalButtonColors(containerColor = Ess.bad.copy(alpha = 0.12f), contentColor = Ess.bad),
            ) {
                Icon(Ic.delete, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Ta bort recensionen", fontWeight = FontWeight.SemiBold)
            }
            Text("Försvinner från appen, sajten, kartan och statistiken.", Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}
