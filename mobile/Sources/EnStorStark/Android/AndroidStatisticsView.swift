import SwiftUI
import EnStorStarkModel

#if os(Android)
/// Statistik: tonal cards for the totals, the averages, the cheapest and the most expensive
/// bar, and the happy-hour finds.
struct StatisticsView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.statistics
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let errorMessage = loader.errorMessage {
                    ErrorCard(message: errorMessage) { await loader.load() }
                }
                if let statistics = loader.value {
                    if statistics.totalReviews == 0 {
                        EmptyState(icon: "beer", title: "Ingen statistik än",
                                   message: "Statistiken vaknar till liv när den första recensionen har publicerats.")
                    } else {
                        StatisticsContent(statistics: statistics)
                    }
                } else if loader.errorMessage == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .refreshable {
            await loader.load()
        }
        .task {
            await loader.loadIfNeeded()
        }
    }
}

struct StatisticsContent: View {
    let statistics: ReviewStatistics

    var body: some View {
        // Plain stacks, not LazyVGrid: on Android a lazy grid must be the only child of its
        // ScrollView, otherwise Compose measures the scroll content too short.
        VStack(alignment: .leading, spacing: 12) {
            Text("Allt bygger på publicerade recensioner. Priser med en asterisk är happy hour-priser.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.variant)

            StatCard(title: "Recenserade barer") {
                Text(verbatim: "\(statistics.totalReviews)").font(Ess.num(72)).foregroundStyle(Ess.amber)
                Text(verbatim: "varav \(statistics.gothenburgReviews) i Göteborg").font(Ess.titleSmall).foregroundStyle(Ess.onSurface)
            }

            HStack(alignment: .top, spacing: 12) {
                StatCard(title: "Snittpris") {
                    if let average = statistics.averageBeerPrice {
                        HStack(alignment: .lastTextBaseline, spacing: 3) {
                            Text(verbatim: Formatting.decimal(average, maximumFractionDigits: 0)).font(Ess.num(38))
                            Text(verbatim: "kr").font(Ess.num(16))
                        }
                        .foregroundStyle(Ess.onSurface)
                    } else {
                        Text(verbatim: "–").font(Ess.num(38)).foregroundStyle(Ess.outline)
                    }
                    Text(verbatim: "Baserat på \(statistics.priceReviewCount) prisuppgifter.")
                        .font(Ess.bodySmall).foregroundStyle(Ess.variant)
                }
                StatCard(title: "Snittbetyg") {
                    if let average = statistics.averageRating {
                        HStack(alignment: .lastTextBaseline, spacing: 2) {
                            Text(verbatim: Formatting.decimal(average)).font(Ess.num(38)).foregroundStyle(Ess.onSurface)
                            Text(verbatim: "/3").font(Ess.num(15)).foregroundStyle(Ess.variant)
                        }
                        Stars(rating: Int(average.rounded()), size: 13)
                    } else {
                        Text(verbatim: "–").font(Ess.num(38)).foregroundStyle(Ess.outline)
                    }
                    Text("Helhetsintrycket.").font(Ess.bodySmall).foregroundStyle(Ess.variant)
                }
            }

            if let cheapest = statistics.cheapestBars.first, let priciest = statistics.mostExpensiveBars.first {
                HStack(alignment: .top, spacing: 12) {
                    PriceExtremeCard(title: "Billigast", bar: cheapest, tint: Ess.good, container: Ess.goodContainer)
                    PriceExtremeCard(title: "Dyrast", bar: priciest, tint: Ess.error, container: Ess.errorContainer)
                }
            }

            HStack(spacing: 14) {
                MIcon("schedule", size: 24, color: Ess.onAmber)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Ess.amber))
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: "Happy hour-fynd: \(statistics.happyHourReviewCount)")
                        .font(Ess.titleMedium).foregroundStyle(Ess.onSurface)
                    Text(verbatim: statistics.happyHourPercentage.map {
                        "\(Formatting.decimal($0, maximumFractionDigits: 0)) % av prisuppgifterna."
                    } ?? "Inga prisuppgifter än.")
                    .font(Ess.bodyMedium).foregroundStyle(Ess.variant)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .tonal(Ess.low, radius: 20)

            Text("* Pris registrerat under happy hour. Det ingår i prisstatistiken.")
                .font(Ess.bodySmall)
                .foregroundStyle(Ess.outline)
        }
    }
}

struct StatCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Ess.labelMedium).foregroundStyle(Ess.variant)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .tonal(Ess.low, radius: 20)
    }
}

/// The cheapest or the most expensive bar. A tap opens the review.
struct PriceExtremeCard: View {
    let title: String
    let bar: StatisticBar
    let tint: Color
    let container: Color

    var body: some View {
        NavigationLink(value: Route.review(slug: bar.slug, preview: nil)) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(Ess.labelMedium).foregroundStyle(tint)
                PriceText(priceKr: bar.beerPriceKr, isHappyHour: bar.isHappyHourPrice, size: 38, color: tint)
                HStack(spacing: 4) {
                    Text(bar.title).font(Ess.titleSmall).foregroundStyle(Ess.onSurface).lineLimit(1)
                    Spacer(minLength: 0)
                    MIcon("chevron_right", size: 18, color: Ess.variant)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .tonal(container.opacity(0.6), radius: 20)
        }
        .buttonStyle(.plain)
    }
}
#endif
