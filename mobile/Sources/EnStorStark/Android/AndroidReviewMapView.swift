import SwiftUI
import EnStorStarkModel

// Android keeps the plain system screens until the Android design exists.
#if os(Android)
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
                await app.resolveNextMapMarker()
            }
    }

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

#endif
