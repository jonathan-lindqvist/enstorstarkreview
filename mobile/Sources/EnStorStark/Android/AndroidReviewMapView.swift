import SwiftUI
import EnStorStarkModel

#if os(Android)
/// The map of published reviews (Studio Droid06).
///
/// Google Maps draws the map (`Skip/ReviewGoogleMap.kt`), as Apple Maps does on iOS: each
/// platform uses its own map. Markers come only from the server's geocode cache. The map starts
/// on Göteborg and never fits itself to the markers. The device location is shown on the map
/// only, and the app never sends it to the API. A build without a Google Maps key lists the
/// places instead.
struct ReviewMapView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        if googleMapsAvailable() {
            ReviewGoogleMapView()
        } else {
            ReviewPlaceList()
        }
    }
}

struct ReviewGoogleMapView: View {
    @Environment(AppModel.self) var app
    @State var selectedID: String?
    @State var recenterRequest = 0
    @State var headerBottom: CGFloat = 0
    @State var bottomHeight: CGFloat = 0
    @State var openedReview: ReviewMarker?

    var body: some View {
        let loader = app.map
        let groups = MapGroup.groups(loader.value?.markers ?? [])
        let selectedGroup = groups.first { $0.id == selectedID }
        ZStack(alignment: .top) {
            ComposeView {
                ReviewMapComposer(
                    ids: groups.map(\.id),
                    latitudes: groups.map(\.latitude),
                    longitudes: groups.map(\.longitude),
                    ratings: groups.map { Int(($0.markers.first?.overallRating ?? 0).rounded()) },
                    prices: groups.map { $0.priceLabel ?? "" },
                    counts: groups.map(\.markers.count),
                    labels: groups.map(\.accessibilityLabel),
                    selectedID: selectedID ?? "",
                    recenterRequest: recenterRequest,
                    topInset: Double(headerBottom),
                    bottomInset: Double(bottomHeight),
                    onSelect: { id in selectedID = id.isEmpty ? nil : id }
                )
            }
            .ignoresSafeArea(edges: .top)
            header
        }
        .overlay(alignment: .bottom) {
            VStack(alignment: .trailing, spacing: 12) {
                locationButton
                if let group = selectedGroup {
                    MapGroupPreview(group: group, open: { openedReview = $0 }, close: { selectedID = nil })
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(16)
            .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { height in
                bottomHeight = height
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: Binding(get: { openedReview != nil }, set: { if !$0 { openedReview = nil } })) {
            if let marker = openedReview {
                RouteView(route: .review(slug: marker.slug, preview: app.reviewList.reviews.first { $0.slug == marker.slug }))
            }
        }
        .task {
            await loader.load()
            await app.resolveNextMapMarker()
        }
        .task {
            // The preview takes the photo from the list, because markers have no photo.
            if app.reviewList.reviews.isEmpty { await app.reviewList.load() }
        }
    }

    /// "Karta" over a gradient from the surface, so the status bar stays readable.
    var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Karta")
                .font(Ess.displaySmall)
                .foregroundStyle(Ess.onSurface)
                .padding(.top, 8)
                .accessibilityAddTraits(.isHeader)
            if let errorMessage = app.map.errorMessage {
                ErrorCard(message: errorMessage) { await app.map.load() }
                    .background(RoundedRectangle(cornerRadius: 16).fill(Ess.surface))
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            LinearGradient(colors: [Ess.surface, Ess.surface.opacity(0)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top)
                .allowsHitTesting(false)
        }
        .onGeometryChange(for: CGFloat.self, of: { $0.frame(in: .global).maxY }) { bottom in
            headerBottom = bottom
        }
    }

    /// The Material small FAB that moves the map to the device location.
    var locationButton: some View {
        Button { recenterRequest += 1 } label: {
            MIcon("my_location", size: 24, color: Ess.onSurface)
                .frame(width: 48, height: 48)
                .background(RoundedRectangle(cornerRadius: 14).fill(Ess.high))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("Min position"))
    }
}

/// Reviews at one address. Several bars can share an address (for example in one building),
/// so they share one marker.
struct MapGroup {
    let id: String
    let latitude: Double
    let longitude: Double
    let markers: [ReviewMarker]

    /// Groups markers whose coordinates are equal to about one metre.
    static func groups(_ markers: [ReviewMarker]) -> [MapGroup] {
        var order: [String] = []
        var byKey: [String: [ReviewMarker]] = [:]
        for marker in markers {
            let key = "\((marker.latitude * 100_000).rounded()),\((marker.longitude * 100_000).rounded())"
            if byKey[key] == nil { order.append(key) }
            byKey[key, default: []].append(marker)
        }
        return order.compactMap { key in
            guard let members = byKey[key], let first = members.first else { return nil }
            return MapGroup(
                id: key,
                latitude: first.latitude,
                longitude: first.longitude,
                markers: members.sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
            )
        }
    }

    var priceLabel: String? {
        guard markers.count == 1, let beer = markers.first?.beer else { return nil }
        return Formatting.beerPrice(beer.priceKr, isHappyHour: beer.isHappyHourPrice)
    }

    var accessibilityLabel: String {
        if markers.count == 1, let marker = markers.first {
            return [marker.title, "betyg \(Int(marker.overallRating.rounded())) av 3", priceLabel].compactMap { $0 }.joined(separator: ", ")
        }
        return "\(markers.count) barer på \(markers.first?.location ?? "samma adress")"
    }
}

/// The selected marker as an elevated card: photo, rating, title, address, price, and
/// "Visa recension". For several bars at one address, a list of them.
struct MapGroupPreview: View {
    let group: MapGroup
    let open: (ReviewMarker) -> Void
    let close: () -> Void
    @Environment(AppModel.self) var app

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if group.markers.count == 1, let marker = group.markers.first {
                single(marker)
                HStack(spacing: 8) {
                    M3Button(text: "Visa recension", icon: "arrow_forward", iconAfter: true, height: 48) { open(marker) }
                    closeButton
                }
            } else {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: "\(group.markers.count) barer").font(Ess.titleLarge).foregroundStyle(Ess.onSurface)
                        Text(group.markers.first?.location ?? "").font(Ess.bodySmall).foregroundStyle(Ess.variant).lineLimit(1)
                    }
                    Spacer()
                    closeButton
                }
                VStack(spacing: 8) {
                    ForEach(group.markers, id: \.slug) { marker in
                        Button { open(marker) } label: {
                            HStack(spacing: 10) {
                                Stars(rating: Int(marker.overallRating.rounded()), size: 11)
                                Text(marker.title).font(Ess.titleSmall).foregroundStyle(Ess.onSurface).lineLimit(1)
                                Spacer()
                                PriceText(priceKr: marker.beer?.priceKr, isHappyHour: marker.beer?.isHappyHourPrice ?? false, size: 18)
                                MIcon("chevron_right", size: 18, color: Ess.variant)
                            }
                            .padding(.horizontal, 12)
                            .frame(height: 48)
                            .tonal(Ess.highest, radius: 14)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(14)
        .tonal(Ess.high, radius: 24)
        .shadow(color: Color.black.opacity(0.4), radius: 8, y: 2)
    }

    /// The Material outlined icon button.
    var closeButton: some View {
        Button(action: close) {
            MIcon("close", size: 24, color: Ess.onSurface)
                .frame(width: 48, height: 48)
                .overlay(Circle().stroke(Ess.outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("Stäng"))
    }

    func single(_ marker: ReviewMarker) -> some View {
        let rating = Int(marker.overallRating.rounded())
        return HStack(alignment: .center, spacing: 12) {
            if let review = app.reviewList.reviews.first(where: { $0.slug == marker.slug }) {
                FocusedImage(path: review.image.url, focusX: review.image.focusX, focusY: review.image.focusY)
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            VStack(alignment: .leading, spacing: 2) {
                RatingLine(rating: rating, size: 12)
                Text(marker.title).font(Ess.titleLarge).foregroundStyle(Ess.onSurface).lineLimit(1)
                Text(marker.location).font(Ess.bodySmall).foregroundStyle(Ess.variant).lineLimit(1)
            }
            Spacer(minLength: 0)
            PriceText(priceKr: marker.beer?.priceKr, isHappyHour: marker.beer?.isHappyHourPrice ?? false, size: 26)
        }
    }
}
/// The places of published reviews as a list, for builds without a Google Maps key.
/// A tap on an address opens it in the map app.
struct ReviewPlaceList: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.map
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Kartan är inte tillgänglig i den här versionen. Tryck på en adress för att öppna den i kartappen.")
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Ess.variant)
                if let errorMessage = loader.errorMessage {
                    ErrorCard(message: errorMessage) { await loader.load() }
                }
                ForEach(loader.value?.markers ?? [], id: \.slug) { marker in
                    MarkerCard(marker: marker)
                }
                if loader.value == nil && loader.errorMessage == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .refreshable {
            await app.map.load()
        }
        .task {
            await loader.load()
            await app.resolveNextMapMarker()
        }
    }
}

/// Title, address, rating, and price of a marker. A tap opens the review.
struct MarkerCard: View {
    let marker: ReviewMarker

    var body: some View {
        let rating = Int(marker.overallRating.rounded())
        NavigationLink(value: Route.review(slug: marker.slug, preview: nil)) {
            HStack(spacing: 14) {
                Text(verbatim: "\(rating)")
                    .font(Ess.num(17))
                    .foregroundStyle(Ess.amber)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Color.black))
                    .overlay(Circle().stroke(Ess.amber, lineWidth: 2))
                VStack(alignment: .leading, spacing: 3) {
                    Text(marker.title).font(Ess.titleMedium).foregroundStyle(Ess.onSurface).lineLimit(1)
                    RatingLine(rating: rating, size: 11)
                    if let url = ExternalLinks.mapsURL(for: marker.location) {
                        Link(destination: url) {
                            HStack(spacing: 4) {
                                MIcon("place", size: 14, color: Ess.amber)
                                Text(marker.location).font(Ess.bodySmall).foregroundStyle(Ess.amber).lineLimit(1)
                            }
                        }
                    }
                }
                Spacer(minLength: 8)
                if let beer = marker.beer {
                    PriceText(priceKr: beer.priceKr, isHappyHour: beer.isHappyHourPrice, size: 22)
                }
            }
            .padding(14)
            .tonal(Ess.low, radius: 20)
        }
        .buttonStyle(.plain)
    }
}
#endif

#if SKIP
import androidx.compose.runtime.Composable

/// True when the build has a Google Maps key (see `hasGoogleMapsKey` in Skip/ReviewGoogleMap.kt).
public func googleMapsAvailable() -> Bool {
    return hasGoogleMapsKey(ProcessInfo.processInfo.androidContext)
}

/// Builds the marker list for `ReviewGoogleMap` (Skip/ReviewGoogleMap.kt). The arrays have one
/// item for each marker group.
struct ReviewMapComposer: ContentComposer {
    let ids: [String]
    let latitudes: [Double]
    let longitudes: [Double]
    let ratings: [Int]
    let prices: [String]
    let counts: [Int]
    let labels: [String]
    let selectedID: String
    let recenterRequest: Int
    let topInset: Double
    let bottomInset: Double
    let onSelect: (String) -> Void

    init(ids: [String], latitudes: [Double], longitudes: [Double], ratings: [Int], prices: [String], counts: [Int],
         labels: [String], selectedID: String, recenterRequest: Int, topInset: Double, bottomInset: Double,
         onSelect: @escaping (String) -> Void) {
        self.ids = ids
        self.latitudes = latitudes
        self.longitudes = longitudes
        self.ratings = ratings
        self.prices = prices
        self.counts = counts
        self.labels = labels
        self.selectedID = selectedID
        self.recenterRequest = recenterRequest
        self.topInset = topInset
        self.bottomInset = bottomInset
        self.onSelect = onSelect
    }

    @Composable func Compose(context: ComposeContext) {
        var pins: [MapPinSpec] = []
        for index in 0..<ids.count {
            pins.append(MapPinSpec(id: ids[index], latitude: latitudes[index], longitude: longitudes[index],
                                   rating: ratings[index], price: prices[index], count: counts[index],
                                   accessibilityLabel: labels[index]))
        }
        ReviewGoogleMap(pins: pins, selectedID: selectedID, recenterRequest: recenterRequest,
                        topInset: topInset, bottomInset: bottomInset, onSelect: onSelect)
    }
}
#endif
