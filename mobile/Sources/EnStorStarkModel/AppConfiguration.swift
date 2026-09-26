import Foundation
import SkipFuse

/// A logger for the EnStorStarkModel module.
let logger: Logger = Logger(subsystem: "se.enstorstarkreview.app", category: "EnStorStarkModel")

/// Static configuration shared by the app.
public enum AppConfiguration {
    /// The server origin. Image URLs and other paths from the API are relative to it.
    ///
    /// Development uses the local `make dev` server. The Android emulator reaches the
    /// host through 10.0.2.2.
    public static let serverOrigin: URL = {
        #if os(Android)
        return URL(string: "http://10.0.2.2:5173")!
        #else
        return URL(string: "http://localhost:5173")!
        #endif
    }()

    /// The base URL of the JSON API.
    public static var apiBaseURL: URL {
        serverOrigin.appendingPathComponent("api/v1")
    }
}
