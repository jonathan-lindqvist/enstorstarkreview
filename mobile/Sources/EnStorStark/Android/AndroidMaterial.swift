import SwiftUI

// Material 3 pieces that SkipUI has no SwiftUI equivalent for: Material Symbols, filter
// chips that wrap, the extended FAB, the snackbar, and the two drawn controls of the wizard
// (price ruler and rating dial). The `#if SKIP` code is transpiled to Kotlin and calls Compose
// directly; the compiled Swift uses it through `ComposeView`.

#if os(Android)
/// A Material Symbols icon by name. See `materialIcon(_:)` for the names.
struct MIcon: View {
    let name: String
    var size: CGFloat = 24
    var color: Color? = nil

    init(_ name: String, size: CGFloat = 24, color: Color? = nil) {
        self.name = name
        self.size = size
        self.color = color
    }

    var body: some View {
        ComposeView { MaterialIconComposer(name: name, size: Double(size), color: color) }
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// Material 3 filter chips that wrap to new lines, or scroll sideways.
struct ChipFlow: View {
    let labels: [String]
    let selected: [Bool]
    /// `check` shows a check on selected chips; `add` also shows a plus on the others.
    var icons = ChipIcons.check
    var scrolls = false
    var horizontalPadding: CGFloat = 0
    let onTap: (Int) -> Void

    enum ChipIcons: Int { case none = 0, check = 1, add = 2 }

    var body: some View {
        ComposeView {
            FilterChipFlowComposer(labels: labels, selected: selected, icons: icons.rawValue, scrolls: scrolls,
                                   horizontalPadding: Double(horizontalPadding), onTap: onTap)
        }
    }
}

/// The Material 3 extended floating action button.
struct ExtendedFAB: View {
    let text: String
    let icon: String
    let action: () -> Void

    var body: some View {
        ComposeView { ExtendedFabComposer(text: text, icon: icon, onClick: action) }
    }
}

/// A Material 3 snackbar, with an optional action.
struct Snackbar: View {
    let message: String
    var actionLabel: String? = nil
    var action: () -> Void = {}

    var body: some View {
        ComposeView { SnackbarComposer(message: message, actionLabel: actionLabel ?? "", onAction: action) }
            .padding(.horizontal, 12)
    }
}

/// The bottom bar buttons of the wizard: an outlined "Tillbaka" and the filled next action,
/// both 52 dp high, as in the Studio design.
struct WizardButtons: View {
    let showsBack: Bool
    let nextLabel: String
    let nextIcon: String
    var isLoading = false
    var isEnabled = true
    let back: () -> Void
    let next: () -> Void

    var body: some View {
        ComposeView {
            WizardButtonsComposer(showsBack: showsBack, nextLabel: nextLabel, nextIcon: nextIcon,
                                  isLoading: isLoading, isEnabled: isEnabled, onBack: back, onNext: next)
        }
        .frame(height: 52)
    }
}

/// A full-width Material 3 button: filled, tonal, or outlined, with an optional icon.
struct M3Button: View {
    enum Style: Int { case filled = 0, tonal = 1, outlined = 2 }

    let text: String
    var icon: String? = nil
    var iconAfter = false
    var style = Style.filled
    var height: CGFloat = 52
    var isLoading = false
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        ComposeView {
            M3ButtonComposer(text: text, icon: icon ?? "", iconAfter: iconAfter, style: style.rawValue,
                             height: Double(height), isLoading: isLoading, isEnabled: isEnabled, onClick: action)
        }
        // Without a flexible frame, the first of two buttons in a row takes the whole row.
        .frame(maxWidth: .infinity)
        .frame(height: height)
    }
}

/// The price ruler of the wizard: a tick for every krona, drag sideways to scrub.
struct PriceRuler: View {
    @Binding var price: Int?
    let range: ClosedRange<Int>

    var body: some View {
        ComposeView {
            PriceRulerComposer(price: price ?? -1, minimum: range.lowerBound, maximum: range.upperBound) { value in
                price = value
            }
        }
        .frame(height: 70)
        .accessibilityLabel(Text("Prislinjal"))
        .accessibilityValue(Text(price.map { "\($0) kronor" } ?? "Inget pris"))
    }
}

/// A rating dial (0–5): a knob with six ticks and a light that grows with the value. Drag
/// around the knob or tap a tick.
struct RatingDial: View {
    @Binding var value: Int
    let icon: String

