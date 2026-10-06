#if !os(Android)
import SwiftUI
import EnStorStarkModel

// One control per rating aspect, each with a picture of what it measures. All are 0–5, can be
// dragged or tapped, and are adjustable with VoiceOver.

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
        .accessibilityElement(children: .ignore)
        .accessibilityValue(Text("\(value) av 5, \(RatingWords.word(key, value))"))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: value = RatingWords.clamp(value + 1)
            case .decrement: value = RatingWords.clamp(value - 1)
            @unknown default: break
            }
        }
        .accessibilityIdentifier("wizard.rating.control")
    }
}

/// Angle in degrees of a point around a centre: 0 is up, positive is clockwise.
private func angle(of point: CGPoint, around center: CGPoint) -> Double {
    atan2(Double(point.x - center.x), Double(center.y - point.y)) * 180 / .pi
}

private extension Binding where Value == Int {
    /// Sets a new value only when it changes, so haptics and animations run once per step.
    func update(_ newValue: Int) {
        let clamped = RatingWords.clamp(newValue)
        if wrappedValue != clamped { wrappedValue = clamped }
    }
}

// MARK: Atmosfär: a dimmer knob, the room warms up

struct DimmerControl: View {
    @Binding var value: Int

    var body: some View {
        GeometryReader { proxy in
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
            ZStack {
                RadialGradient(colors: [Theme.amber.opacity(0.08 + Double(value) * 0.1), .clear],
                               center: .center, startRadius: 10, endRadius: 150)
                ForEach(0..<6, id: \.self) { tick in
                    Capsule().fill(tick <= value ? Theme.amber : Color.white.opacity(0.2))
                        .frame(width: 4, height: 12)
                        .offset(y: -96)
                        .rotationEffect(.degrees(-135 + Double(tick) * 54))
                }
                Circle()
                    .fill(LinearGradient(colors: [Color(white: 0.24), Color(white: 0.1)], startPoint: .top, endPoint: .bottom))
                    .frame(width: 150, height: 150)
                    .overlay(Circle().strokeBorder(.white.opacity(0.12), lineWidth: 1))
                    .shadow(color: .black.opacity(0.6), radius: 10, y: 6)
                Capsule().fill(Theme.amber).frame(width: 5, height: 26).offset(y: -52)
                    .rotationEffect(.degrees(-135 + Double(value) * 54))
                    .shadow(color: Theme.amber.opacity(0.8), radius: 6)
                Image(systemName: value == 0 ? "lightbulb" : "lightbulb.fill")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(value == 0 ? Theme.tertiary : Theme.amber)
                    .shadow(color: Theme.amber.opacity(Double(value) / 5), radius: 16)
            }
            .animation(.snappy(duration: 0.2), value: value)
            .contentShape(Rectangle())
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
            ZStack {
                Path { $0.addArc(center: center, radius: radius, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false) }
                    .stroke(Color.white.opacity(0.1), style: .init(lineWidth: 18, lineCap: .round))
                Path { $0.addArc(center: center, radius: radius, startAngle: .degrees(180), endAngle: .degrees(180 + Double(value) * 36), clockwise: false) }
                    .stroke(LinearGradient(colors: [Theme.amberDeep, Theme.amber], startPoint: .leading, endPoint: .trailing),
                            style: .init(lineWidth: 18, lineCap: .round))
                    .shadow(color: Theme.amber.opacity(0.5), radius: 10)
                ForEach(0..<6, id: \.self) { tick in
                    let radians = Double(180 + tick * 36) * .pi / 180
                    Text(verbatim: "\(tick)")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundStyle(tick == value ? Theme.amber : Theme.tertiary)
                        .position(x: center.x + cos(radians) * (radius - 34), y: center.y + sin(radians) * (radius - 34))
                }
                Capsule().fill(.white).frame(width: 4, height: radius - 20)
                    .offset(y: -(radius - 20) / 2)
                    .rotationEffect(.degrees(-90 + Double(value) * 36))
                    .position(center)
                    .animation(.snappy(duration: 0.25), value: value)
                Circle().fill(.white).frame(width: 18, height: 18).position(center)
                HStack {
                    Image(systemName: "tortoise.fill")
                    Spacer()
                    Image(systemName: "hare.fill")
                }
                .font(.system(size: 16)).foregroundStyle(Theme.tertiary)
                .frame(width: 2 * radius + 30)
                .position(x: center.x, y: center.y + 22)
            }
            .contentShape(Rectangle())
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
                    VStack(spacing: 0) {
                        Circle().fill(isOn ? Theme.foam : Color.white.opacity(0.2)).frame(width: 22, height: 22)
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(isOn ? AnyShapeStyle(LinearGradient(colors: [Theme.amber, Theme.amberDeep], startPoint: .top, endPoint: .bottom))
                                       : AnyShapeStyle(Color.white.opacity(0.1)))
                            .frame(width: 26, height: 70 + CGFloat(tap % 2) * 12)
                            .shadow(color: isOn ? Theme.amber.opacity(0.5) : .clear, radius: 8)
                        Rectangle().fill(Color.white.opacity(0.3)).frame(width: 8, height: 14)
                    }
                    .rotationEffect(.degrees(isOn ? -8 : 0), anchor: .bottom)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.snappy) { value = value == tap ? tap - 1 : tap }
                    }
                }
            }
            RoundedRectangle(cornerRadius: 6)
                .fill(LinearGradient(colors: [Color(white: 0.5), Color(white: 0.25)], startPoint: .top, endPoint: .bottom))
                .frame(width: 250, height: 22)
            Text("Tryck på kranarna").font(Theme.body(12)).foregroundStyle(Theme.tertiary).padding(.top, 12)
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
                PintGlassShape().fill(Color.white.opacity(0.05))
                ZStack(alignment: .bottom) {
                    Color.clear
                    ZStack(alignment: .top) {
                        LinearGradient(colors: [Theme.amber, Theme.amberDeep], startPoint: .top, endPoint: .bottom)
                        ForEach(0..<9, id: \.self) { bubble in
                            Circle().fill(.white.opacity(0.35))
                                .frame(width: CGFloat(3 + bubble % 3), height: CGFloat(3 + bubble % 3))
                                .offset(x: CGFloat((bubble * 37) % 90) - 45,
                                        y: 26 + CGFloat((bubble * 53) % max(Int(level * height) - 30, 1)))
                        }
                        if value > 0 { Rectangle().fill(Theme.foam).frame(height: 20) }
                    }
                    .frame(height: level * height)
                }
                .frame(width: width, height: height)
                .mask(PintGlassShape())
                PintGlassShape().stroke(.white.opacity(0.55), lineWidth: 3)
                ForEach(1..<5, id: \.self) { mark in
                    Rectangle().fill(.white.opacity(0.22)).frame(width: 12, height: 2)
                        .position(x: width * 0.13 + 14 - CGFloat(mark) * width * 0.026, y: height - CGFloat(mark) / 5 * height)
                }
            }
            .animation(.snappy(duration: 0.2), value: value)
            .shadow(color: Theme.amber.opacity(value > 0 ? 0.35 : 0), radius: 24)
            .contentShape(Rectangle())
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
            ZStack {
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
                .stroke(Color.white.opacity(0.7), style: .init(lineWidth: 5, lineCap: .round))
                Circle().fill(Theme.amber).frame(width: 14, height: 14).position(pivot)
                plate(at: left) {
                    VStack(spacing: -6) {
                        ForEach(0..<3, id: \.self) { _ in
                            Capsule().fill(Color(red: 0.8, green: 0.7, blue: 0.45)).frame(width: 46, height: 12)
                                .overlay(Capsule().strokeBorder(.black.opacity(0.3), lineWidth: 1))
                        }
                    }
                    Text(priceText ?? "Priset").font(Theme.num(13)).foregroundStyle(.white)
                }
                plate(at: right) {
                    Image(systemName: "mug.fill").font(.system(size: 34)).foregroundStyle(Theme.amber)
                        .shadow(color: Theme.amber.opacity(0.6), radius: 8)
                    Text("stor stark").font(Theme.body(11, .semibold)).foregroundStyle(.white)
                }
            }
            .animation(.snappy(duration: 0.25), value: value)
            .contentShape(Rectangle())
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
            let width = proxy.size.width - 20, height = proxy.size.height - 20
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [Color(red: 0.32, green: 0.22, blue: 0.14), Color(red: 0.2, green: 0.13, blue: 0.08)],
                                         startPoint: .top, endPoint: .bottom))
                ForEach(Array(spots.enumerated()), id: \.offset) { index, spot in
                    Ellipse().fill(Color(red: 0.12, green: 0.08, blue: 0.03))
                        .frame(width: spot.size * 1.4, height: spot.size)
                        .blur(radius: 4)
                        .position(x: spot.x * width, y: spot.y * height)
                        .opacity(index < 6 - value ? 0.9 : 0)
                }
                LinearGradient(colors: [.white.opacity(0), .white.opacity(0.05 + Double(value) * 0.04), .white.opacity(0)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                if value >= 4 {
                    Image(systemName: "sparkles").font(.system(size: 30)).foregroundStyle(.white)
                        .position(x: width * 0.78, y: height * 0.3)
                    Image(systemName: "sparkle").font(.system(size: 18)).foregroundStyle(.white.opacity(0.8))
                        .position(x: width * 0.3, y: height * 0.62)
                }
                Image(systemName: "hand.raised.fill")
                    .font(.system(size: 30)).foregroundStyle(Theme.foam)
                    .padding(10).background(Theme.amber, in: Circle())
                    .shadow(color: Theme.amber.opacity(0.6), radius: 10)
                    .position(x: 24 + CGFloat(value) / 5 * (width - 48), y: height * 0.5)
            }
            .animation(.snappy(duration: 0.25), value: value)
            .frame(width: width, height: height)
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                $value.update(Int((drag.location.x / proxy.size.width * 5).rounded()))
            })
        }
    }
}

