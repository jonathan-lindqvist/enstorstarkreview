#if !os(Android)
import SwiftUI
import CoreLocation
import MapKit
import EnStorStarkModel

/// The map of published reviews.
///
/// Markers come only from the server's geocode cache. The device location is shown on the
/// map only, and the app never sends it to the API.
struct ReviewMapView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.map
        ReviewMapContent(markers: loader.value?.markers ?? [], errorMessage: loader.errorMessage) {
            await loader.load()
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await loader.load()
            await app.resolveNextMapMarker()
        }
    }
}

/// Reviews at one address. Several bars can share an address (for example in one building),
/// so they share one marker.
struct MarkerGroup: Identifiable, Equatable {
    let id: String
    let coordinate: CLLocationCoordinate2D
    let markers: [ReviewMarker]

    static func == (lhs: MarkerGroup, rhs: MarkerGroup) -> Bool { lhs.id == rhs.id }

    /// Groups markers whose coordinates are equal to about one metre.
    static func groups(_ markers: [ReviewMarker]) -> [MarkerGroup] {
        var order: [String] = []
        var byKey: [String: [ReviewMarker]] = [:]
        for marker in markers {
            let key = String(format: "%.5f,%.5f", marker.latitude, marker.longitude)
            if byKey[key] == nil { order.append(key) }
            byKey[key, default: []].append(marker)
        }
        return order.compactMap { key in
            guard let members = byKey[key], let first = members.first else { return nil }
            return MarkerGroup(
                id: key,
                coordinate: CLLocationCoordinate2D(latitude: first.latitude, longitude: first.longitude),
                markers: members.sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
            )
        }
    }
}

struct ReviewMapContent: View {
    let markers: [ReviewMarker]
    let errorMessage: String?
    let reload: () async -> Void

    /// Göteborg at about the web map's start zoom (12.5).
    static let startRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 57.7089, longitude: 11.9746),
        span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.08)
    )

    @State var position: MapCameraPosition = .region(Self.startRegion)
    @State var selectedID: String?
    @State var cameraDistance: Double?
    @State var locationManager = CLLocationManager()
    @Namespace var mapScope

    var groups: [MarkerGroup] { MarkerGroup.groups(markers) }
    var selectedGroup: MarkerGroup? { groups.first { $0.id == selectedID } }

    var body: some View {
        Map(position: $position, scope: mapScope) {
            UserAnnotation()
            ForEach(groups) { group in
                Annotation("", coordinate: group.coordinate, anchor: .center) {
                    Button {
                        withAnimation(.snappy) { selectedID = selectedID == group.id ? nil : group.id }
                    } label: {
                        if group.markers.count == 1, let marker = group.markers.first {
                            MarkerPin(marker: marker, isSelected: group.id == selectedID)
                        } else {
                            ClusterPin(count: group.markers.count, isSelected: group.id == selectedID)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(accessibilityLabel(for: group)))
                }
                .annotationTitles(.hidden)
            }
        }
        .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll))
        .mapControls {}
        .environment(\.colorScheme, .dark)
        .onMapCameraChange { context in
            cameraDistance = context.camera.distance
        }
        .overlay(alignment: .bottom) {
            LinearGradient(colors: [.black.opacity(0), .black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                .frame(height: 260)
                .ignoresSafeArea()
                .allowsHitTesting(false)
        }
        .safeAreaInset(edge: .top) { header }
        .safeAreaInset(edge: .bottom) {
            if let group = selectedGroup {
                MarkerGroupPreview(group: group) {
                    withAnimation(.snappy) { selectedID = nil }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .mapScope(mapScope)
        .task {
            await centerOnFirstLocation()
        }
    }

    var header: some View {
        HStack(alignment: .top) {
            Text("Karta")
                .font(Theme.title(32))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.6), radius: 8)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            VStack(spacing: 8) {
                MapUserLocationButton(scope: mapScope)
                MapCompass(scope: mapScope)
            }
            .buttonBorderShape(.circle)
            .tint(.white)
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .overlay(alignment: .bottom) {
            if let errorMessage {
                ErrorCard(message: errorMessage, retry: reload)
                    .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .padding(.horizontal, 14)
                    .offset(y: 90)
            }
        }
    }

    func accessibilityLabel(for group: MarkerGroup) -> String {
        if group.markers.count == 1, let marker = group.markers.first {
            let price = marker.beer.flatMap { Formatting.beerPrice($0.priceKr, isHappyHour: $0.isHappyHourPrice) }
            return [marker.title, "betyg \(Int(marker.overallRating.rounded())) av 3", price].compactMap { $0 }.joined(separator: ", ")
        }
        return "\(group.markers.count) barer på \(group.markers.first?.location ?? "samma adress")"
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

/// Rating in an amber ring; the price label to the right does not take taps.
struct MarkerPin: View {
    let marker: ReviewMarker
    let isSelected: Bool

    var body: some View {
        let size: CGFloat = isSelected ? 38 : 28
        Text(verbatim: "\(Int(marker.overallRating.rounded()))")
            .font(.system(size: isSelected ? 16 : 13, weight: .black, design: .rounded))
            .foregroundStyle(isSelected ? Color.black : Theme.amber)
            .frame(width: size, height: size)
            .background(Circle().fill(isSelected ? Theme.amber : Color.black))
            .overlay(Circle().strokeBorder(Theme.amber, lineWidth: 2))
            .shadow(color: Theme.amber.opacity(isSelected ? 0.8 : 0.35), radius: isSelected ? 14 : 6)
            .contentShape(Circle())
            .overlay(alignment: .leading) {
                if let beer = marker.beer, let price = Formatting.beerPrice(beer.priceKr, isHappyHour: beer.isHappyHourPrice) {
                    Text(price)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(isSelected ? Theme.amber : .white)
                        .fixedSize()
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(.black.opacity(0.75)))
                        .offset(x: size + 5)
                        .allowsHitTesting(false)
                }
            }
            .animation(.snappy, value: isSelected)
    }
}

/// Several bars at one address.
struct ClusterPin: View {
    let count: Int
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "square.stack.fill").font(.system(size: 11, weight: .bold))
            Text("\(count) barer").font(.system(size: 13, weight: .heavy, design: .rounded))
        }
        .foregroundStyle(isSelected ? Color.black : .white)
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(Capsule().fill(isSelected ? Theme.amber : Color(white: 0.16)))
        .overlay(Capsule().strokeBorder(isSelected ? Theme.amber : .white.opacity(0.7), lineWidth: 1.5))
        .background(
            Capsule().fill(Color(white: 0.1))
                .overlay(Capsule().strokeBorder(.white.opacity(0.3), lineWidth: 1))
                .offset(x: 3, y: 3)
        )
        .contentShape(Capsule())
    }
}

