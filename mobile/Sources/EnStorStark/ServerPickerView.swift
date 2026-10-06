#if DEBUG
import SwiftUI
#if os(iOS)
import UIKit
#endif
import EnStorStarkModel

/// Debug builds only: chooses the server that the app talks to. Opens with a shake (iOS) or
/// from the "Server" row in "Om" (both platforms).
struct ServerPickerView: View {
    let current: URL
    let onSelect: (URL) -> Void
    @Environment(\.dismiss) var dismiss
    @State var customText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    option("Lokal", origin: AppConfiguration.localOrigin)
                    option("Produktion", origin: AppConfiguration.productionOrigin)
                    if current != AppConfiguration.localOrigin && current != AppConfiguration.productionOrigin {
                        option("Egen", origin: current)
                    }
                } header: {
                    Text("Server")
                } footer: {
                    Text("Ett byte loggar ut och laddar om appen.")
                }

                Section {
                    TextField("https://abc.ngrok-free.app", text: $customText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .keyboardType(.URL)
                        #endif
                    Button("Använd") {
                        if let origin = customOrigin { select(origin) }
                    }
                    .disabled(customOrigin == nil)
                } header: {
                    Text("Egen adress")
                } footer: {
                    Text("Till exempel en ngrok-adress till make dev, för en riktig telefon.")
                }
            }
            .navigationTitle("Välj server")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Stäng") { dismiss() }
                }
            }
        }
    }

    var customOrigin: URL? {
        AppConfiguration.normalizedOrigin(customText)
    }

    func option(_ title: String, origin: URL) -> some View {
        Button {
            select(origin)
        } label: {
            HStack {
                VStack(alignment: .leading) {
                    Text(title)
                    Text(origin.absoluteString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if origin == current {
                    Image(systemName: "checkmark")
                }
            }
        }
    }

    func select(_ origin: URL) {
        dismiss()
        if origin != current {
            onSelect(origin)
        }
    }
}

#if os(iOS)
extension Notification.Name {
    /// Posted when the user shakes the device (Device › Shake, ⌃⌘Z, in the simulator).
    static let deviceDidShake = Notification.Name("EnStorStarkDeviceDidShake")
}

extension UIWindow {
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake {
            NotificationCenter.default.post(name: .deviceDidShake, object: nil)
        }
        super.motionEnded(motion, with: event)
    }
}
#endif
#endif
