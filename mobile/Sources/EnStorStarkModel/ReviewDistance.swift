import Foundation

/// A position in degrees. The device location is kept in memory only and never sent anywhere.
public struct GeoPoint: Equatable, Hashable, Sendable {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    var isValid: Bool {
        latitude.isFinite && longitude.isFinite && (-90...90).contains(latitude) && (-180...180).contains(longitude)
    }
}

/// Straight-line distances to reviewed bars, like the web's review-distance.ts.
public enum ReviewDistance {
    /// Approximate great-circle distance (haversine, radius 6 371 km). Nil for invalid positions.
    public static func kilometres(from first: GeoPoint, to second: GeoPoint) -> Double? {
        guard first.isValid, second.isValid else { return nil }
        let radians = { (degrees: Double) in degrees * .pi / 180 }
        let latitudeDelta = radians(second.latitude - first.latitude)
        let longitudeDelta = radians(second.longitude - first.longitude)
        let haversine = pow(sin(latitudeDelta / 2), 2)
            + cos(radians(first.latitude)) * cos(radians(second.latitude)) * pow(sin(longitudeDelta / 2), 2)
        return 2 * 6_371 * asin(sqrt(max(0, min(1, haversine))))
    }

    /// Saved positions by review slug. Only published reviews with a resolved address have one.
    public static func positions(_ map: ReviewMap) -> [String: GeoPoint] {
        var positions: [String: GeoPoint] = [:]
        for marker in map.markers {
            positions[marker.slug] = GeoPoint(latitude: marker.latitude, longitude: marker.longitude)
        }
        return positions
    }

    /// Nearest first. Equal and unknown distances keep the given (newest-first) order, and
    /// unknown distances go last, like the web's sortHomeReviews.
    static func sorted(_ reviews: [Review], distance: (Review) -> Double?) -> [Review] {
        let indexed = reviews.enumerated().map { (offset: $0.offset, review: $0.element, km: distance($0.element)) }
        return indexed.sorted { first, second in
            switch (first.km, second.km) {
            case let (a?, b?): return a == b ? first.offset < second.offset : a < b
            case (_?, nil): return true
            case (nil, _?): return false
            case (nil, nil): return first.offset < second.offset
            }
        }.map(\.review)
    }
}
