import SwiftUI
import EnStorStark

/// The app host: shows the root view from the EnStorStark package module.
@main struct AppMain: App {
    var body: some Scene {
        WindowGroup {
            EnStorStarkRootView()
        }
    }
}
