#if os(Android)
import SwiftUI
import EnStorStarkModel

/// The bars with a place on the map.
///
/// There is no Android map yet (Google Maps needs a Cloud project and an API key), so this lists
/// the markers in the design's map pin style. Markers come only from the server's geocode cache.
struct ReviewMapView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.map
        let markers = loader.value?.markers ?? []
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 12) {
                    AmberDisc(icon: .map)
                    Text("Kartan finns inte på Android än. Här är barerna som har en plats på kartan.")
                        .font(Ess.bodyMedium)
                        .foregroundStyle(Ess.secondary)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .essCard()
                .padding(.bottom, 8)
                if let errorMessage = loader.errorMessage {
                    ErrorCard(message: errorMessage) { await loader.load() }
                }
                if loader.value == nil && loader.errorMessage == nil {
                    EssProgress().frame(maxWidth: .infinity).padding(.top, 60)
                }
                ForEach(markers, id: \.slug) { marker in
                    NavigationLink(value: Route.review(slug: marker.slug, preview: nil)) {
                        MarkerRow(marker: marker)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Ess.bg)
        .refreshable { await app.map.load() }
        .task {
            await loader.load()
            await app.resolveNextMapMarker()
        }
    }
}

/// A marker: the rating in a map pin, the bar and its address, and the price.
struct MarkerRow: View {
    let marker: ReviewMarker

    var body: some View {
        let rating = Int(marker.overallRating.rounded())
        HStack(spacing: 14) {
            Text(verbatim: "\(rating)")
                .font(Ess.num(15))
                .foregroundStyle(Ess.amber)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Color.black))
                .overlay(Circle().stroke(Ess.amber, lineWidth: 2))
            VStack(alignment: .leading, spacing: 2) {
                Text(marker.title).font(.system(size: 16, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                Text(marker.location).font(Ess.bodySmall).foregroundStyle(Ess.secondary).lineLimit(1)
                Stars(rating: rating, size: 11)
            }
            Spacer(minLength: 8)
            if let beer = marker.beer {
                PriceLabel(priceKr: beer.priceKr, isHappyHour: beer.isHappyHourPrice, size: 22)
            }
            EssIconView(.chevronRight, size: 20, color: Ess.tertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .essCard(20)
    }
}
#endif
