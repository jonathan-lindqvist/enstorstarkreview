import OSLog
import SwiftUI

/// A logger for the EnStorStark module.
let logger: Logger = Logger(subsystem: "se.enstorstarkreview.app", category: "EnStorStark")

/// The root view of the app, shown by the Darwin app host.
public struct EnStorStarkRootView: View {
    public init() {}

    public var body: some View {
        ContentView()
    }
}
