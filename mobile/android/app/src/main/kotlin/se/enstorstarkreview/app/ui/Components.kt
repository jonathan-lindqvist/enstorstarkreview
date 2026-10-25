package se.enstorstarkreview.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import coil3.compose.AsyncImage
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.app.R
import se.enstorstarkreview.app.model.BeerBrandLogo
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.ImagePreview
import se.enstorstarkreview.app.model.authorNames
import se.enstorstarkreview.app.model.beerBrandText
import se.enstorstarkreview.app.model.excerpt
import se.enstorstarkreview.app.model.isDraft
import se.enstorstarkreview.app.model.street

/** A review photo from a server preview, cropped around its focus point. */
@Composable
fun ReviewPhoto(review: Review, modifier: Modifier = Modifier, preview: ImagePreview = ImagePreview.Card) {
    val app = LocalApp.current
    Box(modifier.background(Ess.raised2)) {
        PhotoPlaceholder()
        AsyncImage(
            model = app.api.imageUrl(review.image.url, preview),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            alignment = BiasAlignment((review.image.focusX / 50 - 1).toFloat(), (review.image.focusY / 50 - 1).toFloat()),
        )
    }
}

@Composable
fun PhotoPlaceholder() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Icon(Ic.mug, null, Modifier.size(48.dp), tint = Ess.tertiaryText)
    }
}

/** The edge of a stamp: a circle with soft scallops. */
private class ScallopShape(private val bumps: Int = 18, private val depth: Float = 0.06f) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val radius = min(size.width, size.height) / 2
        val steps = bumps * 12
        val path = Path()
        for (step in 0..steps) {
            val angle = step.toDouble() / steps * 2 * PI
            val r = radius * (1 - depth / 2 + depth / 2 * cos(bumps * angle).toFloat())
            val x = size.width / 2 + r * cos(angle).toFloat()
            val y = size.height / 2 + r * sin(angle).toFloat()
            if (step == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.close()
        return Outline.Generic(path)
    }
}

/** One stamp of excellence: an amber seal with a full glass in a dark centre. */
@Composable
fun Stamp(size: Dp = 44.dp, tilt: Float = 0f) {
    val shape = ScallopShape()
    Box(
        // The shadow follows a circle: elevation on the concave scallop path stalls some GPUs.
        Modifier.size(size).rotate(tilt).shadow(size * 0.08f, CircleShape, clip = false, ambientColor = Color.Black, spotColor = Color.Black)
            .background(Brush.linearGradient(listOf(Ess.foam, Ess.amber, Ess.amberDeep)), shape),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.padding(size * 0.12f).fillMaxSize().background(Color(0xFF171717), CircleShape))
        Canvas(Modifier.padding(size * 0.17f).fillMaxSize()) {
            val width = (size * 0.025f).toPx().coerceAtLeast(1.dp.toPx())
            drawCircle(
                Ess.amber.copy(alpha = 0.8f), radius = this.size.minDimension / 2 - width / 2,
                style = Stroke(width, pathEffect = PathEffect.dashPathEffect(floatArrayOf((size * 0.05f).toPx(), (size * 0.035f).toPx()))),
            )
        }
        Image(painterResource(R.drawable.stamp_glass), null, Modifier.size(size * 0.48f))
    }
}

/** An empty place for a stamp, in the wizard. */
@Composable
fun StampSlot(size: Dp = 44.dp) {
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val width = 2.dp.toPx()
            drawCircle(Color.White.copy(alpha = 0.22f), radius = this.size.minDimension / 2 - width / 2,
                style = Stroke(width, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))))
        }
        Icon(Ic.add, null, Modifier.size(size * 0.3f), tint = Color.White.copy(alpha = 0.3f))
    }
}

/** The overall rating as 0–3 stamps, tilted as if stamped by hand. Shows nothing for 0. */
@Composable
fun StampRow(rating: Int, size: Dp = 40.dp, overlap: Float = 0.22f) {
    val count = Formatting.stampCount(rating)
    if (count == 0) return
    val label = Formatting.stampAccessibilityLabel(rating)
    Row(Modifier.clearAndSetSemantics { contentDescription = label }, horizontalArrangement = Arrangement.spacedBy(-size * overlap)) {
        repeat(count) { index ->
            Box(Modifier.zIndex((3 - index).toFloat())) { Stamp(size, tilts[index]) }
        }
    }
}

