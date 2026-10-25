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
    @State var brandSort: BeerBrandRow.Sort = .price

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            hero
            HStack(spacing: 12) {
                StatisticTile(
                    title: "Snittpris",
                    value: statistics.averageBeerPrice.map { Formatting.decimal($0, maximumFractionDigits: 0) } ?? "–",
                    unit: "kr",
                    caption: "\(statistics.priceReviewCount) priser"
                )
                StatisticTile(
                    title: "Snitt cl/kr",
                    value: statistics.averageClPerKr.map { Formatting.decimal($0, minimumFractionDigits: 2, maximumFractionDigits: 2) } ?? "–",
                    unit: "",
                    caption: "\(statistics.valueReviewCount) med volym"
                )
                StatisticTile(
                    title: "Stämplar",
                    value: statistics.averageRating.map { Formatting.decimal($0) } ?? "–",
                    unit: "",
                    caption: "i snitt per bar"
                ) {
                    Stamp(size: 22, tilt: -8)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            value
            brands
            if let cheapest = statistics.cheapestBars.first, let priciest = statistics.mostExpensiveBars.first {
                StatisticsSectionTitle(text: "Billigast och dyrast")
                HStack(spacing: 12) {
                    PriceExtreme(title: "Billigast", priceKr: cheapest.beerPriceKr, bars: statistics.cheapestBars, tint: Theme.good)
                    PriceExtreme(title: "Dyrast", priceKr: priciest.beerPriceKr, bars: statistics.mostExpensiveBars, tint: Theme.bad)
                }
                .fixedSize(horizontal: false, vertical: true)
                Text("Happy hour-priser ingår inte i prisstatistiken.")
                    .font(Theme.body(12)).foregroundStyle(Theme.tertiary)
            }
            happyHour
        }
    }

    var hero: some View {
        HStack(alignment: .bottom) {
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
            .accessibilityElement(children: .combine)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Eyebrow(text: "Totalt spenderat")
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(verbatim: Formatting.wholeNumber(statistics.totalReviewerSpendKr))
                        .font(Theme.num(30)).foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text(verbatim: "kr").font(Theme.num(13)).foregroundStyle(Theme.secondary)
                }
                Text("En öl per recensent och bar")
                    .font(Theme.body(11)).foregroundStyle(Theme.tertiary)
                    .multilineTextAlignment(.trailing)
            }
            .accessibilityElement(children: .combine)
        }
        .padding(18)
        .cardBackground(26)
    }

    var value: some View {
        VStack(alignment: .leading, spacing: 12) {
            StatisticsSectionTitle(text: "Öl för pengarna", trailing: "cl/kr")
            VStack(alignment: .leading, spacing: 12) {
                if statistics.averageClPerKr == nil {
                    Text("Inga recensioner med både volym och pris än.")
                        .font(Theme.body(14)).foregroundStyle(Theme.secondary)
                } else {
                    ValueRanking(title: "Mest öl för pengarna", bars: statistics.bestValueBars, tint: Theme.good)
                    if !statistics.worstValueBars.isEmpty {
                        Rectangle().fill(Theme.hairline).frame(height: 1)
                        ValueRanking(title: "Minst öl för pengarna", bars: statistics.worstValueBars, tint: Theme.bad)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .cardBackground(22)
        }
        .padding(.top, 6)
    }

    var brands: some View {
        let rows = BeerBrandRow.rows(statistics, sort: brandSort)
        let maxValue = rows.compactMap(\.averageClPerKr).max() ?? 1
        return VStack(alignment: .leading, spacing: 12) {
            StatisticsSectionTitle(text: "Per märke", trailing: "kr · cl/kr")
            Text("Ordinarie priser. För cl/kr krävs även angiven volym.")
                .font(Theme.body(13)).foregroundStyle(Theme.secondary)
            if rows.isEmpty {
                Text("Inga priser med angivet ölmärke än.")
                    .font(Theme.body(14)).foregroundStyle(Theme.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16).cardBackground(22)
            } else {
                Picker("Sortera märken", selection: $brandSort.animation(.snappy)) {
                    Text("Pris").tag(BeerBrandRow.Sort.price)
                    Text("cl/kr").tag(BeerBrandRow.Sort.value)
                    Text("Namn").tag(BeerBrandRow.Sort.name)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("statistics.brandSort")
                VStack(spacing: 14) {
                    ForEach(rows) { BrandStatisticRow(row: $0, maxClPerKr: maxValue) }
                }
                .padding(16)
                .cardBackground(22)
            }
        }
        .padding(.top, 6)
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

/// A section heading with an optional unit on the right.
struct StatisticsSectionTitle: View {
    let text: String
    var trailing: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            SectionTitle(text: text)
            Spacer()
            if let trailing {
                Text(verbatim: trailing).font(Theme.body(12, .semibold)).foregroundStyle(Theme.tertiary)
                    .accessibilityHidden(true)
            }
        }
    }
}

/// A small figure in the overview row.
struct StatisticTile<Accessory: View>: View {
    let title: String
    let value: String
    let unit: String
    let caption: String
    @ViewBuilder var accessory: Accessory

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(text: title)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(verbatim: value).font(Theme.num(28)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.6)
                if !unit.isEmpty {
                    Text(verbatim: unit).font(Theme.num(12)).foregroundStyle(Theme.secondary)
                }
                accessory.padding(.leading, 4).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 2 }
            }
            Text(caption).font(Theme.body(11)).foregroundStyle(Theme.tertiary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .cardBackground(20)
        .accessibilityElement(children: .combine)
    }
}

extension StatisticTile where Accessory == EmptyView {
    init(title: String, value: String, unit: String, caption: String) {
        self.init(title: title, value: value, unit: unit, caption: caption) { EmptyView() }
    }
}

/// Ranked bars by cl/kr, each linking to its review.
struct ValueRanking: View {
    let title: String
    let bars: [ValueStatisticBar]
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(Theme.body(13, .bold)).foregroundStyle(tint)
                .accessibilityAddTraits(.isHeader)
            ForEach(Array(bars.enumerated()), id: \.element.value1.slug) { index, bar in
                NavigationLink(value: Route.review(slug: bar.value1.slug, preview: nil)) {
                    HStack(spacing: 10) {
                        Text(verbatim: "\(index + 1)").font(Theme.num(15)).foregroundStyle(Theme.tertiary)
                            .frame(width: 16)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(bar.value1.title).font(Theme.body(14, .semibold)).foregroundStyle(.white).lineLimit(1)
                            Text(verbatim: "\(bar.value2.beerVolumeCl) cl · \(bar.value1.beerPriceKr) kr")
                                .font(Theme.body(12)).foregroundStyle(Theme.tertiary)
                        }
                        Spacer(minLength: 6)
                        Text(verbatim: Formatting.decimal(bar.value2.clPerKr, minimumFractionDigits: 2, maximumFractionDigits: 2))
                            .font(Theme.num(18)).foregroundStyle(tint)
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text("\(index + 1). \(bar.value1.title), \(Formatting.clPerKr(bar.value2.clPerKr))"))
                .accessibilityAddTraits(.isLink)
            }
        }
    }
}

