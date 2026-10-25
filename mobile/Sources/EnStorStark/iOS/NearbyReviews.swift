import SwiftUI
import EnStorStarkModel

/// Reviewed bars near the address, under the barhop rating. Counts per radius; a tap opens the
/// nearest bars. The centre is the address's saved position, never the device location.
struct NearbyReviewsCard: View {
    let model: NearbyReviewsModel
    let showList: () -> Void

    var body: some View {
        Group {
            if case .results = model.state {
                Button(action: showList) { content }
                    .buttonStyle(.plain)
                    .accessibilityHint(Text("Visar de närmaste barerna."))
                    .accessibilityIdentifier("wizard.nearby")
            } else {
                content
            }
        }
        .animation(.snappy, value: model.state)
    }

    var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "mappin.and.ellipse").font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.amber)
                Text("Recenserade barer i närheten").font(Theme.body(15, .bold)).foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 4)
                if case .results = model.state {
                    Text("Visa").font(Theme.body(13, .semibold)).foregroundStyle(Theme.amber)
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.amber)
                }
            }
            switch model.state {
            case .loading:
                HStack(spacing: 8) {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.07)).frame(height: 58)
                    }
                }
                .accessibilityHidden(true)
                Text("Hämtar barer i närheten…").font(Theme.body(12)).foregroundStyle(Theme.tertiary)
            case .results(let result):
                HStack(spacing: 8) {
                    ForEach(Array(zip(result.radiiMetres, result.counts).enumerated()), id: \.offset) { position, pair in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: "\(pair.1)").font(Theme.num(26))
                                .foregroundStyle(position == 0 ? Theme.amber : .white)
                            Text("inom \(Formatting.wholeNumber(pair.0)) m").font(Theme.body(11, .semibold))
                                .foregroundStyle(Theme.secondary)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(Text("\(pair.1) inom \(Formatting.wholeNumber(pair.0)) meter"))
                    }
                }
                Text("Från adressens sparade position, fågelvägen. \(result.locatedCount) av \(result.totalCount) andra recensioner har känd position. Utkast ingår.")
                    .font(Theme.body(11)).foregroundStyle(Theme.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            case .noPosition:
                note("location.slash", "Adressen saknar sparad position, så avstånden kan inte räknas ut. Du kan ändå sätta ditt betyg.")
            case .noneLocated:
                note("map", "Andra recensioner saknar kända positioner. Antalet barer i närheten kan inte beräknas.")
            case .unavailable:
                note("wifi.exclamationmark", "Jämförelsen kunde inte laddas just nu. Du kan ändå sätta ditt betyg.", retry: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(22)
    }

    func note(_ icon: String, _ text: String, retry: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.secondary)
                .frame(width: 20).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                Text(text).font(Theme.body(13)).foregroundStyle(Theme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if retry {
                    Button("Försök igen") { Task { await model.retry() } }
                        .font(Theme.body(13, .bold)).foregroundStyle(Theme.amber)
                        .accessibilityIdentifier("wizard.nearby.retry")
                }
            }
        }
    }
}

/// The nearest reviewed bars, nearest first.
struct NearbyReviewsSheet: View {
    let address: String
    let result: NearbyReviewsModel.Result

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Barer i närheten").font(Theme.title(24)).foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
                Text("Runt \(street), från adressens sparade position. Avstånden är ungefärliga och fågelvägen.")
                    .font(Theme.body(13)).foregroundStyle(Theme.secondary)
                if result.nearest.isEmpty {
                    Text("Inga andra recenserade barer inom \(Formatting.wholeNumber(result.radiiMetres.last ?? 1000)) m.")
                        .font(Theme.body(14)).foregroundStyle(Theme.secondary)
                } else {
                    VStack(spacing: 0) {
                        ForEach(result.nearest, id: \.slug) { bar in
                            HStack(spacing: 12) {
                                Text(bar.title).font(Theme.body(15, .semibold)).foregroundStyle(.white).lineLimit(1)
                                Spacer(minLength: 8)
                                Text(verbatim: "\(Formatting.wholeNumber(bar.distanceMetres)) m").font(Theme.num(16))
                                    .foregroundStyle(bar.distanceMetres <= (result.radiiMetres.first ?? 250) ? Theme.amber : .white)
                            }
                            .frame(minHeight: 48)
                            .accessibilityElement(children: .combine)
                            if bar.slug != result.nearest.last?.slug {
                                Rectangle().fill(Theme.hairline).frame(height: 1)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .cardBackground(18)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 24)
        }
        .background(Theme.bg)
        .preferredColorScheme(.dark)
    }

    var street: String {
        address.split(separator: ",").first.map { String($0).trimmingCharacters(in: .whitespaces) } ?? address
    }
}
