import SwiftUI
import EnStorStark

/// The app host: shows the root view from the EnStorStark package module.
@main struct AppMain: App {
    /// Receives the APNs token and notification taps (see `Notifications.swift` in the package).
    @UIApplicationDelegateAdaptor(EnStorStarkAppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            EnStorStarkRootView()
        }
    }
}
