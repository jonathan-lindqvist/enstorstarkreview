package se.enstorstarkreview.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.compose.CameraMoveStartedReason
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.MarkerComposable
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.maps.android.compose.rememberUpdatedMarkerState
import kotlinx.coroutines.launch
import se.enstorstarkreview.api.models.MapMarker
import se.enstorstarkreview.app.R
import se.enstorstarkreview.app.model.Formatting
import se.enstorstarkreview.app.model.MarkerGroup
import se.enstorstarkreview.app.model.stampRating

/** Göteborg at about the web map's start zoom. */
private val startPosition = CameraPosition.fromLatLngZoom(LatLng(57.7089, 11.9746), 12.5f)

/**
 * The map of published reviews. Markers come only from the server's geocode cache. The device
 * location is shown on the map only, and the app never sends it to the API.
 */
@Composable
fun MapScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val camera = rememberCameraPositionState { position = startPosition }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var hasLocation by remember { mutableStateOf(context.hasLocationPermission()) }
    val groups = remember(app.map.value) { MarkerGroup.groups(app.map.value?.markers.orEmpty()) }
    val selected = groups.firstOrNull { it.id == selectedId }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        hasLocation = result.values.any { it }
    }

    LaunchedEffect(Unit) {
        app.map.load()
        app.resolveNextMapMarker()
    }
    // The preview takes the photo from the list, because markers have no photo.
    LaunchedEffect(Unit) { if (app.reviewList.reviews.isEmpty()) app.reviewList.load() }
    // Centres on the first location fix, once, unless the user moved the map first.
    LaunchedEffect(Unit) { if (!hasLocation) permission.launch(locationPermissions) }
    LaunchedEffect(hasLocation) {
        if (!hasLocation) return@LaunchedEffect
        val here = context.currentLocation() ?: return@LaunchedEffect
        if (camera.cameraMoveStartedReason != CameraMoveStartedReason.GESTURE) {
            camera.animate(CameraUpdateFactory.newLatLngZoom(LatLng(here.latitude, here.longitude), 13.5f))
        }
    }

    val style = remember { MapStyleOptions.loadRawResourceStyle(context, R.raw.map_dark) }
    Box(Modifier.fillMaxSize().background(Ess.bg)) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = camera,
            properties = MapProperties(mapStyleOptions = style, isMyLocationEnabled = hasLocation, isBuildingEnabled = false),
            uiSettings = MapUiSettings(zoomControlsEnabled = false, myLocationButtonEnabled = false, mapToolbarEnabled = false, compassEnabled = true),
            onMapClick = { selectedId = null },
            contentDescription = "Karta över recenserade barer",
        ) {
            groups.forEach { group ->
                val isSelected = group.id == selectedId
                MarkerComposable(
                    group.id, isSelected,
                    state = rememberUpdatedMarkerState(LatLng(group.latitude, group.longitude)),
                    title = accessibilityLabel(group),
                    anchor = androidx.compose.ui.geometry.Offset(if (group.markers.size == 1) 0.15f else 0.5f, 0.5f),
                    zIndex = if (isSelected) 1f else 0f,
                    onClick = {
                        selectedId = if (isSelected) null else group.id
                        true
                    },
                ) {
                    if (group.markers.size == 1) MarkerPin(group.markers.first(), isSelected) else ClusterPin(group.markers.size, isSelected)
                }
            }
        }

        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.Top) {
            Text("Karta", Modifier.semantics { heading() }, style = MaterialTheme.typography.displaySmall.copy(shadow = androidx.compose.ui.graphics.Shadow(Color.Black.copy(alpha = 0.6f), blurRadius = 16f)))
            Spacer(Modifier.weight(1f))
            SmallFloatingActionButton(
                onClick = {
                    if (!hasLocation) permission.launch(locationPermissions)
                    else scope.launch {
                        context.currentLocation()?.let { camera.animate(CameraUpdateFactory.newLatLngZoom(LatLng(it.latitude, it.longitude), 15f)) }
                    }
                },
                containerColor = Ess.raised2, contentColor = Color.White, shape = CircleShape,
            ) { Icon(Ic.myLocation, "Visa min position") }
        }
        app.map.errorMessage?.let {
            Box(Modifier.statusBarsPadding().padding(top = 70.dp, start = 14.dp, end = 14.dp)) { ErrorCard(it) { scope.launch { app.map.load() } } }
        }

        AnimatedVisibility(
            selected != null, Modifier.align(Alignment.BottomCenter),
            enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut(),
        ) {
            // Keeps the last group while it slides out.
            var shown by remember { mutableStateOf(selected) }
            if (selected != null) shown = selected
            shown?.let { group ->
                MarkerGroupPreview(group, open = { slug -> nav.navigate(ReviewRoute(slug)) }, close = { selectedId = null })
            }
        }
    }
}

private fun accessibilityLabel(group: MarkerGroup): String {
    val marker = group.markers.singleOrNull() ?: return "${group.markers.size} barer på ${group.markers.first().location}"
    val price = marker.beer?.let { Formatting.beerPrice(it.priceKr, it.isHappyHourPrice) }
    return listOfNotNull(marker.title, Formatting.stampAccessibilityLabel(marker.stampRating), price).joinToString(", ")
}

