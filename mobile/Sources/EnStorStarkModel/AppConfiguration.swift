import Foundation
import SkipFuse

/// A logger for the EnStorStarkModel module.
let logger: Logger = Logger(subsystem: "se.enstorstarkreview.app", category: "EnStorStarkModel")

/// Static configuration shared by the app.
public enum AppConfiguration {
    /// The production server. Release builds always use it.
    public static let productionOrigin = URL(string: "https://enstorstarkreview.se")!

    /// The local `make dev` server. The Android emulator reaches the host through 10.0.2.2.
    public static let localOrigin: URL = {
        #if os(Android)
        return URL(string: "http://10.0.2.2:5173")!
        #else
        return URL(string: "http://localhost:5173")!
        #endif
    }()

    /// The server origin. Image URLs and other paths from the API are relative to it.
    ///
    /// Release builds use production. Debug builds use the origin chosen in the server menu,
    /// or the `-debugServerOrigin <url>` launch argument, else the local server.
    public static var serverOrigin: URL {
        #if DEBUG
        if let saved = UserDefaults.standard.string(forKey: debugServerOriginKey),
           let origin = normalizedOrigin(saved) {
            return origin
        }
        return localOrigin
        #else
        return productionOrigin
        #endif
    }

    /// The base URL of the JSON API.
    public static var apiBaseURL: URL {
        serverOrigin.appendingPathComponent("api/v1")
    }

    /// Reduces user input such as `abc.ngrok-free.app/` to an origin like
    /// `https://abc.ngrok-free.app`. Returns nil for input that is not an HTTP(S) origin.
    public static func normalizedOrigin(_ input: String) -> URL? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") {
            text = "https://" + text
        }
        guard let components = URLComponents(string: text),
              let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = components.host, !host.isEmpty else {
            return nil
        }
        var origin = URLComponents()
        origin.scheme = scheme
        origin.host = host
        origin.port = components.port
        return origin.url
    }

    #if DEBUG
    private static let debugServerOriginKey = "debugServerOrigin"

    /// Saves the server for later launches. Nil returns to the local server.
    /// A `-debugServerOrigin` launch argument still has priority over the saved value.
    public static func setDebugServerOrigin(_ origin: URL?) {
        if let origin {
            UserDefaults.standard.set(origin.absoluteString, forKey: debugServerOriginKey)
        } else {
            UserDefaults.standard.removeObject(forKey: debugServerOriginKey)
        }
    }
    #endif
}