    var body: some View {
        ComposeView { RatingDialComposer(value: value, icon: icon) { value = $0 } }
            .frame(height: 220)
    }
}
#endif

#if SKIP
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.__
import androidx.compose.material.icons.outlined.__
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDefaults
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/// Amber on near-black, the Material 3 take on the iOS colours.
/// `Android/app/src/main/kotlin/Main.kt` applies it to the whole app, including sheets
/// and dialogs. `Ess` in `AndroidComponents.swift` holds the same colours for SwiftUI.
// SKIP @nobridge
public func essDarkColorScheme() -> androidx.compose.material3.ColorScheme {
    return darkColorScheme(
        primary: androidx.compose.ui.graphics.Color(0xFFFFB833),
        onPrimary: androidx.compose.ui.graphics.Color(0xFF2B1B00),
        primaryContainer: androidx.compose.ui.graphics.Color(0xFF5C3F00),
        onPrimaryContainer: androidx.compose.ui.graphics.Color(0xFFFFDDA8),
        inversePrimary: androidx.compose.ui.graphics.Color(0xFF7A5900),
        secondary: androidx.compose.ui.graphics.Color(0xFFDCC4A0),
        onSecondary: androidx.compose.ui.graphics.Color(0xFF3D2E15),
        secondaryContainer: androidx.compose.ui.graphics.Color(0xFF5A4317),
        onSecondaryContainer: androidx.compose.ui.graphics.Color(0xFFFFDEA6),
        tertiary: androidx.compose.ui.graphics.Color(0xFF8FD69B),
        onTertiary: androidx.compose.ui.graphics.Color(0xFF00391A),
        tertiaryContainer: androidx.compose.ui.graphics.Color(0xFF1C4D2A),
        onTertiaryContainer: androidx.compose.ui.graphics.Color(0xFFAAF2B5),
        background: androidx.compose.ui.graphics.Color(0xFF0E0D0B),
        onBackground: androidx.compose.ui.graphics.Color(0xFFEDE1D4),
        surface: androidx.compose.ui.graphics.Color(0xFF0E0D0B),
        onSurface: androidx.compose.ui.graphics.Color(0xFFEDE1D4),
        surfaceVariant: androidx.compose.ui.graphics.Color(0xFF2E2922),
        onSurfaceVariant: androidx.compose.ui.graphics.Color(0xFFCFC4B5),
        surfaceTint: androidx.compose.ui.graphics.Color(0xFFFFB833),
        inverseSurface: androidx.compose.ui.graphics.Color(0xFFEDE1D4),
        inverseOnSurface: androidx.compose.ui.graphics.Color(0xFF33302B),
        error: androidx.compose.ui.graphics.Color(0xFFFF8A80),
        onError: androidx.compose.ui.graphics.Color(0xFF690005),
        errorContainer: androidx.compose.ui.graphics.Color(0xFF5C1A16),
        onErrorContainer: androidx.compose.ui.graphics.Color(0xFFFFDAD6),
        outline: androidx.compose.ui.graphics.Color(0xFF988F81),
        outlineVariant: androidx.compose.ui.graphics.Color(0xFF4C463C),
        surfaceContainerLowest: androidx.compose.ui.graphics.Color(0xFF090807),
        surfaceContainerLow: androidx.compose.ui.graphics.Color(0xFF171512),
        surfaceContainer: androidx.compose.ui.graphics.Color(0xFF1C1A16),
        surfaceContainerHigh: androidx.compose.ui.graphics.Color(0xFF26231F),
        surfaceContainerHighest: androidx.compose.ui.graphics.Color(0xFF312D28)
    )
}

private func materialIcon(_ name: String) -> androidx.compose.ui.graphics.vector.ImageVector {
    switch name {
    case "add": return Icons.Filled.Add
    case "arrow_back": return Icons.Filled.ArrowBack
    case "arrow_forward": return Icons.Filled.ArrowForward
    case "bold": return Icons.Filled.FormatBold
    case "bullets": return Icons.Filled.FormatListBulleted
    case "camera": return Icons.Filled.PhotoCamera
    case "check": return Icons.Filled.Check
    case "check_circle": return Icons.Filled.CheckCircle
    case "chevron_right": return Icons.Filled.ChevronRight
    case "clean": return Icons.Filled.CleaningServices
    case "close": return Icons.Filled.Close
    case "edit": return Icons.Filled.Edit
    case "error": return Icons.Filled.ErrorOutline
    case "group": return Icons.Filled.Group
    case "heading": return Icons.Filled.Title
    case "history": return Icons.Filled.History
    case "image": return Icons.Filled.Image
    case "key": return Icons.Filled.Key
    case "library": return Icons.Filled.PhotoLibrary
    case "light": return Icons.Filled.Lightbulb
    case "location_off": return Icons.Filled.LocationOff
    case "lock": return Icons.Filled.Lock
    case "logout": return Icons.Filled.Logout
    case "beer": return Icons.Filled.SportsBar
    case "my_location": return Icons.Filled.MyLocation
    case "notes": return Icons.Filled.Notes
    case "open": return Icons.Filled.OpenInNew
    case "payments": return Icons.Filled.Payments
    case "person": return Icons.Filled.Person
    case "place": return Icons.Filled.LocationOn
    case "quality": return Icons.Filled.Verified
    case "refresh": return Icons.Filled.Refresh
    case "restore": return Icons.Filled.Restore
    case "search": return Icons.Filled.Search
    case "send": return Icons.Filled.Send
    case "service": return Icons.Filled.RoomService
    case "share": return Icons.Filled.Share
    case "schedule": return Icons.Filled.Schedule
    case "star": return Icons.Filled.Star
    case "star_outline": return Icons.Filled.StarBorder
    case "taps": return Icons.Filled.LocalDrink
    case "visibility": return Icons.Filled.Visibility
    case "volume": return Icons.Filled.VolumeUp
    case "walk": return Icons.Filled.DirectionsWalk
    default: return Icons.Filled.HelpOutline
    }
}

struct MaterialIconComposer: ContentComposer {
    let name: String
    let size: Double
    let color: Color?