// MARK: Ljudnivå: a level meter, 0 = loud, 5 = quiet

struct VolumeControl: View {
    @Binding var value: Int
    private let pattern: [CGFloat] = [0.5, 0.8, 0.65, 1, 0.75, 0.9, 0.55, 0.85, 0.7, 0.95, 0.6, 0.8]
    private let icons = ["speaker.wave.3.fill", "speaker.wave.3.fill", "speaker.wave.2.fill",
                         "speaker.wave.2.fill", "speaker.wave.1.fill", "speaker.fill"]

    var body: some View {
        GeometryReader { proxy in
            let loudness = CGFloat(5 - value) / 5
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: icons[RatingWords.clamp(value)])
                    .font(.system(size: 30, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 50)
                HStack(alignment: .center, spacing: 5) {
                    ForEach(Array(pattern.enumerated()), id: \.offset) { _, level in
                        Capsule()
                            .fill(loudness > 0.6
                                  ? AnyShapeStyle(LinearGradient(colors: [Theme.bad, Theme.amber], startPoint: .top, endPoint: .bottom))
                                  : AnyShapeStyle(Theme.amber))
                            .frame(width: 10, height: max(8, (0.08 + loudness * 0.92) * level * (proxy.size.height - 40)))
                    }
                }
                .frame(height: proxy.size.height - 40)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .bottom) {
                HStack {
                    Text("Högljutt")
                    Spacer()
                    Text("Tyst")
                }
                .font(Theme.body(12, .medium))
                .foregroundStyle(Theme.tertiary)
                .padding(.horizontal, 20)
            }
            .animation(.snappy(duration: 0.2), value: value)
            .contentShape(Rectangle())
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
            ZStack {
                StylisedMap().clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)).opacity(0.9)
                Circle().fill(Theme.amber.opacity(0.1)).frame(width: radius * 2, height: radius * 2).position(center)
                Circle().strokeBorder(Theme.amber, style: .init(lineWidth: 2, dash: [5, 4]))
                    .frame(width: radius * 2, height: radius * 2).position(center)
                ForEach(Array(others.enumerated()), id: \.offset) { index, other in
                    let radians = other.degrees * .pi / 180
                    let point = CGPoint(x: center.x + cos(radians) * other.distance * maxRadius,
                                        y: center.y + sin(radians) * other.distance * maxRadius)
                    let isInside = index < value
                    Circle().fill(isInside ? Theme.amber : Color.white.opacity(0.25)).frame(width: 12, height: 12).position(point)
                    if isInside {
                        Text(other.label).font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Capsule().fill(.black.opacity(0.7)))
                            .position(x: point.x + (cos(radians) >= 0 ? 26 : -26), y: point.y)
                    }
                }
                Image(systemName: "mug.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(.black)
                    .frame(width: 32, height: 32).background(.white, in: Circle()).position(center)
            }
            .animation(.snappy(duration: 0.2), value: value)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { drag in
                let distance = hypot(drag.location.x - center.x, drag.location.y - center.y) / maxRadius
                $value.update(others.filter { $0.distance <= distance }.count)
            })
        }
    }
}