private val tilts = listOf(-10f, 6f, -4f)

/** A price; amber prices glow unless [glow] is false. */
@Composable
fun Price(price: Int?, happyHour: Boolean = false, size: Int = 40, color: Color = Ess.amber, glow: Boolean = color == Ess.amber) {
    if (price == null) {
        Text("–", style = Ess.num(size), color = Ess.tertiaryText, modifier = Modifier.semantics { contentDescription = "Pris saknas" })
        return
    }
    val halo = if (glow) color else null
    val label = if (happyHour) "$price kronor, happy hour-pris" else "$price kronor"
    Row(Modifier.clearAndSetSemantics { contentDescription = label }, verticalAlignment = Alignment.Bottom) {
        Text("$price", style = Ess.num(size, halo), color = color)
        Text(if (happyHour) " kr*" else " kr", style = Ess.num((size * 0.4).toInt(), halo), color = color,
            modifier = Modifier.padding(bottom = (size * 0.12).dp))
    }
}

fun avatarColor(name: String): Color = Color.hsv((name.sumOf { it.code } % 12) / 12f * 360f, 0.35f, 0.95f)

@Composable
fun Avatar(name: String, size: Dp = 28.dp, dimmed: Boolean = false) {
    Box(Modifier.size(size).clip(CircleShape).background(avatarColor(name).copy(alpha = if (dimmed) 0.35f else 1f)), contentAlignment = Alignment.Center) {
        Text(name.take(1).uppercase(), color = Color.Black.copy(alpha = if (dimmed) 0.5f else 0.85f),
            style = TextStyle(fontSize = (size.value * 0.44f).sp, fontWeight = FontWeight.Bold))
    }
}

@Composable
fun AuthorLine(names: List<String>, size: Dp = 24.dp) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.width(size + size * 0.7f * (names.size - 1).coerceAtLeast(0))) {
            names.forEachIndexed { index, name ->
                Box(Modifier.padding(start = size * 0.7f * index).border(1.5.dp, Ess.raised, CircleShape)) { Avatar(name, size) }
            }
        }
        Text("av ${Formatting.authorList(names)}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** "Utkast" on a photo or a surface. */
@Composable
fun DraftChip(onPhoto: Boolean = false) {
    Surface(shape = CircleShape, color = if (onPhoto) Ess.amber else MaterialTheme.colorScheme.primaryContainer,
        contentColor = if (onPhoto) Ess.onAmber else Ess.amber) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Icon(Ic.lock, null, Modifier.size(14.dp))
            Text("Utkast", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
        }
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, color: Color = Ess.secondaryText) {
    Text(text, modifier, style = MaterialTheme.typography.titleSmall, color = color)
}

/** A Material 3 filter chip, amber when selected. */
@Composable
fun EssChip(label: String, selected: Boolean, modifier: Modifier = Modifier, leading: (@Composable () -> Unit)? = null, onClick: () -> Unit = {}) {
    FilterChip(selected = selected, onClick = onClick, modifier = modifier.height(32.dp),
        label = { Text(label, style = MaterialTheme.typography.labelLarge) },
        leadingIcon = leading, shape = RoundedCornerShape(8.dp), border = null,
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Ess.raised2, labelColor = Color.White, iconColor = Color.White,
            selectedContainerColor = Ess.amber, selectedLabelColor = Ess.onAmber, selectedLeadingIconColor = Ess.onAmber,
        ))
}

/** The amber disc with a black icon. */
@Composable
fun AmberDisc(icon: androidx.compose.ui.graphics.vector.ImageVector, size: Dp = 36.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(Ess.amber), contentAlignment = Alignment.Center) {
        Icon(icon, null, Modifier.size(size * 0.55f), tint = Ess.onAmber)
    }
}

/** A listed brand's bundled logo on a rounded square, or a mug for other brands. */
@Composable
fun BrandLogo(brand: String, size: Dp = 44.dp, radius: Dp = size * 0.24f) {
    val context = LocalContext.current
    val name = BeerBrandLogo.resourceName(brand)
    val id = name?.let { context.resources.getIdentifier(it, "drawable", context.packageName) } ?: 0
    Box(Modifier.size(size).clip(RoundedCornerShape(radius)).background(Color.White.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
        if (id != 0) {
            Image(painterResource(id), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            Icon(Ic.mug, null, Modifier.size(size * 0.42f), tint = Ess.secondaryText)
        }
    }
}

/** A non-blocking error with an optional retry. */
@Composable
fun ErrorCard(message: String, retry: (() -> Unit)? = null) {
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Ic.error, null, tint = Ess.bad)
            Text(message, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
            if (retry != null) FilledTonalButton(onClick = retry) { Text("Försök igen") }
        }
    }
}