    @Composable func Compose(context: ComposeContext) {
        let tint = color?.asComposeColor() ?? androidx.compose.material3.LocalContentColor.current
        androidx.compose.material3.Icon(imageVector: materialIcon(name), contentDescription: nil,
                                        modifier: context.modifier.size(size.dp), tint: tint)
    }
}

// SKIP INSERT: @OptIn(ExperimentalLayoutApi::class)
struct FilterChipFlowComposer: ContentComposer {
    let labels: [String]
    let selected: [Bool]
    let icons: Int
    let scrolls: Bool
    let horizontalPadding: Double
    let onTap: (Int) -> Void

    init(labels: [String], selected: [Bool], icons: Int, scrolls: Bool, horizontalPadding: Double, onTap: @escaping (Int) -> Void) {
        self.labels = labels
        self.selected = selected
        self.icons = icons
        self.scrolls = scrolls
        self.horizontalPadding = horizontalPadding
        self.onTap = onTap
    }

    @Composable func Compose(context: ComposeContext) {
        let base = context.modifier.fillMaxWidth()
        let modifier = scrolls
            ? base.horizontalScroll(rememberScrollState()).padding(horizontal: horizontalPadding.dp)
            : base.padding(horizontal: horizontalPadding.dp)
        FlowRow(modifier: modifier, horizontalArrangement: Arrangement.spacedBy(8.dp)) {
            for index in 0..<labels.count {
                let isOn = selected[index]
                let showsIcon = icons == 2 || (icons == 1 && isOn)
                FilterChip(
                    selected: isOn,
                    onClick: { onTap(index) },
                    label: { androidx.compose.material3.Text(labels[index]) },
                    leadingIcon: showsIcon ? {
                        androidx.compose.material3.Icon(imageVector: isOn ? Icons.Filled.Check : Icons.Filled.Add,
                                                        contentDescription: nil,
                                                        modifier: androidx.compose.ui.Modifier.size(FilterChipDefaults.IconSize))
                    } : nil
                )
            }
        }
    }
}

struct ExtendedFabComposer: ContentComposer {
    let text: String
    let icon: String
    let onClick: () -> Void

    init(text: String, icon: String, onClick: @escaping () -> Void) {
        self.text = text
        self.icon = icon
        self.onClick = onClick
    }

