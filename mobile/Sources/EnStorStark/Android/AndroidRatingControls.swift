#if os(Android)
import SwiftUI
import EnStorStarkModel

// One control per rating aspect, each with a picture of what it measures, as on iOS. All are
// 0–5 and can be dragged or tapped; the round buttons below the card also set the value.
// SkipUI has no `Canvas`, so the drawings use shapes and paths.

enum RatingWords {
    /// A short word for each value 0–5 of an aspect.
    static func word(_ key: RatingKey, _ value: Int) -> String {
        let words: [String]
        switch key {
        case .atmosphere: words = ["Död", "Steril", "Sådär", "Trivsam", "Mysig", "Magisk"]
        case .service: words = ["Ignorerad", "Sur", "Långsam", "Okej", "Snabb", "Stammisvänlig"]
        case .selection: words = ["Bara en", "Två kranar", "Några", "Bra", "Brett", "Ölhimmel"]
        case .quality: words = ["Avslagen", "Tunn", "Okej", "God", "Fräsch", "Perfekt"]
        case .price: words = ["Rån", "Dyrt", "Sådär", "Okej", "Prisvärt", "Fynd"]
        case .cleanliness: words = ["Kladdigt", "Smutsigt", "Sådär", "Rent", "Skinande", "Kliniskt"]
        case .soundLevel: words = ["Öronbedövande", "Högljutt", "Livligt", "Sorl", "Lugnt", "Tyst"]
        case .barhopPotential: words = ["Återvändsgränd", "Långt bort", "Sådär", "Nära till mer", "Bra nav", "Mitt i smeten"]
        }
        return words[clamp(value)]
    }

    static func clamp(_ value: Int) -> Int { min(max(value, 0), 5) }
}

/// The control for one aspect.
struct RatingControl: View {
    let key: RatingKey
    @Binding var value: Int
    /// The beer price, for the balance scale.
    var priceText: String?

    var body: some View {
        Group {
            switch key {
            case .atmosphere: DimmerControl(value: $value)
            case .service: SpeedometerControl(value: $value)
            case .selection: TapsControl(value: $value)
            case .quality: PintControl(value: $value).frame(width: 130, height: 200)
            case .price: ScaleControl(value: $value, priceText: priceText)
            case .cleanliness: WipeControl(value: $value)
            case .soundLevel: VolumeControl(value: $value)
            case .barhopPotential: HopControl(value: $value)
            }
        }
        .accessibilityValue(Text("\(value) av 5, \(RatingWords.word(key, value))"))
        .accessibilityIdentifier("wizard.rating.control")
    }
}

/// Angle in degrees of a point around a centre: 0 is up, positive is clockwise.
private func angle(of point: CGPoint, around center: CGPoint) -> Double {
    atan2(Double(point.x - center.x), Double(center.y - point.y)) * 180 / .pi
}

private extension Binding where Value == Int {
    /// Sets a new value only when it changes.
    func update(_ newValue: Int) {
        let clamped = RatingWords.clamp(newValue)
        if wrappedValue != clamped { wrappedValue = clamped }
    }
}

/// A transparent hit area for drags over a drawing.
struct DragSurface: View {
    var body: some View { Color.black.opacity(0.001) }
}

// MARK: Atmosfär: a dimmer knob, the room warms up

struct DimmerControl: View {
    @Binding var value: Int

    var body: some View {
        GeometryReader { proxy in
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
            ZStack {
                DragSurface()
                RadialGradient(colors: [Ess.amber.opacity(0.08 + Double(value) * 0.1), Color.clear],
                               center: .center, startRadius: 10, endRadius: 150)
                ForEach(0..<6, id: \.self) { tick in
                    Capsule().fill(tick <= value ? Ess.amber : Color.white.opacity(0.2))
                        .frame(width: 4, height: 12)
                        .offset(y: -96)
                        .rotationEffect(.degrees(-135 + Double(tick) * 54))
                }
                Circle()
                    .fill(LinearGradient(colors: [Color(red: 0.23, green: 0.21, blue: 0.19), Color(red: 0.08, green: 0.07, blue: 0.06)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 150, height: 150)
                    .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1.5))
                Capsule().fill(Ess.amber).frame(width: 5, height: 26).offset(y: -52)
                    .rotationEffect(.degrees(-135 + Double(value) * 54))
                EssIconView(.lightbulb, size: 38, color: value == 0 ? Ess.tertiary : Ess.amber)
                    .glow(value > 0, radius: CGFloat(value) * 3)
            }
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                let degrees = min(max(angle(of: drag.location, around: center), -135), 135)
                $value.update(Int(((degrees + 135) / 54).rounded()))
            })
        }
    }
}

