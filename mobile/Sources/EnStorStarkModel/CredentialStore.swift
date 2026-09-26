import Foundation
import SkipKeychain

/// The saved sign-in: the Keychain on iOS, EncryptedSharedPreferences on Android.
struct CredentialStore: Sendable {
    struct Credentials: Sendable {
        var username: String
        var token: String
    }

    private static let tokenKey = "session.token"
    private static let usernameKey = "session.username"

    func load() -> Credentials? {
        do {
            guard let token = try Keychain.shared.string(forKey: Self.tokenKey),
                  let username = try Keychain.shared.string(forKey: Self.usernameKey) else {
                return nil
            }
            return Credentials(username: username, token: token)
        } catch {
            logger.error("Could not read the saved session: \(error)")
            return nil
        }
    }

    func save(_ credentials: Credentials) {
        do {
            try Keychain.shared.set(credentials.token, forKey: Self.tokenKey)
            try Keychain.shared.set(credentials.username, forKey: Self.usernameKey)
        } catch {
            logger.error("Could not save the session: \(error)")
        }
    }

    func clear() {
        do {
            try Keychain.shared.removeValue(forKey: Self.tokenKey)
            try Keychain.shared.removeValue(forKey: Self.usernameKey)
        } catch {
            logger.error("Could not remove the saved session: \(error)")
        }
    }
}