    @Composable func Compose(context: ComposeContext) {
        ExtendedFloatingActionButton(
            text: { androidx.compose.material3.Text(text) },
            icon: { androidx.compose.material3.Icon(imageVector: materialIcon(icon), contentDescription: nil) },
            onClick: onClick,
            modifier: context.modifier,
            containerColor: MaterialTheme.colorScheme.primary,
            contentColor: MaterialTheme.colorScheme.onPrimary
        )
    }
}

struct SnackbarComposer: ContentComposer {
    let message: String
    let actionLabel: String
    let onAction: () -> Void

    init(message: String, actionLabel: String, onAction: @escaping () -> Void) {
        self.message = message
        self.actionLabel = actionLabel
        self.onAction = onAction
    }

    @Composable func Compose(context: ComposeContext) {
        androidx.compose.material3.Snackbar(
            modifier: context.modifier,
            action: actionLabel.isEmpty ? nil : {
                TextButton(onClick: onAction) {
                    androidx.compose.material3.Text(actionLabel, color: SnackbarDefaults.actionColor)
                }
            }
        ) {
            androidx.compose.material3.Text(message)
        }
    }
}

struct WizardButtonsComposer: ContentComposer {
    let showsBack: Bool
    let nextLabel: String
    let nextIcon: String
    let isLoading: Bool
    let isEnabled: Bool
    let onBack: () -> Void
    let onNext: () -> Void

    init(showsBack: Bool, nextLabel: String, nextIcon: String, isLoading: Bool, isEnabled: Bool,
         onBack: @escaping () -> Void, onNext: @escaping () -> Void) {
        self.showsBack = showsBack
        self.nextLabel = nextLabel
        self.nextIcon = nextIcon
        self.isLoading = isLoading
        self.isEnabled = isEnabled
        self.onBack = onBack
        self.onNext = onNext
    }

    @Composable func Compose(context: ComposeContext) {
        Row(modifier: context.modifier.fillMaxWidth(), verticalAlignment: Alignment.CenterVertically,
            horizontalArrangement: Arrangement.spacedBy(12.dp)) {
            if showsBack {
                OutlinedButton(onClick: onBack, modifier: androidx.compose.ui.Modifier.height(52.dp)) {
                    androidx.compose.material3.Icon(imageVector: materialIcon("arrow_back"), contentDescription: nil,
                                                    modifier: androidx.compose.ui.Modifier.size(18.dp))
                    Spacer(modifier: androidx.compose.ui.Modifier.width(6.dp))
                    androidx.compose.material3.Text("Tillbaka")
                }
            }
            androidx.compose.material3.Button(onClick: onNext, enabled: isEnabled && !isLoading,
                                              modifier: androidx.compose.ui.Modifier.weight(Float(1.0)).height(52.dp)) {
                if isLoading {
                    CircularProgressIndicator(modifier: androidx.compose.ui.Modifier.size(20.dp), strokeWidth: 2.dp,
                                              color: MaterialTheme.colorScheme.onPrimary)
                } else {
                    androidx.compose.material3.Text(nextLabel, maxLines: 1,
                                                    style: MaterialTheme.typography.labelLarge.copy(fontSize: 16.sp, fontWeight: FontWeight.Bold))
                    Spacer(modifier: androidx.compose.ui.Modifier.width(8.dp))
                    androidx.compose.material3.Icon(imageVector: materialIcon(nextIcon), contentDescription: nil,
                                                    modifier: androidx.compose.ui.Modifier.size(18.dp))
                }
            }
        }
    }
}

struct M3ButtonComposer: ContentComposer {
    let text: String
    let icon: String
    let iconAfter: Bool
    let style: Int
    let height: Double
    let isLoading: Bool
    let isEnabled: Bool
    let onClick: () -> Void

    init(text: String, icon: String, iconAfter: Bool, style: Int, height: Double, isLoading: Bool, isEnabled: Bool,
         onClick: @escaping () -> Void) {
        self.text = text
        self.icon = icon
        self.iconAfter = iconAfter
        self.style = style
        self.height = height
        self.isLoading = isLoading
        self.isEnabled = isEnabled
        self.onClick = onClick
    }