// MARK: Service: a speedometer

struct SpeedometerControl: View {
    @Binding var value: Int

    var body: some View {
        GeometryReader { proxy in
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height * 0.78)
            let radius: CGFloat = min(120, proxy.size.width / 2 - 30)
            ZStack(alignment: .topLeading) {
                DragSurface()
                Path { $0.addArc(center: center, radius: radius, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false) }
                    .stroke(Color.white.opacity(0.1), style: StrokeStyle(lineWidth: 18, lineCap: .round))
                if value > 0 {
                    Path { $0.addArc(center: center, radius: radius, startAngle: .degrees(180), endAngle: .degrees(180 + Double(value) * 36), clockwise: false) }
                        .stroke(Ess.amber, style: StrokeStyle(lineWidth: 18, lineCap: .round))
                }
                ForEach(0..<6, id: \.self) { tick in
                    let radians = Double(180 + tick * 36) * .pi / 180
                    Text(verbatim: "\(tick)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(tick == value ? Ess.amber : Ess.tertiary)
                        .position(x: center.x + cos(radians) * (radius - 34), y: center.y + sin(radians) * (radius - 34))
                }
                Capsule().fill(Color.white).frame(width: 4, height: radius - 20)
                    .offset(y: -(radius - 20) / 2)
                    .rotationEffect(.degrees(-90 + Double(value) * 36))
                    .position(center)
                Circle().fill(Color.white).frame(width: 18, height: 18).position(center)
                HStack {
                    Text("Långsamt")
                    Spacer()
                    Text("Snabbt")
                }
                .font(Ess.labelMedium)
                .foregroundStyle(Ess.tertiary)
                .frame(width: 2 * radius + 30)
                .position(x: center.x, y: center.y + 24)
            }
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                let degrees = min(max(angle(of: drag.location, around: center), -90), 90)
                $value.update(Int(((degrees + 90) / 36).rounded()))
            })
        }
    }
}

// MARK: Utbud: tap handles

struct TapsControl: View {
    @Binding var value: Int

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            HStack(alignment: .bottom, spacing: 16) {
                ForEach(1..<6, id: \.self) { tap in
                    let isOn = tap <= value
                    Button {
                        value = value == tap ? tap - 1 : tap
                    } label: {
                        VStack(spacing: 0) {
                            Circle().fill(isOn ? Ess.foam : Color.white.opacity(0.2)).frame(width: 22, height: 22)
                            RoundedRectangle(cornerRadius: 8)
                                .fill(isOn ? Ess.amber : Color.white.opacity(0.1))
                                .frame(width: 26, height: 70 + CGFloat(tap % 2) * 12)
                            Rectangle().fill(Color.white.opacity(0.3)).frame(width: 8, height: 14)
                        }
                        .rotationEffect(.degrees(isOn ? -8 : 0), anchor: .bottom)
                    }
                    .buttonStyle(.plain)
                }
            }
            RoundedRectangle(cornerRadius: 6)
                .fill(LinearGradient(colors: [Color(white: 0.5), Color(white: 0.25)], startPoint: .top, endPoint: .bottom))
                .frame(width: 250, height: 22)
            Text("Tryck på kranarna").font(Ess.bodySmall).foregroundStyle(Ess.tertiary).padding(.top, 12)
            Spacer(minLength: 0)
        }
    }
}

// MARK: Kvalitet: a pint glass that fills by dragging

struct PintGlassShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let inset = rect.width * 0.13
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.maxY - 14))
        path.addQuadCurve(to: CGPoint(x: rect.maxX - inset - 14, y: rect.maxY), control: CGPoint(x: rect.maxX - inset - 1, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + inset + 14, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.minX + inset, y: rect.maxY - 14), control: CGPoint(x: rect.minX + inset + 1, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

struct PintControl: View {
    @Binding var value: Int

    var body: some View {
        GeometryReader { proxy in
            let height = proxy.size.height, width = proxy.size.width
            let level = CGFloat(value) / 5
            ZStack {
                DragSurface()
                PintGlassShape().fill(Color.white.opacity(0.05))
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    VStack(spacing: 0) {
                        if value > 0 { Rectangle().fill(Ess.foam).frame(height: 20) }
                        LinearGradient(colors: [Ess.amber, Ess.amberDeep], startPoint: .top, endPoint: .bottom)
                    }
                    .frame(height: level * height)
                }
                .frame(width: width, height: height)
                .clipShape(PintGlassShape())
                PintGlassShape().stroke(Color.white.opacity(0.55), lineWidth: 3)
            }
            .glow(value > 0, color: Ess.amber, radius: 18)
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                $value.update(Int(((1 - drag.location.y / height) * 5).rounded()))
            })
        }
    }
}

