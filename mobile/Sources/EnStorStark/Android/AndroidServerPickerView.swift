#if os(Android)
import SwiftUI
import EnStorStarkModel

/// Chooses the server that the app talks to, from the "Server" row in "Om" that only Debug builds
/// show. A bottom sheet in the Android design, like the login.
///
/// Not inside `#if DEBUG`: Skip's bridge generator does not define `DEBUG`, so a view declared
/// there gets an empty bridge and renders as nothing on Android.
struct ServerPickerView: View {
    let current: URL
    let onSelect: (URL) -> Void
    @Environment(\.dismiss) var dismiss
    @State var customText = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Välj server").font(Ess.headlineMedium).foregroundStyle(.white)
                    Text("Ett byte loggar ut och laddar om appen.")
                        .font(Ess.bodyMedium)
                        .foregroundStyle(Ess.secondary)
                }
                VStack(spacing: 0) {
                    option("Lokal", origin: AppConfiguration.localOrigin)
                    Rectangle().fill(Ess.hairline).frame(height: 1)
                    option("Produktion", origin: AppConfiguration.productionOrigin)
                    if current != AppConfiguration.localOrigin && current != AppConfiguration.productionOrigin {
                        Rectangle().fill(Ess.hairline).frame(height: 1)
                        option("Egen", origin: current)
                    }
                }
                .essCard(20, fill: Ess.raised2)
                EssField(
                    label: "Egen adress",
                    text: $customText,
                    icon: .openInNew,
                    supporting: "Till exempel en ngrok-adress till make dev, för en riktig telefon."
                )
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .submitLabel(.go)
                .onSubmit { useCustom() }
                PrimaryButton(text: "Använd", height: 52, isEnabled: customOrigin != nil) { useCustom() }
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .background(Ess.raised)
    }

    var customOrigin: URL? {
        AppConfiguration.normalizedOrigin(customText)
    }

    func option(_ title: String, origin: URL) -> some View {
        Button {
            select(origin)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Ess.bodyLarge).foregroundStyle(.white)
                    Text(origin.absoluteString).font(Ess.bodySmall).foregroundStyle(Ess.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                if origin == current {
                    EssIconView(.check, size: 22, color: Ess.amber)
                }
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        }
        .buttonStyle(.plain)
        .selectedTrait(origin == current)
    }

    func useCustom() {
        if let origin = customOrigin { select(origin) }
    }

    func select(_ origin: URL) {
        dismiss()
        if origin != current {
            onSelect(origin)
        }
    }
}
#endif
