#if os(Android)
import SwiftUI
import EnStorStarkModel

/// Statistics from published reviews (Droid07).
struct StatisticsView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.statistics
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Allt bygger på publicerade recensioner. Priser med en asterisk är happy hour-priser.")
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Ess.secondary)
                if let errorMessage = loader.errorMessage {
                    ErrorCard(message: errorMessage) { await loader.load() }
                }
                if let statistics = loader.value {
                    if statistics.totalReviews == 0 {
                        EmptyState(
                            icon: .chart,
                            title: "Ingen statistik än",
                            message: "Statistiken vaknar till liv när den första recensionen har publicerats."
                        )
                    } else {
                        StatisticsContent(statistics: statistics)
                    }
                } else if loader.errorMessage == nil {
                    EssProgress().frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Ess.bg)
        .refreshable { await loader.load() }
        .task { await loader.loadIfNeeded() }
    }
}

struct StatisticsContent: View {
    let statistics: ReviewStatistics

    var body: some View {
        // Plain stacks, not LazyVGrid: on Android a lazy grid must be the only child of its
        // ScrollView, otherwise Compose measures the scroll content too short.
        VStack(alignment: .leading, spacing: 12) {
            StatCard(title: "Recenserade barer") {
                Text(verbatim: "\(statistics.totalReviews)")
                    .font(Ess.num(84))
                    .foregroundStyle(Ess.amber)
                    .glow(radius: 20)
                Text("varav \(statistics.gothenburgReviews) i Göteborg")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
            }
            HStack(alignment: .top, spacing: 12) {
                StatCard(title: "Snittpris") {
                    HStack(alignment: .lastTextBaseline, spacing: 3) {
                        Text(verbatim: statistics.averageBeerPrice.map { Formatting.decimal($0, maximumFractionDigits: 0) } ?? "–")
                            .font(Ess.num(38))
                            .foregroundStyle(.white)
                        Text(verbatim: "kr").font(Ess.num(15)).foregroundStyle(Ess.secondary)
                    }
                    Text("Baserat på \(statistics.priceReviewCount) prisuppgifter.")
                        .font(Ess.bodySmall)
                        .foregroundStyle(Ess.secondary)
                }
                StatCard(title: "Snittbetyg") {
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        Text(verbatim: statistics.averageRating.map { Formatting.decimal($0) } ?? "–")
                            .font(Ess.num(38))
                            .foregroundStyle(.white)
                        Text(verbatim: "/3").font(Ess.num(15)).foregroundStyle(Ess.secondary)
                    }
                    Stars(rating: Int((statistics.averageRating ?? 0).rounded()), size: 13)
                    Text("Helhetsintrycket.").font(Ess.bodySmall).foregroundStyle(Ess.secondary)
                }
            }
            if let cheapest = statistics.cheapestBars.first, let priciest = statistics.mostExpensiveBars.first {
                HStack(alignment: .top, spacing: 12) {
                    PriceExtreme(title: "Billigast", priceKr: cheapest.beerPriceKr, bars: statistics.cheapestBars,
                                 tint: Ess.good, fill: Ess.goodContainer)
                    PriceExtreme(title: "Dyrast", priceKr: priciest.beerPriceKr, bars: statistics.mostExpensiveBars,
                                 tint: Ess.bad, fill: Ess.badContainer)
                }
            }
            HStack(spacing: 16) {
                AmberDisc(icon: .clock, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Happy hour-fynd: \(statistics.happyHourReviewCount)")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                    Text(statistics.happyHourPercentage.map {
                        "\(Formatting.decimal($0, maximumFractionDigits: 0)) % av prisuppgifterna."
                    } ?? "Inga prisuppgifter än.")
                        .font(Ess.bodyMedium)
                        .foregroundStyle(Ess.secondary)
                }
                Spacer()
            }
            .padding(16)
            .essCard()
        }
    }
}

/// A raised card with a section label.
struct StatCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: title)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(18)
        .essCard()
    }
}

struct PriceExtreme: View {
    let title: String
    let priceKr: Int
    let bars: [StatisticBar]
    let tint: Color
    let fill: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: title, color: tint)
            PriceLabel(priceKr: priceKr, size: 40, color: tint)
            ForEach(bars, id: \.slug) { bar in
                NavigationLink(value: Route.review(slug: bar.slug, preview: nil)) {
                    HStack(spacing: 4) {
                        Text(bar.title + (bar.isHappyHourPrice ? " *" : ""))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        EssIconView(.chevronRight, size: 18, color: Ess.secondary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(18)
        .essCard(fill: fill)
    }
}
#endif