// MARK: Prisvärdhet: a balance scale, price against what you got

struct ScaleControl: View {
    @Binding var value: Int
    var priceText: String?

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let tilt = (Double(value) - 2.5) / 2.5 * 16
            let arm: CGFloat = min(110, width / 2 - 50)
            let pivot = CGPoint(x: width / 2, y: 70)
            let radians = tilt * .pi / 180
            let left = CGPoint(x: pivot.x - cos(radians) * arm, y: pivot.y - sin(radians) * arm)
            let right = CGPoint(x: pivot.x + cos(radians) * arm, y: pivot.y + sin(radians) * arm)
            ZStack(alignment: .topLeading) {
                DragSurface()
                Path { path in
                    path.move(to: pivot)
                    path.addLine(to: CGPoint(x: pivot.x - 30, y: 190))
                    path.addLine(to: CGPoint(x: pivot.x + 30, y: 190))
                    path.closeSubpath()
                }
                .fill(Color.white.opacity(0.12))
                Path { path in
                    for end in [left, right] {
                        path.move(to: CGPoint(x: end.x - 40, y: end.y + 81))
                        path.addLine(to: end)
                        path.addLine(to: CGPoint(x: end.x + 40, y: end.y + 81))
                    }
                }
                .stroke(Color.white.opacity(0.3), lineWidth: 1.5)
                Path { path in
                    path.move(to: left)
                    path.addLine(to: right)
                }
                .stroke(Color.white.opacity(0.7), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                Circle().fill(Ess.amber).frame(width: 14, height: 14).position(pivot)
                plate(at: left) {
                    VStack(spacing: 2) {
                        ForEach(0..<3, id: \.self) { _ in
                            Capsule().fill(Color(red: 0.8, green: 0.7, blue: 0.45)).frame(width: 46, height: 10)
                        }
                    }
                    Text(priceText ?? "Priset").font(Ess.num(13)).foregroundStyle(.white)
                }
                plate(at: right) {
                    EssIconView(.mug, size: 36, color: Ess.amber).glow(radius: 8)
                    Text("stor stark").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
                }
            }
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                $value.update(Int((drag.location.x / width * 5).rounded()))
            })
        }
    }

    private func plate<Content: View>(at point: CGPoint, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 4) {
            VStack(spacing: 4) { content() }.frame(height: 62, alignment: .bottom)
            Capsule().fill(Color.white.opacity(0.5)).frame(width: 80, height: 5)
        }
        .position(x: point.x, y: point.y + 48)
    }
}

// MARK: Renlighet: wipe the counter clean

struct WipeControl: View {
    @Binding var value: Int
    private let spots: [(x: CGFloat, y: CGFloat, size: CGFloat)] = [
        (0.2, 0.3, 38), (0.7, 0.25, 26), (0.45, 0.6, 46), (0.82, 0.68, 30), (0.15, 0.75, 22), (0.58, 0.2, 18)
    ]

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width, height = proxy.size.height
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 22)
                    .fill(LinearGradient(colors: [Color(red: 0.32, green: 0.22, blue: 0.14), Color(red: 0.2, green: 0.13, blue: 0.08)],
                                         startPoint: .top, endPoint: .bottom))
                ForEach(Array(spots.enumerated()), id: \.offset) { index, spot in
                    Ellipse().fill(Color(red: 0.12, green: 0.08, blue: 0.03))
                        .frame(width: spot.size * 1.4, height: spot.size)
                        .opacity(index < 6 - value ? 0.9 : 0)
                        .position(x: spot.x * width, y: spot.y * height)
                }
                if value >= 4 {
                    EssIconView(.sparkles, size: 32, color: .white).position(x: width * 0.78, y: height * 0.3)
                    EssIconView(.sparkles, size: 18, color: Color.white.opacity(0.8)).position(x: width * 0.3, y: height * 0.62)
                }
                EssIconView(.hand, size: 28, color: Ess.foam)
                    .frame(width: 50, height: 50)
                    .background(Circle().fill(Ess.amber))
                    .position(x: 30 + CGFloat(value) / 5 * (width - 60), y: height * 0.5)
            }
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                $value.update(Int((drag.location.x / width * 5).rounded()))
            })
        }
    }
}

// MARK: Ljudnivå: a level meter, 0 = loud, 5 = quiet

struct VolumeControl: View {
    @Binding var value: Int
    private let pattern: [CGFloat] = [0.5, 0.8, 0.65, 1, 0.75, 0.9, 0.55, 0.85, 0.7, 0.95, 0.6, 0.8]

