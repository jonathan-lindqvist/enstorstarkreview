package se.enstorstarkreview.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.SubcomposeAsyncImage
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.PublicationStatus
import se.enstorstarkreview.app.data.*

/** A review photo, cropped around its focus point (0–100 on each axis). */
@Composable
fun ReviewPhoto(review: Review, modifier: Modifier = Modifier, preview: String = "card-v1") {
    val x = review.image.focusX.toFloat() / 50f - 1f
    val y = review.image.focusY.toFloat() / 50f - 1f
    SubcomposeAsyncImage(
        model = Api.imageUrl(review.image.url, preview),
        contentDescription = null,
        modifier = modifier,
        contentScale = ContentScale.Crop,
        alignment = BiasAlignment(x, y),
        loading = { PhotoPlaceholder() },
        error = { PhotoPlaceholder() },
    )
}

@Composable
private fun PhotoPlaceholder() {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerHigh), contentAlignment = Alignment.Center) {
        Icon(Ic.mug, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f))
    }
}

/** Filled stars, the empty ones dim, as on iOS. */
@Composable
fun Stars(rating: Int, size: Dp = 16.dp, empty: Color = Color.White.copy(alpha = 0.22f)) {
    Row(horizontalArrangement = Arrangement.spacedBy(size * 0.1f)) {
        repeat(3) { i -> Icon(Ic.star, null, Modifier.size(size), tint = if (i < rating) Ess.amber else empty) }
    }
}

/** A price; amber prices glow unless `glow` is false. */
@Composable
fun Price(price: Int?, happyHour: Boolean = false, size: Int = 40, color: Color = Ess.amber, glow: Boolean = color == Ess.amber) {
    if (price == null) {
        Text("–", style = Ess.num(size), color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        val halo = if (glow) color else null
        Row(verticalAlignment = Alignment.Bottom) {
            Text("$price", style = Ess.num(size, halo), color = color)
            Text(if (happyHour) " kr*" else " kr", style = Ess.num((size * 0.4).toInt(), halo), color = color,
                modifier = Modifier.padding(bottom = (size * 0.12).dp))
        }
    }
}

fun avatarColor(name: String): Color {
    val v = name.sumOf { it.code }
    return Color.hsv((v % 12) / 12f * 360f, 0.35f, 0.95f)
}

@Composable
fun Avatar(name: String, size: Dp = 28.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(avatarColor(name)), contentAlignment = Alignment.Center) {
        Text(authorName(name).take(1), color = Color.Black.copy(alpha = 0.85f),
            style = TextStyle(fontSize = (size.value * 0.44f).sp, fontWeight = FontWeight.Bold))
    }
}

@Composable
fun AuthorLine(names: List<String>, size: Dp = 24.dp) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.width(size + size * 0.7f * (names.size - 1).coerceAtLeast(0))) {
            names.forEachIndexed { i, n ->
                Box(Modifier.padding(start = size * 0.7f * i).border(1.5.dp, MaterialTheme.colorScheme.surfaceContainerLow, CircleShape)) { Avatar(n, size) }
            }
        }
        Text("av ${authorList(names)}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** "Utkast" on a photo. */
@Composable
fun DraftChip() {
    Surface(shape = CircleShape, color = Ess.amber, contentColor = Ess.onAmber) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Icon(Ic.lock, null, Modifier.size(14.dp))
            Text("Utkast", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
        }
    }
}

/** A Material 3 filter chip (8 dp corners), filled; amber when selected. */
@Composable
fun EssChip(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    FilterChip(selected = selected, onClick = onClick, modifier = modifier.height(32.dp),
        label = { Text(label, style = MaterialTheme.typography.labelLarge) },
        shape = RoundedCornerShape(8.dp), border = null,
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Ess.raised2, labelColor = Color.White, iconColor = Color.White,
            selectedContainerColor = Ess.amber, selectedLabelColor = Ess.onAmber, selectedLeadingIconColor = Ess.onAmber,
        ))
}

/** The feed card: the photo fills the card, and the details sit on a dark fade at its foot. */
@Composable
fun ReviewCard(review: Review, modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth().height(380.dp), shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Ess.raised)) {
        Box(Modifier.fillMaxSize()) {
            ReviewPhoto(review, Modifier.fillMaxSize())
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(
                0f to Color.Transparent, 0.35f to Color.Transparent, 0.72f to Color.Black.copy(alpha = 0.78f), 1f to Color.Black.copy(alpha = 0.92f))))
            if (review.publicationStatus == PublicationStatus.draft) Box(Modifier.padding(14.dp)) { DraftChip() }
            Column(Modifier.align(Alignment.BottomStart).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Stars(review.overallRating, 15.dp)
                    Text(ratingWord(review.overallRating), style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold), color = Ess.secondaryText)
                }
                Text(review.title, style = MaterialTheme.typography.headlineMedium, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(review.excerpt, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.75f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                AuthorLine(review.authorNames, 22.dp)
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.Bottom) {
                    Column(Modifier.weight(1f)) {
                        Text(review.beer.brand?.ifEmpty { null } ?: "Okänt märke", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                            color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(review.street, style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Price(review.beer.priceKr, review.beer.isHappyHourPrice, size = 40)
                }
            }
        }
    }
}
