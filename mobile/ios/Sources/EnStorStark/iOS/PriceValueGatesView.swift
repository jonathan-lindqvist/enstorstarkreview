import Charts
import SwiftUI
import EnStorStarkModel

/// Prisvärdhet against price per centilitre, like the web's `PriceValueGates` on /statistik:
/// the shaded boxes are the gates, each dot a bar, and a line how far its rating is from the gate.
struct PriceValueGatesView: View {
    let comparison: PriceValue.Comparison
    @State private var selected: String?

    static let krPerClRange = 0.7...3.0
    static let ticks = [1.0, 1.5, 2.0, 2.5, 3.0]
    /// Dots closer than this in the same row move to another lane, like the web's 10 px.
    static let laneGap = 0.07
    static let laneOffsets = [0.0, 0.27, -0.27]

    struct Dot: Identifiable {
        var bar: PriceValue.Bar
        var x: Double
        var y: Double
        var id: String { bar.point.slug }
    }

    var dots: [Dot] {
        var lastInLane: [String: Double] = [:]
        return comparison.bars.sorted { $0.krPerCl < $1.krPerCl }.map { bar in
            let x = min(max(bar.krPerCl, Self.krPerClRange.lowerBound), Self.krPerClRange.upperBound)
            let lane = Self.laneOffsets.indices.first { index in
                x - (lastInLane["\(bar.valueRating)|\(index)"] ?? -99) >= Self.laneGap
            } ?? 0
            lastInLane["\(bar.valueRating)|\(lane)"] = x
            return Dot(bar: bar, x: x, y: bar.valueRating + Self.laneOffsets[lane])
        }
    }

    var selectedBar: PriceValue.Bar? {
        comparison.bars.first { $0.point.slug == selected }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            chart
            selection
            legend
            table
        }
    }

    var chart: some View {
        let dots = dots
        return Chart {
            ForEach(comparison.gates, id: \.rating) { gate in
                RectangleMark(
                    xStart: .value("Från", max(gate.fromKrPerCl, Self.krPerClRange.lowerBound)),
                    xEnd: .value("Under", min(gate.belowKrPerCl ?? Self.krPerClRange.upperBound, Self.krPerClRange.upperBound)),
                    yStart: .value("Betyg", Double(gate.rating) - 0.5),
                    yEnd: .value("Betyg", Double(gate.rating) + 0.5)
                )
                .foregroundStyle(Theme.amber.opacity(0.14))
            }
            ForEach(dots) { dot in
                if dot.bar.distance > 0 {
                    RuleMark(
                        x: .value("kr/cl", dot.x),
                        yStart: .value("Betyg", dot.y),
                        yEnd: .value("Väntat", Double(dot.bar.gateRating))
                    )
                    .foregroundStyle(Self.color(dot.bar.distance).opacity(0.6))
                    .lineStyle(StrokeStyle(lineWidth: 1))
                }
                PointMark(x: .value("kr/cl", dot.x), y: .value("Betyg", dot.y))
                    .foregroundStyle(Self.color(dot.bar.distance))
                    .symbolSize(dot.id == selected ? 120 : 50)
            }
        }
        .chartXScale(domain: Self.krPerClRange)
        .chartYScale(domain: -0.5...5.5)
        .chartXAxis {
            AxisMarks(values: Self.ticks) { value in
                AxisValueLabel {
                    if let number = value.as(Double.self) {
                        Text(verbatim: Formatting.decimal(number)).foregroundStyle(Theme.tertiary)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 1, 2, 3, 4, 5]) { value in
                AxisGridLine().foregroundStyle(Theme.hairline)
                AxisValueLabel {
                    if let number = value.as(Int.self) {
                        Text(verbatim: "\(number)").font(Theme.body(11, .semibold)).foregroundStyle(Theme.tertiary)
                    }
                }
            }
        }
        .chartXAxisLabel(position: .bottomTrailing) {
            Text(verbatim: "kr/cl").font(Theme.body(11, .medium)).foregroundStyle(Theme.tertiary)
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture { location in select(at: location, proxy: proxy, geometry: geometry, dots: dots) }
            }
        }
        .frame(height: 260)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Faktiskt betyg mot väntat betyg för \(comparison.bars.count) barer."))
        .accessibilityIdentifier("statistics.priceValueGates")
    }

    /// The tapped dot: the nearest one within 24 points.
    func select(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy, dots: [Dot]) {
        guard let frame = proxy.plotFrame.map({ geometry[$0] }) else { return }
        let nearest = dots.compactMap { dot -> (Dot, CGFloat)? in
            guard let position = proxy.position(for: (dot.x, dot.y)) else { return nil }
            let point = CGPoint(x: position.x + frame.minX, y: position.y + frame.minY)
            return (dot, hypot(point.x - location.x, point.y - location.y))
        }
        .min { $0.1 < $1.1 }
        withAnimation(.snappy(duration: 0.15)) {
            selected = nearest.flatMap { $0.1 <= 24 ? $0.0.id : nil }
        }
    }

    @ViewBuilder var selection: some View {
        if let bar = selectedBar {
            NavigationLink(value: Route.review(slug: bar.point.slug, preview: nil)) {
                HStack(spacing: 8) {
                    Text(Formatting.priceValueBar(bar)).font(Theme.body(13)).foregroundStyle(.white)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text("Öppnar baren"))
        } else {
            Text("Tryck på en punkt för att se baren.").font(Theme.body(13)).foregroundStyle(Theme.tertiary)
        }
    }

    var legend: some View {
        HStack(spacing: 14) {
            LegendDot(color: Self.color(0), text: "Som väntat: \(comparison.exactCount)")
            LegendDot(color: Self.color(1), text: "1 steg ifrån: \(comparison.nearCount)")
            LegendDot(color: Self.color(2), text: "Minst 2 steg: \(comparison.farCount)")
        }
        .font(Theme.body(12))
        .foregroundStyle(Theme.secondary)
    }

    var table: some View {
        Grid(alignment: .trailing, horizontalSpacing: 8, verticalSpacing: 6) {
            GridRow {
                Text("Kr/cl").gridColumnAlignment(.leading)
                Text("Väntat betyg")
                Text("Barer")
                Text("Som väntat")
            }
            .font(Theme.body(12, .bold)).foregroundStyle(.white)
            Divider().overlay(Theme.hairline)
            ForEach(comparison.gates, id: \.rating) { gate in
                GridRow {
                    Text(verbatim: Formatting.krPerClRange(gate)).gridColumnAlignment(.leading)
                    Text(verbatim: "\(gate.rating)").font(Theme.body(13, .bold)).foregroundStyle(.white)
                    Text(verbatim: "\(gate.count)")
                    Text(verbatim: "\(gate.exact)")
                }
                .font(Theme.body(13)).foregroundStyle(Theme.secondary).monospacedDigit()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text("\(Formatting.krPerClRange(gate)) kronor per centiliter, väntat betyg \(gate.rating), \(gate.count) barer, \(gate.exact) som väntat"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    static func color(_ distance: Double) -> Color {
        distance == 0 ? Color.white.opacity(0.6) : (distance == 1 ? Theme.amber : Theme.bad)
    }
}

private struct LegendDot: View {
    let color: Color
    let text: String

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8).accessibilityHidden(true)
            Text(text).lineLimit(1).minimumScaleFactor(0.8)
        }
    }
}