    var icon: EssIcon {
        switch value {
        case 0, 1, 2: return .volumeUp
        case 3, 4: return .volumeDown
        default: return .volumeMute
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let loudness = CGFloat(5 - value) / 5
            let barHeight = proxy.size.height - 40
            ZStack(alignment: .bottom) {
                DragSurface()
                HStack(alignment: .center, spacing: 14) {
                    EssIconView(icon, size: 32, color: .white).frame(width: 50)
                    HStack(alignment: .center, spacing: 5) {
                        ForEach(Array(pattern.enumerated()), id: \.offset) { _, level in
                            Capsule()
                                .fill(loudness > 0.6 ? Ess.bad : Ess.amber)
                                .frame(width: 10, height: max(8, (0.08 + loudness * 0.92) * level * barHeight))
                        }
                    }
                    .frame(height: barHeight)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                HStack {
                    Text("Högljutt")
                    Spacer()
                    Text("Tyst")
                }
                .font(Ess.labelMedium)
                .foregroundStyle(Ess.tertiary)
                .padding(.horizontal, 20)
            }
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                $value.update(Int((drag.location.x / proxy.size.width * 5).rounded()))
            })
        }
    }
}

// MARK: Barhoppotential: how many bars within a short walk

struct HopControl: View {
    @Binding var value: Int
    private let others: [(degrees: Double, distance: CGFloat, label: String)] = [
        (20, 0.3, "2 min"), (150, 0.44, "4 min"), (250, 0.58, "6 min"), (70, 0.74, "9 min"), (320, 0.88, "12 min")
    ]

    var body: some View {
        GeometryReader { proxy in
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
            let maxRadius = min(proxy.size.width, proxy.size.height) / 2 - 6
            let radius = value == 0 ? 14 : (others[RatingWords.clamp(value) - 1].distance + 0.07) * maxRadius
            ZStack(alignment: .topLeading) {
                StreetGrid().clipShape(RoundedRectangle(cornerRadius: 22))
                Circle().fill(Ess.amber.opacity(0.1)).frame(width: radius * 2, height: radius * 2).position(center)
                Circle().stroke(Ess.amber, style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
                    .frame(width: radius * 2, height: radius * 2).position(center)
                ForEach(Array(others.enumerated()), id: \.offset) { index, other in
                    let radians = other.degrees * .pi / 180
                    let point = CGPoint(x: center.x + cos(radians) * other.distance * maxRadius,
                                        y: center.y + sin(radians) * other.distance * maxRadius)
                    let isInside = index < value
                    Circle().fill(isInside ? Ess.amber : Color.white.opacity(0.25)).frame(width: 12, height: 12).position(point)
                    if isInside {
                        Text(other.label).font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Capsule().fill(Color.black.opacity(0.7)))
                            .position(x: point.x + (cos(radians) >= 0 ? 26 : -26), y: point.y)
                    }
                }
                EssIconView(.mug, size: 16, color: .black)
                    .frame(width: 32, height: 32).background(Circle().fill(Color.white)).position(center)
            }
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                let distance = hypot(drag.location.x - center.x, drag.location.y - center.y) / maxRadius
                $value.update(others.filter { $0.distance <= distance }.count)
            })
        }
    }
}

/// A drawn city at night: a river and a loose street grid.
struct StreetGrid: View {
    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width, height = proxy.size.height
            ZStack {
                Color(red: 0.07, green: 0.07, blue: 0.085)
                Path { path in
                    for row in 0..<12 {
                        let y = Double(row) / 11 * height
                        path.move(to: CGPoint(x: 0, y: y + sin(Double(row) * 1.7) * 10))
                        path.addLine(to: CGPoint(x: width, y: y + cos(Double(row) * 1.3) * 14 + 10))
                    }
                    for column in 0..<9 {
                        let x = Double(column) / 8 * width
                        path.move(to: CGPoint(x: x + sin(Double(column)) * 14, y: 0))
                        path.addLine(to: CGPoint(x: x + cos(Double(column) * 2.1) * 20, y: height))
                    }
                }
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
                Path { path in
                    path.move(to: CGPoint(x: -20, y: 0.25 * height))
                    path.addCurve(to: CGPoint(x: 0.55 * width, y: 0.17 * height),
                                  control1: CGPoint(x: 0.2 * width, y: 0.2 * height), control2: CGPoint(x: 0.4 * width, y: 0.2 * height))
                    path.addCurve(to: CGPoint(x: width + 20, y: 0.05 * height),
                                  control1: CGPoint(x: 0.75 * width, y: 0.14 * height), control2: CGPoint(x: 0.85 * width, y: 0.05 * height))
                }
                .stroke(Color(red: 0.09, green: 0.13, blue: 0.2), style: StrokeStyle(lineWidth: 30, lineCap: .round))
            }
        }
    }
}
#endif
