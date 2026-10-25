package se.enstorstarkreview.app.model

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import se.enstorstarkreview.api.models.Review
import se.enstorstarkreview.api.models.ReviewMap

/** A position in degrees. The device location is kept in memory only and never sent anywhere. */
data class GeoPoint(val latitude: Double, val longitude: Double) {
    val isValid: Boolean
        get() = latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0
}

/** Straight-line distances to reviewed bars, like the web's review-distance.ts. */
object ReviewDistance {
    /** Approximate great-circle distance (haversine, radius 6 371 km). Null for invalid positions. */
    fun kilometres(first: GeoPoint, second: GeoPoint): Double? {
        if (!first.isValid || !second.isValid) return null
        fun radians(degrees: Double) = degrees * Math.PI / 180
        val latitudeDelta = radians(second.latitude - first.latitude)
        val longitudeDelta = radians(second.longitude - first.longitude)
        val haversine = sin(latitudeDelta / 2).pow(2) +
            cos(radians(first.latitude)) * cos(radians(second.latitude)) * sin(longitudeDelta / 2).pow(2)
        return 2 * 6_371 * asin(sqrt(haversine.coerceIn(0.0, 1.0)))
    }

    /** Saved positions by review slug. Only published reviews with a resolved address have one. */
    fun positions(map: ReviewMap): Map<String, GeoPoint> = map.markers.associate { it.slug to GeoPoint(it.latitude, it.longitude) }

    /**
     * Nearest first. Equal and unknown distances keep the given (newest-first) order, and unknown
     * distances go last, like the web's sortHomeReviews. Kotlin's sort is stable.
     */
    fun sorted(reviews: List<Review>, distance: (Review) -> Double?): List<Review> =
        reviews.map { it to distance(it) }.sortedWith(compareBy(nullsLast()) { it.second }).map { it.first }
}
