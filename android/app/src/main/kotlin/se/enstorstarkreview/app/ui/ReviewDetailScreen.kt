@file:OptIn(ExperimentalMaterial3Api::class)

package se.enstorstarkreview.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.app.model.ApiException
import se.enstorstarkreview.app.model.BeerBrandLogo
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.ImagePreview
import se.enstorstarkreview.app.model.ReviewDetailModel
import se.enstorstarkreview.app.model.authorNames
import se.enstorstarkreview.app.model.beerBrandText
import se.enstorstarkreview.app.model.isDraft
import se.enstorstarkreview.app.model.value

/** A review; for reviewers, a draft also shows its publish banner. */
@Composable
fun ReviewDetailScreen(slug: String) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val model = remember(slug) { app.reviewDetail(slug, app.reviewList.reviews.firstOrNull { it.slug == slug }) }
    var isConfirmingPublish by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    val scroll = rememberScrollState()
    val density = androidx.compose.ui.platform.LocalDensity.current
    val screenWidth = androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp
    // Past the hero, the photo bar gets a solid background and the title.
    val showsTitle by remember { androidx.compose.runtime.derivedStateOf { scroll.value > with(density) { (screenWidth / 0.98f - 140).dp.toPx() } } }

    LaunchedEffect(model) {
        launch { app.metadata.loadIfNeeded() }
        model.load()
    }

    Box(Modifier.fillMaxSize().background(Ess.bg)) {
        val review = model.review
        PullToRefreshBox(isRefreshing = model.isLoading && review != null, onRefresh = { scope.launch { model.load() } }) {
            when {
                review != null -> ReviewDetailContent(
                    review, scroll, model.errorMessage, reload = { scope.launch { model.load() } },
                    publish = if (review.isDraft && app.session.isSignedIn) ({ isConfirmingPublish = true }) else null,
                    history = { nav.navigate(HistoryRoute(review.slug)) },
                )
                model.errorMessage != null -> Box(Modifier.fillMaxSize().padding(18.dp), contentAlignment = Alignment.Center) {
                    ErrorCard(model.errorMessage!!) { scope.launch { model.load() } }
                }
                else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Ess.amber) }
            }
        }
        // The photo bar: back, share, and edit.
        val barColor by androidx.compose.animation.animateColorAsState(if (showsTitle) Ess.bg else Color.Transparent, label = "bar")
        Row(
            Modifier.fillMaxWidth().background(barColor).statusBarsPadding().padding(vertical = 8.dp).padding(start = 8.dp, end = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PhotoBarButton { IconButton(onClick = { nav.popBackStack() }) { Icon(Ic.back, "Tillbaka") } }
            Box(Modifier.weight(1f)) {
                androidx.compose.animation.AnimatedVisibility(showsTitle, enter = androidx.compose.animation.fadeIn(), exit = androidx.compose.animation.fadeOut()) {
                    Text(review?.title.orEmpty(), style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (review != null) {
                PhotoBarButton {
                    IconButton(onClick = {
                        val send = Intent(Intent.ACTION_SEND).setType("text/plain")
                            .putExtra(Intent.EXTRA_SUBJECT, review.title).putExtra(Intent.EXTRA_TEXT, app.api.webUrl(review.slug))
                        context.startActivity(Intent.createChooser(send, null))
                    }) { Icon(Ic.share, "Dela") }
                }
            }
            DetailActions(model)
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
    }

    val review = model.review
    if (isConfirmingPublish && review != null) {
        PublishSheet(review, model, close = { isConfirmingPublish = false }) {
            isConfirmingPublish = false
            scope.launch { snackbar.showSnackbar("Publicerad · nu kan alla se den") }
        }
    }
}

/** Reviewer actions on the photo bar. The wizard adds editing. */
@Composable
fun DetailActions(model: ReviewDetailModel) {}

@Composable
fun PhotoBarButton(content: @Composable () -> Unit) {
    Surface(shape = CircleShape, color = Color.Black.copy(alpha = 0.45f), contentColor = Color.White) { content() }
}

@Composable
private fun ReviewDetailContent(review: Review, scroll: androidx.compose.foundation.ScrollState, errorMessage: String?, reload: () -> Unit, publish: (() -> Unit)?, history: () -> Unit) {
    val app = LocalApp.current
    Column(Modifier.fillMaxSize().verticalScroll(scroll)) {
        Hero(review)
        Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 32.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (errorMessage != null) ErrorCard(errorMessage, reload)
            if (publish != null) PublishBanner(publish)
            BeerTiles(review)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                AuthorLine(review.authorNames, 28.dp)
                Text("Skapad ${Formatting.shortDate(review.createdAt)} · Uppdaterad ${Formatting.shortDate(review.updatedAt)}",
                    style = MaterialTheme.typography.bodySmall, color = Ess.tertiaryText)
            }
            AttributeTags(app.attributeLabels(review.attributes))
            Text("Recension", Modifier.padding(top = 4.dp).semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
            Description(review.description)
            Ratings(review)
            FilledTonalButton(onClick = history, Modifier.fillMaxWidth().height(52.dp).padding(top = 4.dp)) {
                Icon(Ic.history, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Visa ändringslogg", fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** The photo; the title block sits on its lower part. */
@Composable
private fun Hero(review: Review) {
    val context = LocalContext.current
    Box(Modifier.fillMaxWidth().aspectRatio(0.98f)) {
        ReviewPhoto(review, Modifier.fillMaxSize(), ImagePreview.Detail)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(
            0f to Color.Black.copy(alpha = 0.45f), 0.25f to Color.Transparent, 0.45f to Color.Transparent, 1f to Ess.bg)))
        Column(Modifier.align(Alignment.BottomStart).padding(horizontal = 18.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                if (review.isDraft) DraftChip(onPhoto = true)
                Spacer(Modifier.weight(1f))
                StampRow(review.overallRating, 84.dp, overlap = 0.25f)
            }
            Text(review.title, Modifier.semantics { heading() }, style = MaterialTheme.typography.displaySmall, color = Color.White, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Row(
                Modifier.clickable(onClickLabel = "Öppna adressen i Kartor") {
                    val uri = Uri.parse("https://www.google.com/maps/search/?api=1&query=" + Uri.encode(review.location))
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Icon(Ic.place, null, Modifier.size(16.dp), tint = Ess.amber)
                Text(review.location, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.labelLarge, color = Ess.amber, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Ic.openInNew, null, Modifier.size(14.dp), tint = Ess.amber)
            }
        }
    }
}

/** The award line (only for stamped bars) and the beer card. */
@Composable
private fun BeerTiles(review: Review) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (Formatting.stampCount(review.overallRating) > 0) {
            val label = Formatting.stampAccessibilityLabel(review.overallRating)
            Row(Modifier.clearAndSetSemantics { contentDescription = label }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Ic.star, null, Modifier.size(15.dp), tint = Ess.amber)
                Text(Formatting.stampAward(review.overallRating), style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold))
            }
        }
        Row(
            Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(22.dp)).padding(16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val brand = review.beer.brand
            if (brand != null && BeerBrandLogo.resourceName(brand) != null) BrandLogo(brand, 64.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Eyebrow("Stor stark")
                Text(review.beerBrandText, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), maxLines = 2)
                review.beer.volumeCl?.let { volume ->
                    val value = Formatting.clPerKr(volume, review.beer.priceKr, review.beer.isHappyHourPrice)
                    Text(listOfNotNull("$volume cl", value).joinToString(" · "), style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold), color = Ess.secondaryText)
                }
                if (review.beer.isHappyHourPrice) Text(Formatting.HAPPY_HOUR_NOTE, style = MaterialTheme.typography.labelSmall, color = Ess.tertiaryText)
            }
            Price(review.beer.priceKr, review.beer.isHappyHourPrice, size = 44)
        }
    }
}

@Composable
private fun Ratings(review: Review) {
    val metrics = LocalApp.current.ratingMetrics
    if (metrics.isEmpty()) return
    Text("Betygsfördelning", Modifier.padding(top = 12.dp).semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        metrics.forEach { MetricBar(it.label, it.description, review.ratings.value(it.key)) }
    }
    val weighted = metrics.sumOf { it.weight * review.ratings.value(it.key) }
    Row(
        Modifier.fillMaxWidth().background(Ess.raised, RoundedCornerShape(20.dp)).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Viktat snitt ${Formatting.decimal(weighted, maximumFractionDigits = 2)} av 5", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
            Text(Formatting.stampAward(review.overallRating), style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText)
        }
        StampRow(review.overallRating, 30.dp)
    }
}

