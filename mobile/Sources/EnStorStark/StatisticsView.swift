import SwiftUI
import EnStorStarkModel

struct StatisticsView: View {
    @Environment(AppModel.self) var app

    var body: some View {
        let loader = app.statistics
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage = loader.errorMessage {
                    ErrorBanner(message: errorMessage) { await loader.load() }
                }
                if let statistics = loader.value {
                    if statistics.totalReviews == 0 {
                        EmptyStateView(
                            systemImage: "chart.bar",
                            title: "Ingen statistik än",
                            message: "Statistiken vaknar till liv när den första recensionen har publicerats."
                        )
                    } else {
                        StatisticsContent(statistics: statistics)
                    }
                } else if loader.errorMessage == nil {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                }
            }
            .padding()
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
        VStack(alignment: .leading, spacing: 16) {
            Text("Allt bygger på publicerade recensioner. Priser med en asterisk är happy hour-priser.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Plain stacks, not LazyVGrid: on Android a lazy grid must be the only child of its
            // ScrollView, otherwise Compose measures the scroll content too short.
            VStack(spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    StatCard(
                        title: "Recenserade barer",
                        value: "\(statistics.totalReviews)",
                        caption: "Publicerade ställen att välja mellan."
                    )
                    StatCard(
                        title: "I Göteborg",
                        value: "\(statistics.gothenburgReviews)",
                        caption: "Recensioner med Göteborg i adressen."
                    )
                }
                HStack(alignment: .top, spacing: 12) {
                    StatCard(
                        title: "Snittpris",
                        value: statistics.averageBeerPrice.map { "\(Formatting.decimal($0)) kr" } ?? "–",
                        caption: "Baserat på \(statistics.priceReviewCount) prisuppgifter."
                    )
                    StatCard(
                        title: "Snittbetyg",
                        value: statistics.averageRating.map { "\(Formatting.decimal($0))/3" } ?? "–",
                        caption: "Helhetsintrycket från alla publicerade barer."
                    )
                }
                HStack(alignment: .top, spacing: 12) {
                    StatCard(
                        title: "Happy hour-fynd",
                        value: "\(statistics.happyHourReviewCount)",
                        caption: statistics.happyHourPercentage.map {
                            "\(Formatting.decimal($0, maximumFractionDigits: 0)) % av prisuppgifterna."
                        } ?? "Inga prisuppgifter än."
                    )
                    Color.clear
                        .frame(maxWidth: .infinity)
                }
            }

            if let cheapest = statistics.cheapestBars.first, let priciest = statistics.mostExpensiveBars.first {
                PriceExtremeSection(title: "Billigast", priceKr: cheapest.beerPriceKr, bars: statistics.cheapestBars, tint: .green)
                PriceExtremeSection(title: "Dyrast", priceKr: priciest.beerPriceKr, bars: statistics.mostExpensiveBars, tint: .red)
                Text("* Pris registrerat under happy hour. Det ingår i prisstatistiken.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct StatCard: View {
    let title: LocalizedStringKey
    let value: String
    let caption: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title.bold())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(caption)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.secondary.opacity(0.1)))
    }
}

struct PriceExtremeSection: View {
    let title: LocalizedStringKey
    let priceKr: Int
    let bars: [StatisticBar]
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(tint)
            Text(verbatim: "\(priceKr) kr")
                .font(.largeTitle.bold())
            ForEach(bars, id: \.slug) { bar in
                NavigationLink(value: Route.review(slug: bar.slug, preview: nil)) {
                    HStack {
                        Text(bar.title + (bar.isHappyHourPrice ? " *" : ""))
                            .fontWeight(.semibold)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).fill(tint.opacity(0.1)))
    }
}