@Composable
fun EmptyState(title: String, message: String? = null, icon: androidx.compose.ui.graphics.vector.ImageVector = Ic.search) {
    Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, null, Modifier.size(40.dp), tint = Ess.tertiaryText)
        Text(title, style = MaterialTheme.typography.titleMedium)
        if (message != null) Text(message, style = MaterialTheme.typography.bodyMedium, color = Ess.secondaryText)
    }
}

/** The feed card: the photo fills the card, and the details sit on a dark fade at its foot. */
@Composable
fun ReviewCard(review: Review, modifier: Modifier = Modifier, distance: String? = null) {
    ReviewCardLayout(
        rating = review.overallRating, title = review.title, excerpt = review.excerpt, authors = review.authorNames,
        brand = review.beerBrandText, street = review.street, priceKr = review.beer.priceKr,
        isHappyHour = review.beer.isHappyHourPrice, isDraft = review.isDraft, modifier = modifier, distance = distance,
    ) { ReviewPhoto(review, Modifier.fillMaxSize()) }
}

/** The feed card's layout, also for the wizard's preview of an unsaved review. */
@Composable
fun ReviewCardLayout(
    rating: Int,
    title: String,
    excerpt: String,
    authors: List<String>,
    brand: String,
    street: String,
    priceKr: Int?,
    isHappyHour: Boolean,
    isDraft: Boolean,
    modifier: Modifier = Modifier,
    distance: String? = null,
    photo: @Composable () -> Unit,
) {
    Card(modifier.fillMaxWidth().height(380.dp), shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Ess.raised)) {
        Box(Modifier.fillMaxSize()) {
            photo()
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(
                0f to Color.Transparent, 0.35f to Color.Transparent, 0.72f to Color.Black.copy(alpha = 0.78f), 1f to Color.Black.copy(alpha = 0.92f))))
            if (isDraft) Box(Modifier.padding(14.dp)) { DraftChip(onPhoto = true) }
            Column(Modifier.align(Alignment.TopEnd).padding(14.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StampRow(rating, 48.dp)
                if (distance != null) DistanceChip(distance)
            }
            Column(Modifier.align(Alignment.BottomStart).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(title, style = MaterialTheme.typography.headlineMedium, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (excerpt.isNotEmpty()) {
                    Text(excerpt, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.75f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                if (authors.isNotEmpty()) AuthorLine(authors, 22.dp)
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.Bottom) {
                    Column(Modifier.weight(1f)) {
                        Text(brand, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(street, style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Price(priceKr, isHappyHour, size = 40)
                }
            }
        }
    }
}

/** Straight-line distance from the device on a card. */
@Composable
fun DistanceChip(distance: String) {
    val label = "$distance bort, fågelvägen"
    Surface(shape = CircleShape, color = Color.Black.copy(alpha = 0.55f), contentColor = Color.White,
        modifier = Modifier.clearAndSetSemantics { contentDescription = label }) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(Ic.myLocation, null, Modifier.size(12.dp))
            Text(distance, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
        }
    }
}

/** Compact search result row. */
@Composable
fun ReviewRow(review: Review, modifier: Modifier = Modifier) {
    ListItem(
        modifier = modifier,
        headlineContent = { Text(review.title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Column {
                Text(review.excerpt, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StampRow(review.overallRating, 16.dp, overlap = 0.15f)
                    Text("${review.street} · ${Formatting.shortDate(review.createdAt)}", style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            }
        },
        leadingContent = {
            Box {
                ReviewPhoto(review, Modifier.size(60.dp).clip(RoundedCornerShape(14.dp)))
                if (review.isDraft) {
                    Box(Modifier.padding(4.dp).size(20.dp).background(Ess.amber, CircleShape).semantics { contentDescription = "Utkast" }, contentAlignment = Alignment.Center) {
                        Icon(Ic.lock, null, Modifier.size(11.dp), tint = Ess.onAmber)
                    }
                }
            }
        },
        trailingContent = { Price(review.beer.priceKr, review.beer.isHappyHourPrice, size = 24) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
    )
}