@Composable
private fun PublishBanner(publish: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Ess.amber.copy(alpha = 0.1f))
            .border(1.dp, Ess.amber.copy(alpha = 0.4f), RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Ic.lock, null, Modifier.size(18.dp), tint = Ess.amber)
            Text("Privat utkast", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
        }
        Text("Endast inloggade användare kan se recensionen. Publicering går inte att ångra.", style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText)
        Button(onClick = publish, Modifier.fillMaxWidth().height(48.dp)) {
            Icon(Ic.send, null, Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Publicera recension", fontWeight = FontWeight.Bold)
        }
    }
}

/** One-way publish confirmation that shows what becomes public. */
@Composable
private fun PublishSheet(review: Review, model: ReviewDetailModel, close: () -> Unit, published: () -> Unit) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var isPublishing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { !isPublishing })

    fun publish() {
        isPublishing = true
        error = null
        scope.launch {
            try {
                model.replace(app.publish(model.slug).first)
                published()
            } catch (failure: ApiException) {
                if (failure.problemOrNull?.code == "already_published") {
                    // Someone else published it first. Show the current state.
                    close()
                    model.load()
                } else {
                    error = failure.message
                }
            } finally {
                isPublishing = false
            }
        }
    }

    ModalBottomSheet(onDismissRequest = { if (!isPublishing) close() }, sheetState = state, containerColor = Ess.raised) {
        Column(Modifier.padding(horizontal = 18.dp).padding(bottom = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            AmberDisc(Ic.send, 52.dp)
            Text("Publicera recensionen?", style = MaterialTheme.typography.headlineSmall)
            Text("Alla kan se recensionen efter publiceringen. Det går inte att ångra.", style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText, textAlign = TextAlign.Center)
            Row(
                Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.06f), RoundedCornerShape(18.dp)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ReviewPhoto(review, Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(review.title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        StampRow(review.overallRating, 16.dp, overlap = 0.15f)
                        Text("av ${Formatting.authorList(review.authorNames)}", style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText, maxLines = 1)
                    }
                }
                Price(review.beer.priceKr, review.beer.isHappyHourPrice, size = 22)
            }
            error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Ess.bad) }
            Button(onClick = ::publish, Modifier.fillMaxWidth().height(52.dp), enabled = !isPublishing) {
                if (isPublishing) CircularProgressIndicator(Modifier.size(20.dp), color = Ess.onAmber, strokeWidth = 2.dp)
                else Text("Publicera", fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = close, Modifier.fillMaxWidth(), enabled = !isPublishing, colors = ButtonDefaults.textButtonColors(contentColor = Color.White)) { Text("Avbryt") }
        }
    }
}
