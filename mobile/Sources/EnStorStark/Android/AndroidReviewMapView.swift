import SwiftUI
import EnStorStarkModel

#if os(Android)
/// The places of published reviews.
///
/// Markers come only from the server's geocode cache. Android has no map yet, so it lists
/// the places with a link to the map app.
struct ReviewMapView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.map
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Barerna som har en plats på kartan. Tryck på adressen för att öppna den i kartappen.")
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
