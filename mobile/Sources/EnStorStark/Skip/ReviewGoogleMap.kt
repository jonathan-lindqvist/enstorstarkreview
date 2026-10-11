// The Android map of published reviews: Google Maps (maps-compose) in a dark style, with the
// review markers as Compose views on top of the map. Skip copies this file unchanged into the
// Kotlin module; `ReviewMapComposer` in Android/AndroidReviewMapView.swift calls it.
//
// The device location is shown only on the map (the Google Maps location dot). The app never
// sends it to the server, to logs, or to storage.
package en.stor.stark

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.maps.GoogleMapOptions
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.compose.CameraMoveStartedReason
import com.google.maps.android.compose.ComposeMapColorScheme
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.rememberCameraPositionState
import kotlin.coroutines.resume
import kotlin.math.roundToInt
import kotlinx.coroutines.suspendCancellableCoroutine

/// One marker: a review, or several reviews at one address (`count` > 1).
data class MapPinSpec(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    val rating: Int,
    /// The price label, for example "65 kr*", or empty.
    val price: String,
    val count: Int,
    val accessibilityLabel: String
)

/// True when the app has a Google Maps key (`GOOGLE_MAPS_API_KEY` at build time). Without one,
/// the Maps SDK cannot load tiles, so the app lists the places instead.
fun hasGoogleMapsKey(context: Context): Boolean {
    return try {
        val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        !info.metaData?.getString("com.google.android.geo.API_KEY").isNullOrBlank()
    } catch (e: Exception) {
        false
    }
}

private val amber = Color(0xFFFFB833)
private val clusterFill = Color(0xFF292520)

/// Göteborg at the web map's start zoom.
private val startTarget = LatLng(57.7089, 11.9746)
private const val startZoom = 12.5f

@Composable
fun ReviewGoogleMap(
    pins: skip.lib.Array<MapPinSpec>,
    selectedID: String,
    /// Increases when the person taps "Min position".
    recenterRequest: Int,
    /// Space for the title at the top and the buttons and preview at the bottom, in dp. Google
    /// Maps keeps its logo and compass inside this padding.
    topInset: Double,
    bottomInset: Double,
    onSelect: (String) -> Unit
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val currentOnSelect by rememberUpdatedState(onSelect)
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(startTarget, startZoom)
    }
    var userMoved by remember { mutableStateOf(false) }
    var lastLocation by remember { mutableStateOf<Location?>(null) }
    var hasPermission by remember { mutableStateOf(hasLocationPermission(context)) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasPermission = granted
    }
    val mapStyle = remember { MapStyleOptions(darkMapStyle) }

    LaunchedEffect(Unit) {
        if (!hasPermission) permissionLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
    }
    LaunchedEffect(cameraPositionState) {
        snapshotFlow { cameraPositionState.cameraMoveStartedReason }.collect { reason ->
            if (reason == CameraMoveStartedReason.GESTURE) userMoved = true
        }
    }
    // The first fix centres the map once, without a change of zoom, unless the person moved
    // the map first.
    LaunchedEffect(hasPermission) {
        if (!hasPermission) return@LaunchedEffect
        val location = currentLocation(context) ?: return@LaunchedEffect
        lastLocation = location
        if (!userMoved) cameraPositionState.animate(CameraUpdateFactory.newLatLng(LatLng(location.latitude, location.longitude)))
    }
    // Google Maps keeps the camera target in the middle of the padded area, so the map moves
    // when the preview opens or closes. The projection changes without a camera event, so the
    // markers lay out again one frame later.
    var paddingTick by remember { mutableIntStateOf(0) }
    LaunchedEffect(topInset, bottomInset) {
        withFrameNanos { }
        paddingTick += 1
    }
    LaunchedEffect(recenterRequest) {
        if (recenterRequest == 0) return@LaunchedEffect
        if (!hasPermission) {
            permissionLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
            return@LaunchedEffect
        }
        val location = currentLocation(context) ?: lastLocation ?: return@LaunchedEffect
        lastLocation = location
        cameraPositionState.animate(CameraUpdateFactory.newLatLng(LatLng(location.latitude, location.longitude)))
    }

    // Clipped, so markers near the edge do not draw over the tab bar.
    Box(Modifier.fillMaxSize().clipToBounds()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            // Dark before the tiles load, too.
            googleMapOptionsFactory = { GoogleMapOptions().backgroundColor(0xFF1A1815.toInt()) },
            mapColorScheme = ComposeMapColorScheme.DARK,
            contentPadding = PaddingValues(top = topInset.dp, bottom = bottomInset.dp),
            properties = MapProperties(
                isMyLocationEnabled = hasPermission,
                mapStyleOptions = mapStyle,
                isBuildingEnabled = false,
                isIndoorEnabled = false
            ),
            uiSettings = MapUiSettings(
                compassEnabled = true,
                indoorLevelPickerEnabled = false,
                mapToolbarEnabled = false,
                myLocationButtonEnabled = false,
                tiltGesturesEnabled = false,
                zoomControlsEnabled = false
            ),
            // A tap on the map, not on a marker, closes the preview.
            onMapClick = { currentOnSelect("") }
        )
        val pinPx = with(density) { 28.dp.toPx() }
        val selectedPinPx = with(density) { 38.dp.toPx() }
        // The selected marker last, so it is drawn above its neighbours.
        val order = (0 until pins.count).sortedBy { if (pins[it].id == selectedID) 1 else 0 }
        for (index in order) {
            val pin = pins[index]
            val isSelected = pin.id == selectedID
            key(pin.id) {
                val anchor = Modifier.layout { measurable, _ ->
                    val placeable = measurable.measure(Constraints())
                    // Reading the camera position here moves the marker in the layout phase only.
                    @Suppress("UNUSED_VARIABLE") val camera = cameraPositionState.position
                    @Suppress("UNUSED_VARIABLE") val padding = paddingTick
                    val point = cameraPositionState.projection?.toScreenLocation(LatLng(pin.latitude, pin.longitude))
                    layout(placeable.width, placeable.height) {
                        if (point != null) {
                            val anchorX = if (pin.count > 1) placeable.width / 2f else (if (isSelected) selectedPinPx else pinPx) / 2f
                            placeable.place((point.x - anchorX).roundToInt(), (point.y - placeable.height / 2f).roundToInt())
                        }
                    }
                }
                val toggle = { currentOnSelect(if (isSelected) "" else pin.id) }
                if (pin.count > 1) ClusterPin(pin, isSelected, anchor, toggle) else ReviewPin(pin, isSelected, anchor, toggle)
            }
        }
    }
}

private fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

/// One approximate fix from the fused location provider (the same source as the Google Maps
/// location dot), or nil. A recent last location answers at once.
private suspend fun currentLocation(context: Context): Location? {
    if (!hasLocationPermission(context)) return null
    val client = LocationServices.getFusedLocationProviderClient(context)
    return try {
        val last = suspendCancellableCoroutine<Location?> { continuation ->
            client.lastLocation
                .addOnSuccessListener { if (continuation.isActive) continuation.resume(it) }
                .addOnFailureListener { if (continuation.isActive) continuation.resume(null) }
        }
        if (last != null && System.currentTimeMillis() - last.time < 2 * 60 * 1000) return last
        suspendCancellableCoroutine { continuation ->
            val token = CancellationTokenSource()
            continuation.invokeOnCancellation { token.cancel() }
            client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, token.token)
                .addOnSuccessListener { if (continuation.isActive) continuation.resume(it ?: last) }
                .addOnFailureListener { if (continuation.isActive) continuation.resume(last) }
        }
    } catch (e: SecurityException) {
        null
    }
}

/// The rating in an amber ring. The price label to the right does not take taps.
@Composable
private fun ReviewPin(pin: MapPinSpec, isSelected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val size = if (isSelected) 38.dp else 28.dp
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(
            Modifier.size(size).clip(CircleShape)
                .background(if (isSelected) amber else Color.Black)
                .border(2.dp, amber, CircleShape)
                .clickable(onClick = onClick)
                .semantics { contentDescription = pin.accessibilityLabel },
            contentAlignment = Alignment.Center
        ) {
            Text(
                "${pin.rating}",
                style = TextStyle(fontSize = if (isSelected) 16.sp else 13.sp, fontWeight = FontWeight.Black),
                color = if (isSelected) Color.Black else amber
            )
        }
        if (pin.price.isNotEmpty()) {
            Text(
                pin.price,
                Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.75f)).padding(horizontal = 6.dp, vertical = 2.dp),
                style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Bold),
                color = if (isSelected) amber else Color.White
            )
        }
    }
}

/// Several bars at one address.
@Composable
private fun ClusterPin(pin: MapPinSpec, isSelected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(50)
    Row(
        modifier.height(30.dp).clip(shape)
            .background(if (isSelected) amber else clusterFill)
            .border(1.5.dp, if (isSelected) amber else Color.White.copy(alpha = 0.7f), shape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = pin.accessibilityLabel }
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        val color = if (isSelected) Color.Black else Color.White
        Icon(Icons.Filled.Layers, contentDescription = null, modifier = Modifier.size(13.dp), tint = color)
        Text("${pin.count} barer", style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.ExtraBold), color = color)
    }
}

/// A muted dark style in the app's warm greys, without places of interest and transit, so
/// the review markers stand out (as `emphasis: .muted, pointsOfInterest: .excludingAll` on iOS).
private const val darkMapStyle = """
[
  {"elementType": "geometry", "stylers": [{"color": "#1a1815"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#8f877c"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#1a1815"}]},
  {"featureType": "administrative", "elementType": "geometry", "stylers": [{"color": "#4c463c"}]},
  {"featureType": "administrative.land_parcel", "stylers": [{"visibility": "off"}]},
  {"featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{"color": "#cfc4b5"}]},
  {"featureType": "poi", "stylers": [{"visibility": "off"}]},
  {"featureType": "poi.park", "stylers": [{"visibility": "on"}]},
  {"featureType": "poi.park", "elementType": "geometry", "stylers": [{"color": "#1d2a1f"}]},
  {"featureType": "poi.park", "elementType": "labels", "stylers": [{"visibility": "off"}]},
  {"featureType": "road", "elementType": "geometry", "stylers": [{"color": "#2b2823"}]},
  {"featureType": "road", "elementType": "geometry.stroke", "stylers": [{"color": "#1a1815"}]},
  {"featureType": "road.arterial", "elementType": "geometry", "stylers": [{"color": "#35312b"}]},
  {"featureType": "road.highway", "elementType": "geometry", "stylers": [{"color": "#4c463c"}]},
  {"featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{"color": "#6f685e"}]},
  {"featureType": "transit", "stylers": [{"visibility": "off"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#101820"}]},
  {"featureType": "water", "elementType": "labels.text.fill", "stylers": [{"color": "#4e5d6c"}]}
]
"""