/** A stamp for stamped bars (with the count for two or three), else an amber ring; the price sits to the right. */
@Composable
private fun MarkerPin(marker: MapMarker, isSelected: Boolean) {
    val size = if (isSelected) 40.dp else 30.dp
    val stamps = Formatting.stampCount(marker.stampRating)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(size + 6.dp), contentAlignment = Alignment.Center) {
            if (stamps > 0) {
                Stamp(size)
                if (stamps > 1) {
                    Box(Modifier.align(Alignment.TopEnd).size(if (isSelected) 18.dp else 15.dp).background(Ess.foam, CircleShape), contentAlignment = Alignment.Center) {
                        Text("$stamps", style = TextStyle(fontSize = if (isSelected) 12.sp else 10.sp, fontWeight = FontWeight.Black, color = Color.Black))
                    }
                }
            } else {
                Box(Modifier.size(size * 0.7f).background(if (isSelected) Ess.amber else Color.Black, CircleShape).border(2.dp, Ess.amber, CircleShape))
            }
        }
        marker.beer?.let { beer -> Formatting.beerPrice(beer.priceKr, beer.isHappyHourPrice) }?.let { price ->
            Text(
                price, Modifier.background(Color.Black.copy(alpha = 0.75f), CircleShape).padding(horizontal = 6.dp, vertical = 2.dp),
                style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Bold, color = if (isSelected) Ess.amber else Color.White),
            )
        }
    }
}

/** Several bars at one address. */
@Composable
private fun ClusterPin(count: Int, isSelected: Boolean) {
    Box(Modifier.padding(end = 3.dp, bottom = 3.dp)) {
        Box(Modifier.offset(3.dp, 3.dp).height(30.dp).width(84.dp).background(Color(0xFF1A1A1A), CircleShape).border(1.dp, Color.White.copy(alpha = 0.3f), CircleShape))
        Row(
            Modifier.height(30.dp).width(84.dp).background(if (isSelected) Ess.amber else Color(0xFF292929), CircleShape)
                .border(1.5.dp, if (isSelected) Ess.amber else Color.White.copy(alpha = 0.7f), CircleShape),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
        ) {
            val color = if (isSelected) Color.Black else Color.White
            Icon(Ic.stack, null, Modifier.size(13.dp), tint = color)
            Spacer(Modifier.width(4.dp))
            Text("$count barer", style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = color))
        }
    }
}

/** The selected marker: photo, stamps, title, address, price, and a link; for several bars, a list. */
@Composable
private fun MarkerGroupPreview(group: MarkerGroup, open: (String) -> Unit, close: () -> Unit) {
    val app = LocalApp.current
    Column(
        // Above the Google logo, which must stay visible; padding the map would move the camera.
        Modifier.padding(horizontal = 14.dp).padding(bottom = 40.dp).fillMaxWidth().shadow(16.dp, RoundedCornerShape(30.dp))
            .background(Color(0xFF171717), RoundedCornerShape(30.dp)).border(1.dp, Ess.hairline, RoundedCornerShape(30.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val single = group.markers.singleOrNull()
        if (single != null) {
            val review = app.reviewList.reviews.firstOrNull { it.slug == single.slug }
            Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                if (review != null) ReviewPhoto(review, Modifier.size(86.dp).clip(RoundedCornerShape(18.dp)))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (Formatting.stampCount(single.stampRating) > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            StampRow(single.stampRating, 20.dp, overlap = 0.15f)
                            Text(Formatting.ratingWord(single.stampRating), style = MaterialTheme.typography.labelSmall, color = Ess.secondaryText)
                        }
                    }
                    Text(single.title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(single.location, style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText, maxLines = 2)
                }
                Price(single.beer?.priceKr, single.beer?.isHappyHourPrice ?: false, size = 30)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { open(single.slug) }, Modifier.weight(1f).height(48.dp)) {
                    Text("Visa recension", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(8.dp))
                    Icon(Ic.forward, null, Modifier.size(18.dp))
                }
                CloseButton(close)
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${group.markers.size} barer", style = MaterialTheme.typography.titleLarge)
                    Text(group.markers.first().location, style = MaterialTheme.typography.bodySmall, color = Ess.secondaryText, maxLines = 1)
                }
                CloseButton(close)
            }
            group.markers.forEach { marker ->
                Row(
                    Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.06f)).clickable { open(marker.slug) }.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(Modifier.width(40.dp)) { StampRow(marker.stampRating, 18.dp, overlap = 0.15f) }
                    Text(marker.title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Price(marker.beer?.priceKr, marker.beer?.isHappyHourPrice ?: false, size = 18, glow = false)
                    Icon(Ic.chevronRight, null, Modifier.size(14.dp), tint = Ess.tertiaryText)
                }
            }
        }
    }
}

@Composable
private fun CloseButton(close: () -> Unit) {
    IconButton(onClick = close, Modifier.size(48.dp).background(Color.White.copy(alpha = 0.12f), CircleShape)) { Icon(Ic.close, "Stäng") }
}