    @Composable func Compose(context: ComposeContext) {
        let modifier = context.modifier.fillMaxWidth().height(height.dp)
        let enabled = isEnabled && !isLoading
        if style == 2 {
            OutlinedButton(onClick: onClick, modifier: modifier, enabled: enabled) { Label() }
        } else if style == 1 {
            FilledTonalButton(onClick: onClick, modifier: modifier, enabled: enabled) { Label() }
        } else {
            androidx.compose.material3.Button(onClick: onClick, modifier: modifier, enabled: enabled) { Label() }
        }
    }

    @Composable func Label() {
        if isLoading {
            CircularProgressIndicator(modifier: androidx.compose.ui.Modifier.size(20.dp), strokeWidth: 2.dp,
                                      color: androidx.compose.material3.LocalContentColor.current)
            return
        }
        if !icon.isEmpty && !iconAfter {
            androidx.compose.material3.Icon(imageVector: materialIcon(icon), contentDescription: nil,
                                            modifier: androidx.compose.ui.Modifier.size(18.dp))
            Spacer(modifier: androidx.compose.ui.Modifier.width(8.dp))
        }
        androidx.compose.material3.Text(text, maxLines: 1,
                                        style: MaterialTheme.typography.labelLarge.copy(fontSize: 16.sp, fontWeight: style == 0 ? FontWeight.Bold : FontWeight.Medium))
        if !icon.isEmpty && iconAfter {
            Spacer(modifier: androidx.compose.ui.Modifier.width(8.dp))
            androidx.compose.material3.Icon(imageVector: materialIcon(icon), contentDescription: nil,
                                            modifier: androidx.compose.ui.Modifier.size(18.dp))
        }
    }
}

struct PriceRulerComposer: ContentComposer {
    let price: Int
    let minimum: Int
    let maximum: Int
    let onChange: (Int) -> Void

    init(price: Int, minimum: Int, maximum: Int, onChange: @escaping (Int) -> Void) {
        self.price = price
        self.minimum = minimum
        self.maximum = maximum
        self.onChange = onChange
    }

    @Composable func Compose(context: ComposeContext) {
        let resting = min(max(70, minimum), maximum)
        let shown = price < 0 ? resting : price
        let latestShown = rememberUpdatedState(shown)
        let latestChange = rememberUpdatedState(onChange)
        let startValue = remember { mutableStateOf(0) }
        let dragged = remember { mutableStateOf(Float(0.0)) }
        let measurer = rememberTextMeasurer()
        let amber = MaterialTheme.colorScheme.primary
        let tick = MaterialTheme.colorScheme.onSurface
        let labelStyle = TextStyle(fontSize: 12.sp, fontWeight: FontWeight.SemiBold, color: tick.copy(alpha: Float(0.5)))
        let lower = minimum
        let upper = maximum
        let isSet = price >= 0
        Canvas(modifier: context.modifier.fillMaxWidth().height(70.dp).pointerInput(lower, upper) {
            detectHorizontalDragGestures(onDragStart: { _ in
                startValue.value = latestShown.value
                dragged.value = Float(0.0)
            }) { change, amount in
                change.consume()
                dragged.value = dragged.value + amount
                let steps = (dragged.value / 10.dp.toPx()).roundToInt()
                let value = min(max(startValue.value - steps, lower), upper)
                if value != latestShown.value {
                    latestChange.value(value)
                }
            }
        }) {
            let middle = size.width / Float(2.0)
            let gap = 10.dp.toPx()
            for kr in lower...upper {
                let x = middle + Float(kr - shown) * gap
                if x < Float(-20.0) || x > size.width + Float(20.0) {
                    continue
                }
                let fade = max(Float(0.0), Float(1.0) - abs(x - middle) / middle)
                let isMajor = kr % 10 == 0
                let isHalf = kr % 5 == 0
                let height = (isMajor ? 30 : (isHalf ? 20 : 12)).dp.toPx()
                drawRoundRect(color: tick.copy(alpha: (isMajor ? Float(0.75) : Float(0.28)) * fade),
                              topLeft: Offset(x - 1.dp.toPx(), 8.dp.toPx()),
                              size: Size(2.dp.toPx(), height),
                              cornerRadius: CornerRadius(2.dp.toPx(), 2.dp.toPx()))
                if isMajor {
                    let layout = measurer.measure("\(kr)", style: labelStyle)
                    drawText(textLayoutResult: layout,
                             topLeft: Offset(x - Float(layout.size.width) / Float(2.0), height + 14.dp.toPx()),
                             alpha: fade)
                }
            }
            drawRoundRect(color: isSet ? amber : amber.copy(alpha: Float(0.4)),
                          topLeft: Offset(middle - 2.dp.toPx(), Float(0.0)),
                          size: Size(4.dp.toPx(), 46.dp.toPx()),
                          cornerRadius: CornerRadius(2.dp.toPx(), 2.dp.toPx()))
        }
    }
}

struct RatingDialComposer: ContentComposer {
    let value: Int
    let icon: String
    let onChange: (Int) -> Void

