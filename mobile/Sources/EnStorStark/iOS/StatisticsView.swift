#if !os(Android)
import SwiftUI
import EnStorStarkModel

/// Statistics from published reviews.
struct StatisticsView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.statistics
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Allt bygger på publicerade recensioner. Priser med en asterisk är happy hour-priser.")
                    .font(Theme.body(14))
                    .foregroundStyle(Theme.secondary)
                    .padding(.bottom, 4)
                if let errorMessage = loader.errorMessage {
                    ErrorCard(message: errorMessage) { await loader.load() }
                }
                if let statistics = loader.value {
                    if statistics.totalReviews == 0 {
                        EmptyState(
                            icon: "chart.bar",
                            title: "Ingen statistik än",
                            message: "Statistiken vaknar till liv när den första recensionen har publicerats."
                        )
                    } else {
                        StatisticsContent(statistics: statistics)
                    }
                } else if loader.errorMessage == nil {
                    ProgressView().tint(Theme.amber).frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .refreshable { await loader.load() }
        .task { await loader.loadIfNeeded() }
    }
}

struct StatisticsContent: View {
    let statistics: ReviewStatistics

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            hero
            HStack(spacing: 12) {
                averagePrice
                averageRating
            }
            .fixedSize(horizontal: false, vertical: true)
            if let cheapest = statistics.cheapestBars.first, let priciest = statistics.mostExpensiveBars.first {
                HStack(spacing: 12) {
                    PriceExtreme(title: "Billigast", priceKr: cheapest.beerPriceKr, bars: statistics.cheapestBars, tint: Theme.good)
                    PriceExtreme(title: "Dyrast", priceKr: priciest.beerPriceKr, bars: statistics.mostExpensiveBars, tint: Theme.bad)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            happyHour
        }
    }

    var hero: some View {
        VStack(alignment: .leading, spacing: 2) {
            Eyebrow(text: "Recenserade barer")
            Text(verbatim: "\(statistics.totalReviews)")
                .font(Theme.num(76))
                .foregroundStyle(Theme.amber)
                .glow(radius: 18)
            Text("varav \(statistics.gothenburgReviews) i Göteborg")
                .font(Theme.body(14, .semibold))
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .cardBackground(26)
        .accessibilityElement(children: .combine)
    }

    var averagePrice: some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(text: "Snittpris")
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: statistics.averageBeerPrice.map { Formatting.decimal($0, maximumFractionDigits: 0) } ?? "–")
                    .font(Theme.num(38))
                    .foregroundStyle(.white)
                Text(verbatim: "kr").font(Theme.num(15)).foregroundStyle(Theme.secondary)
            }
            Text("Baserat på \(statistics.priceReviewCount) prisuppgifter.")
                .font(Theme.body(12))
                .foregroundStyle(Theme.tertiary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .cardBackground(22)
        .accessibilityElement(children: .combine)
    }

    var averageRating: some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(text: "Snittbetyg")
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(verbatim: statistics.averageRating.map { Formatting.decimal($0) } ?? "–")
                    .font(Theme.num(38))
                    .foregroundStyle(.white)
                Text(verbatim: "/3").font(Theme.num(15)).foregroundStyle(Theme.secondary)
            }
            Stars(rating: Int((statistics.averageRating ?? 0).rounded()), size: 13)
            Text("Helhetsintrycket.").font(Theme.body(12)).foregroundStyle(Theme.tertiary)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .cardBackground(22)
        .accessibilityElement(children: .combine)
    }

    var happyHour: some View {
        HStack(spacing: 12) {
            Image(systemName: "clock.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(.black)
                .frame(width: 44, height: 44)
                .background(Theme.amber, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text("Happy hour-fynd: \(statistics.happyHourReviewCount)")
                    .font(Theme.body(16, .bold))
                    .foregroundStyle(.white)
                Text(statistics.happyHourPercentage.map {
                    "\(Formatting.decimal($0, maximumFractionDigits: 0)) % av prisuppgifterna."
                } ?? "Inga prisuppgifter än.")
                    .font(Theme.body(13))
                    .foregroundStyle(Theme.secondary)
            }
            Spacer()
        }
        .padding(14)
        .cardBackground(22)
        .accessibilityElement(children: .combine)
    }
}

struct PriceExtreme: View {
    let title: String
    let priceKr: Int
    let bars: [StatisticBar]
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow(text: title, color: tint)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: "\(priceKr)").font(Theme.num(38)).foregroundStyle(tint).shadow(color: tint.opacity(0.5), radius: 10)
                Text(verbatim: "kr").font(Theme.num(15)).foregroundStyle(tint)
            }
            .accessibilityLabel(Text("\(title): \(priceKr) kronor"))
            ForEach(bars, id: \.slug) { bar in
                NavigationLink(value: Route.review(slug: bar.slug, preview: nil)) {
                    HStack(spacing: 4) {
                        Text(bar.title + (bar.isHappyHourPrice ? " *" : ""))
                            .font(Theme.body(13, .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
#endif