/// A brand with its logo, average price and a cl/kr bar.
struct BrandStatisticRow: View {
    let row: BeerBrandRow
    let maxClPerKr: Double

    var body: some View {
        HStack(spacing: 12) {
            BrandLogo(brand: row.brand, size: 40)
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline) {
                    Text(row.brand).font(Theme.body(14, .semibold)).foregroundStyle(.white).lineLimit(1)
                    Spacer()
                    Text(verbatim: "\(Formatting.decimal(row.averagePriceKr, minimumFractionDigits: 1, maximumFractionDigits: 1)) kr")
                        .font(Theme.num(15)).foregroundStyle(Theme.amber)
                }
                HStack(spacing: 8) {
                    GeometryReader { proxy in
                        Capsule().fill(Color.white.opacity(0.08))
                            .overlay(alignment: .leading) {
                                Capsule().fill(Theme.good.opacity(0.8))
                                    .frame(width: proxy.size.width * CGFloat(min((row.averageClPerKr ?? 0) / maxClPerKr, 1)))
                            }
                    }
                    .frame(height: 6)
                    Text(verbatim: row.averageClPerKr.map(Formatting.clPerKr) ?? "– cl/kr")
                        .font(Theme.body(11, .semibold)).foregroundStyle(Theme.secondary)
                        .frame(width: 70, alignment: .trailing)
                }
                Text(caption).font(Theme.body(11)).foregroundStyle(Theme.tertiary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(accessibilityText))
    }

    var caption: String {
        let prices = row.priceCount == 1 ? "1 pris" : "\(row.priceCount) priser"
        guard row.valueCount > 0 else { return prices }
        return "\(prices) · \(row.valueCount) med volym"
    }

    var accessibilityText: String {
        let price = "snittpris \(Formatting.decimal(row.averagePriceKr)) kronor"
        let value = row.averageClPerKr.map { ", \(Formatting.clPerKr($0))" } ?? ""
        return "\(row.brand), \(price)\(value), \(caption)"
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