/// The selected marker: photo, rating, title, address, price, and a link to the review.
/// For several bars at one address, a list of them.
struct MarkerGroupPreview: View {
    let group: MarkerGroup
    let close: () -> Void
    @Environment(AppModel.self) var app

    var body: some View {
        VStack(spacing: 12) {
            if group.markers.count == 1, let marker = group.markers.first {
                single(marker)
                HStack(spacing: 10) {
                    NavigationLink(value: Route.review(slug: marker.slug, preview: review(for: marker))) {
                        ButtonLabel(text: "Visa recension", icon: "arrow.right")
                    }
                    .buttonStyle(PrimaryButtonStyle(height: 48))
                    closeButton
                }
            } else {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(group.markers.count) barer").font(Theme.title(21)).foregroundStyle(.white)
                        Text(group.markers.first?.location ?? "").font(Theme.body(13)).foregroundStyle(Theme.secondary).lineLimit(1)
                    }
                    Spacer()
                    closeButton
                }
                VStack(spacing: 8) {
                    ForEach(group.markers, id: \.slug) { marker in
                        NavigationLink(value: Route.review(slug: marker.slug, preview: review(for: marker))) {
                            HStack(spacing: 10) {
                                Stars(rating: Int(marker.overallRating.rounded()), size: 11)
                                Text(marker.title).font(Theme.body(15, .semibold)).foregroundStyle(.white).lineLimit(1)
                                Spacer()
                                PriceLabel(priceKr: marker.beer?.priceKr, isHappyHour: marker.beer?.isHappyHourPrice ?? false, size: 18, glow: false)
                                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.tertiary)
                            }
                            .padding(.horizontal, 12)
                            .frame(height: 46)
                            .cardBackground(14, fill: Color.white.opacity(0.06))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(14)
        .background(Color(white: 0.09), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 1))
    }

    var closeButton: some View {
        Button(action: close) {
            Image(systemName: "xmark")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(Color.white.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("Stäng"))
    }

    /// The list item for the marker, when the list has loaded it. Markers have no photo.
    func review(for marker: ReviewMarker) -> Review? {
        app.reviewList.reviews.first { $0.slug == marker.slug }
    }

    func single(_ marker: ReviewMarker) -> some View {
        HStack(alignment: .center, spacing: 14) {
            if let review = review(for: marker) {
                ReviewPhoto(image: review.image)
                    .frame(width: 86, height: 86)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 4) {
                RatingLine(rating: Int(marker.overallRating.rounded()), size: 12)
                Text(marker.title)
                    .font(Theme.title(21))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(marker.location).font(Theme.body(13)).foregroundStyle(Theme.secondary).lineLimit(2)
            }
            Spacer(minLength: 0)
            PriceLabel(priceKr: marker.beer?.priceKr, isHappyHour: marker.beer?.isHappyHourPrice ?? false, size: 30)
        }
        .accessibilityElement(children: .combine)
    }
}
#endif
