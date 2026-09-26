import SwiftUI
import EnStorStarkModel
#if !os(Android)
import CoreLocation
import MapKit
#endif

/// The map of published reviews.
///
/// Markers come only from the server's geocode cache. The device location is shown on the
/// map only, and the app never sends it to the API.
struct ReviewMapView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.map
        content(markers: loader.value?.markers ?? [])
            .overlay(alignment: .top) {
                if let errorMessage = loader.errorMessage {
                    ErrorBanner(message: errorMessage) { await loader.load() }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 12).fill(.regularMaterial))
                        .padding()
                }
            }
            .task {
                await loader.load()
            }
    }

    #if os(Android)
    // No Android map yet (Google Maps needs a Cloud project and an API key). Show a list.
    @ViewBuilder func content(markers: [ReviewMarker]) -> some View {
        List {
            Text("Kartan finns inte på Android än. Här är barerna som har en plats på kartan.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ForEach(markers, id: \.slug) { marker in
                NavigationLink(value: Route.review(slug: marker.slug, preview: nil)) {
                    MarkerSummary(marker: marker)
                }
            }
        }
        .refreshable {
            await app.map.load()
        }
    }
    #else
    @ViewBuilder func content(markers: [ReviewMarker]) -> some View {
        AppleReviewMap(markers: markers)
    }
    #endif
}

/// Title, address, rating, and price of a marker.
struct MarkerSummary: View {
    let marker: ReviewMarker

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(marker.title)
                    .font(.headline)
                Text(marker.location)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                RatingBadge(rating: Int(marker.overallRating.rounded()))
                if let beer = marker.beer, let price = Formatting.beerPrice(beer.priceKr, isHappyHour: beer.isHappyHourPrice) {
                    Text(price)
                        .font(.subheadline.weight(.semibold))
                }
            }
        }
    }
}

#if !os(Android)
struct AppleReviewMap: View {
    let markers: [ReviewMarker]

    /// Göteborg at about the web map's start zoom (12.5).
    static let startRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 57.7089, longitude: 11.9746),
        span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.08)
    )

    @State var position: MapCameraPosition = .region(Self.startRegion)
    @State var selectedSlug: String?
    @State var cameraDistance: Double?
    @State var locationManager = CLLocationManager()

    var selectedMarker: ReviewMarker? {
        markers.first { $0.slug == selectedSlug }
    }

    var body: some View {
        Map(position: $position, selection: $selectedSlug) {
            UserAnnotation()
            ForEach(markers, id: \.slug) { marker in
                Annotation(
                    marker.title,
                    coordinate: CLLocationCoordinate2D(latitude: marker.latitude, longitude: marker.longitude),
                    anchor: .center
                ) {
                    MarkerPin(marker: marker, isSelected: marker.slug == selectedSlug)
                }
                .annotationTitles(.hidden)
                .tag(marker.slug)
            }
        }
        .mapControls {
            MapUserLocationButton()
            MapCompass()
            MapScaleView()
        }
        .onMapCameraChange { context in
            cameraDistance = context.camera.distance
        }
        .safeAreaInset(edge: .bottom) {
            if let marker = selectedMarker {
                MarkerPreview(marker: marker) { selectedSlug = nil }
                    .padding()
            }
        }
        .task {
            await centerOnFirstLocation()
        }
    }

    /// Centers the map on the first location fix, once, and keeps the zoom. It does nothing
    /// when the user moved the map first or does not allow location access.
    func centerOnFirstLocation() async {
        if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        }
        do {
            for try await update in CLLocationUpdate.liveUpdates() {
                guard let location = update.location else { continue }
                if !position.positionedByUser {
                    withAnimation {
                        position = .camera(MapCamera(
                            centerCoordinate: location.coordinate,
                            distance: cameraDistance ?? 9_000
                        ))
                    }
                }
                return
            }
        } catch {
            // Location is optional. The map works without it.
        }
    }
}

struct MarkerPin: View {
    let marker: ReviewMarker
    let isSelected: Bool

    var price: String? {
        marker.beer.flatMap { Formatting.beerPrice($0.priceKr, isHappyHour: $0.isHappyHourPrice) }
    }

    var body: some View {
        // The price label sits to the right of the pin, so the pin stays centered on the address.
        Text(verbatim: "\(Int(marker.overallRating.rounded()))")
            .font(.caption.bold())
            .foregroundStyle(isSelected ? Color.white : Color.primary)
            .frame(width: 30, height: 30)
            .background(Circle().fill(isSelected ? Color.accentColor : Color(.systemBackground)))
            .overlay(Circle().stroke(Color.accentColor, lineWidth: 2))
            .shadow(radius: 2)
            .scaleEffect(isSelected ? 1.2 : 1)
            .overlay(alignment: .leading) {
                if let price {
                    Text(price)
                        .font(.caption2.bold())
                        .fixedSize()
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(.regularMaterial))
                        .offset(x: 36)
                        .allowsHitTesting(false)
                        .accessibilityLabel(Text(marker.beer?.isHappyHourPrice == true ? "\(price), happy hour-pris" : price))
                }
            }
            .animation(.snappy, value: isSelected)
    }
}

struct MarkerPreview: View {
    let marker: ReviewMarker
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            MarkerSummary(marker: marker)
            HStack {
                NavigationLink(value: Route.review(slug: marker.slug, preview: nil)) {
                    Text("Visa recension")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                Button("Stäng", action: close)
                    .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(.regularMaterial))
    }
}
#endif