    init(value: Int, icon: String, onChange: @escaping (Int) -> Void) {
        self.value = value
        self.icon = icon
        self.onChange = onChange
    }

    @Composable func Compose(context: ComposeContext) {
        let latestValue = rememberUpdatedState(value)
        let latestChange = rememberUpdatedState(onChange)
        let amber = MaterialTheme.colorScheme.primary
        let knobTop = MaterialTheme.colorScheme.surfaceContainerHighest
        let knobBottom = MaterialTheme.colorScheme.surfaceContainerLowest
        let off = MaterialTheme.colorScheme.onSurface.copy(alpha: Float(0.22))
        let level = Float(value) / Float(5.0)
        let pick: (Offset, Size) -> Void = { point, area in
            let dx = Double(point.x - area.width / Float(2.0))
            let dy = Double(area.height / Float(2.0) - point.y)
            let degrees = atan2(dx, dy) * 180.0 / Double.pi
            let picked = min(max(((degrees + 135.0) / 54.0).roundToInt(), 0), 5)
            if picked != latestValue.value {
                latestChange.value(picked)
            }
        }
        Box(modifier: context.modifier.fillMaxWidth().height(220.dp), contentAlignment: Alignment.Center) {
            Canvas(modifier: androidx.compose.ui.Modifier.fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures(onTap: { point in
                        pick(point, Size(Float(size.width), Float(size.height)))
                    })
                }
                .pointerInput(Unit) {
                    detectDragGestures { change, _ in
                        change.consume()
                        pick(change.position, Size(Float(size.width), Float(size.height)))
                    }
                }
            ) {
                let c = center
                let radius = 62.dp.toPx()
                drawCircle(brush: Brush.radialGradient(colors: listOf(amber.copy(alpha: Float(0.5) * level), amber.copy(alpha: Float(0.0))),
                                                       center: c, radius: radius * Float(2.2)),
                           radius: radius * Float(2.2), center: c)
                for index in 0..<6 {
                    let angle = (-135.0 + Double(index) * 54.0) * Double.pi / 180.0
                    let inner = radius + 20.dp.toPx()
                    let outer = radius + 32.dp.toPx()
                    drawLine(color: index <= value ? amber : off,
                             start: Offset(c.x + Float(sin(angle)) * inner, c.y - Float(cos(angle)) * inner),
                             end: Offset(c.x + Float(sin(angle)) * outer, c.y - Float(cos(angle)) * outer),
                             strokeWidth: 4.dp.toPx(), cap: StrokeCap.Round)
                }
                drawCircle(brush: Brush.linearGradient(colors: listOf(knobTop, knobBottom),
                                                       start: Offset(c.x - radius, c.y - radius),
                                                       end: Offset(c.x + radius, c.y + radius)),
                           radius: radius, center: c)
                drawCircle(color: amber.copy(alpha: Float(0.15) + Float(0.35) * level), radius: radius,
                           center: c, style: Stroke(width: 1.5.dp.toPx()))
                rotate(degrees: Float(-135.0 + Double(value) * 54.0), pivot: c) {
                    drawLine(color: amber, start: Offset(c.x, c.y - radius + 8.dp.toPx()),
                             end: Offset(c.x, c.y - radius + 22.dp.toPx()), strokeWidth: 5.dp.toPx(), cap: StrokeCap.Round)
                }
            }
            androidx.compose.material3.Icon(imageVector: materialIcon(icon), contentDescription: nil,
                                            modifier: androidx.compose.ui.Modifier.size(40.dp),
                                            tint: amber.copy(alpha: Float(0.35) + Float(0.65) * level))
        }
    }
}
#endif
