#if !os(Android)
import SwiftUI
import UIKit

/// Design tokens of the iOS app:
/// black page, amber accent, heavy system titles, black rounded numbers with a warm glow,
/// and Liquid Glass chrome.
enum Theme {
    static let bg = Color.black
    static let raised = Color(white: 0.105)
    static let raised2 = Color(white: 0.16)
    static let raised3 = Color(white: 0.22)
    static let text = Color.white
    static let secondary = Color.white.opacity(0.6)
    static let tertiary = Color.white.opacity(0.36)
    static let hairline = Color.white.opacity(0.12)
    static let amber = Color(red: 1.0, green: 0.72, blue: 0.20)
    static let amberDeep = Color(red: 0.92, green: 0.55, blue: 0.05)
    static let foam = Color(red: 1.0, green: 0.96, blue: 0.86)
    static let good = Color(red: 0.45, green: 0.86, blue: 0.52)
    static let bad = Color(red: 1.0, green: 0.46, blue: 0.40)

    static func title(_ size: CGFloat) -> Font { .system(size: size, weight: .heavy) }
    static func num(_ size: CGFloat) -> Font { .system(size: size, weight: .black, design: .rounded) }
    static func body(_ size: CGFloat = 15, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight) }
    static func label(_ size: CGFloat = 13) -> Font { .system(size: size, weight: .semibold) }

    /// A stable pastel per name, so a reviewer always has the same colour.
    static func avatarColor(for name: String) -> Color {
        let value = name.lowercased().unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return Color(hue: Double(value % 12) / 12, saturation: 0.35, brightness: 0.95)
    }

    /// Navigation bar titles in the heavy weight of the design. Call once at launch.
    @MainActor static func applyAppearance() {
        let navigationBar = UINavigationBar.appearance()
        navigationBar.largeTitleTextAttributes = [.font: UIFont.systemFont(ofSize: 34, weight: .heavy)]
        navigationBar.titleTextAttributes = [.font: UIFont.systemFont(ofSize: 17, weight: .semibold)]
    }
}

extension View {
    func cardBackground(_ radius: CGFloat = 24, fill: Color = Theme.raised) -> some View {
        background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    /// The amber glow on prices and large rating numbers.
    func glow(_ on: Bool = true, color: Color = Theme.amber, radius: CGFloat = 12) -> some View {
        shadow(color: on ? color.opacity(0.65) : .clear, radius: radius)
    }

    /// A black page behind scroll content.
    func pageBackground() -> some View {
        background(Theme.bg.ignoresSafeArea())
            .scrollContentBackground(.hidden)
    }
}
#endif