/// A drawn city at night: a river, parks, and a loose street grid.
struct StylisedMap: View {
    var body: some View {
        Canvas { context, size in
            let width = size.width, height = size.height
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(red: 0.07, green: 0.07, blue: 0.085)))
            for (center, extent) in [(CGPoint(x: 0.27, y: 0.80), CGSize(width: 0.2, height: 0.12)),
                                     (CGPoint(x: 0.62, y: 0.62), CGSize(width: 0.12, height: 0.07)),
                                     (CGPoint(x: 0.86, y: 0.48), CGSize(width: 0.1, height: 0.06))] {
                let rect = CGRect(x: (center.x - extent.width / 2) * width, y: (center.y - extent.height / 2) * height,
                                  width: extent.width * width, height: extent.height * height)
                context.fill(Path(roundedRect: rect, cornerRadius: 30), with: .color(Color(red: 0.08, green: 0.14, blue: 0.1)))
            }
            var minor = Path()
            for row in 0..<18 {
                let y = Double(row) / 17 * height
                minor.move(to: CGPoint(x: 0, y: y + sin(Double(row) * 1.7) * 12))
                minor.addLine(to: CGPoint(x: width, y: y + cos(Double(row) * 1.3) * 20 + 14))
            }
            for column in 0..<12 {
                let x = Double(column) / 11 * width
                minor.move(to: CGPoint(x: x + sin(Double(column)) * 18, y: 0))
                minor.addLine(to: CGPoint(x: x + cos(Double(column) * 2.1) * 26, y: height))
            }
            context.stroke(minor, with: .color(.white.opacity(0.05)), lineWidth: 1)
            var major = Path()
            major.move(to: CGPoint(x: 0, y: 0.55 * height))
            major.addCurve(to: CGPoint(x: width, y: 0.42 * height),
                           control1: CGPoint(x: 0.35 * width, y: 0.5 * height), control2: CGPoint(x: 0.7 * width, y: 0.47 * height))
            major.move(to: CGPoint(x: 0.6 * width, y: 0.3 * height))
            major.addCurve(to: CGPoint(x: 0.5 * width, y: height),
                           control1: CGPoint(x: 0.62 * width, y: 0.6 * height), control2: CGPoint(x: 0.45 * width, y: 0.8 * height))
            major.move(to: CGPoint(x: 0.1 * width, y: 0.3 * height))
            major.addLine(to: CGPoint(x: 0.25 * width, y: height))
            context.stroke(major, with: .color(.white.opacity(0.13)), lineWidth: 3)
            var river = Path()
            river.move(to: CGPoint(x: -20, y: 0.25 * height))
            river.addCurve(to: CGPoint(x: 0.55 * width, y: 0.17 * height),
                           control1: CGPoint(x: 0.2 * width, y: 0.2 * height), control2: CGPoint(x: 0.4 * width, y: 0.2 * height))
            river.addCurve(to: CGPoint(x: width + 20, y: 0.05 * height),
                           control1: CGPoint(x: 0.75 * width, y: 0.14 * height), control2: CGPoint(x: 0.85 * width, y: 0.05 * height))
            context.stroke(river, with: .color(Color(red: 0.09, green: 0.13, blue: 0.2)), style: .init(lineWidth: 46, lineCap: .round))
        }
    }
}
#endif
