package se.enstorstarkreview.app.model

import java.text.Collator
import java.util.Locale
import se.enstorstarkreview.api.models.MapMarker

/**
 * Reviews at one address. Several bars can share an address (for example in one building), so
 * they share one marker.
 */
data class MarkerGroup(val id: String, val latitude: Double, val longitude: Double, val markers: List<MapMarker>) {
    companion object {
        /** Groups markers whose coordinates are equal to about one metre, in first-seen order. */
        fun groups(markers: List<MapMarker>): List<MarkerGroup> {
            val collator = Collator.getInstance(Formatting.swedish)
            return markers.groupBy { String.format(Locale.ROOT, "%.5f,%.5f", it.latitude, it.longitude) }
                .map { (key, members) ->
                    MarkerGroup(key, members.first().latitude, members.first().longitude, members.sortedWith { a, b -> collator.compare(a.title, b.title) })
                }
        }
    }
}

/** The overall rating of a marker as a whole number of stamps. */
val MapMarker.stampRating: Int get() = Math.round(overallRating).toInt()
