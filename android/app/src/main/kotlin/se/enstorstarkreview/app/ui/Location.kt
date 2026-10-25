package se.enstorstarkreview.app.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import se.enstorstarkreview.app.model.GeoPoint

/** The location permissions the app asks for. Coarse is enough for sorting by distance. */
val locationPermissions = arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)

fun Context.hasLocationPermission(): Boolean = locationPermissions.any {
    ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
}

/**
 * One location fix, kept in memory by the caller and never sent to the server. Null when it fails
 * or takes longer than 15 seconds.
 */
@SuppressLint("MissingPermission")
suspend fun Context.currentLocation(): GeoPoint? {
    if (!hasLocationPermission()) return null
    val precise = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val priority = if (precise) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
    val client = LocationServices.getFusedLocationProviderClient(this)
    val cancellation = CancellationTokenSource()
    return withTimeoutOrNull(15_000) { suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation { cancellation.cancel() }
        client.getCurrentLocation(priority, cancellation.token)
            .addOnSuccessListener { location -> continuation.resume(location?.let { GeoPoint(it.latitude, it.longitude) }) }
            .addOnFailureListener { continuation.resume(null) }
    } }
}

fun Context.openAppSettings() {
    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
