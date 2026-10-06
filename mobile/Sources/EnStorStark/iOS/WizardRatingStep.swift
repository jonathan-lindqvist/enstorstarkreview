#if !os(Android)
import SwiftUI
import EnStorStarkModel

/// Step 4: one card per aspect. Each card has its own control, and a row of 0–5 buttons below.
struct WizardRatingStep: View {
    @Bindable var form: ReviewFormModel
    @Binding var index: Int
    let forward: Bool
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    var metrics: [RatingMetric] { form.metadata.ratingMetrics }

    var body: some View {
        if metrics.isEmpty {
            EmptyState(icon: "star", title: "Inga betyg att sätta")
        } else {
            let metric = metrics[min(index, metrics.count - 1)]
            VStack(spacing: 14) {
                header
                ZStack(alignment: .top) {
                    // The next cards peek out below.
                    RoundedRectangle(cornerRadius: 36, style: .continuous).fill(Color(white: 0.07))
                        .padding(.horizontal, 28).offset(y: 22)
                        .opacity(index < metrics.count - 2 ? 1 : 0)
                    RoundedRectangle(cornerRadius: 36, style: .continuous).fill(Color(white: 0.09))
                        .padding(.horizontal, 14).offset(y: 11)
                        .opacity(index < metrics.count - 1 ? 1 : 0)
                    card(metric)
                        .id(metric.key)
                        .transition(cardTransition)
                }
                .padding(.bottom, 22)
                valueButtons(metric)
                FieldError(message: form.error(for: "/ratings/\(metric.key.rawValue)"))
            }
            .padding(.horizontal, 18)
            .padding(.top, 4)
            .sensoryFeedback(.selection, trigger: form.draft.ratings[metric.key])
        }
    }

    var cardTransition: AnyTransition {
        if reduceMotion { return .opacity }
        return .asymmetric(
            insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
            removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity)
        )
    }

    var header: some View {
        HStack(spacing: 6) {
            Text("Betyg \(index + 1) av \(metrics.count)")
                .font(Theme.body(14, .semibold))
                .foregroundStyle(Theme.secondary)
            Spacer()
            ForEach(Array(metrics.enumerated()), id: \.offset) { position, item in
                Button {
                    withAnimation(.snappy(duration: 0.35)) { index = position }
                } label: {
                    Circle()
                        .fill(position < index ? Theme.amber : (position == index ? Color.white : Color.white.opacity(0.18)))
                        .frame(width: 7, height: 7)
                        .frame(width: 16, height: 30)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("\(item.label), \(value(item.key)) av 5"))
            }
        }
    }

    func card(_ metric: RatingMetric) -> some View {
        let current = value(metric.key)
        return VStack(spacing: 10) {
            VStack(spacing: 4) {
                Text(metric.label).font(Theme.title(34)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                Text(metric.description).font(Theme.body(14)).foregroundStyle(Theme.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 16)
            RatingControl(key: metric.key, value: binding(metric.key), priceText: priceText)
                .accessibilityLabel(Text(metric.label))
                .frame(maxWidth: .infinity, minHeight: 170, maxHeight: 240)
                .padding(.horizontal, 12)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(verbatim: "\(current)")
                    .font(Theme.num(56))
                    .foregroundStyle(Theme.amber)
                    .glow(radius: 16)
                    .contentTransition(.numericText(value: Double(current)))
                Text(RatingWords.word(metric.key, current))
                    .font(Theme.title(22))
                    .foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer()
                Text("av 5").font(Theme.body(13)).foregroundStyle(Theme.tertiary)
            }
            .animation(.snappy(duration: 0.2), value: current)
            .padding(.horizontal, 22)
            .accessibilityHidden(true)
        }
        .padding(.top, 24)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color(white: 0.115), in: RoundedRectangle(cornerRadius: 36, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 36, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 1))
    }

    func valueButtons(_ metric: RatingMetric) -> some View {
        let current = value(metric.key)
        return HStack(spacing: 8) {
            ForEach(0..<6, id: \.self) { option in
                Button {
                    withAnimation(.snappy) { form.draft.ratings[metric.key] = option }
                } label: {
                    Text(verbatim: "\(option)")
                        .font(Theme.num(20))
                        .foregroundStyle(option == current ? Color.black : .white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(option == current ? Theme.amber : Color.white.opacity(0.1), in: Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("\(option), \(RatingWords.word(metric.key, option))"))
                .accessibilityAddTraits(option == current ? .isSelected : [])
                .accessibilityIdentifier("wizard.rating.value.\(option)")
            }
        }
    }

    var priceText: String? {
        form.draft.priceKr.map { "\($0) kr" }
    }

    func value(_ key: RatingKey) -> Int {
        form.draft.ratings[key] ?? 0
    }

    func binding(_ key: RatingKey) -> Binding<Int> {
        Binding(get: { form.draft.ratings[key] ?? 0 }, set: { form.draft.ratings[key] = $0 })
    }
}
#endif
