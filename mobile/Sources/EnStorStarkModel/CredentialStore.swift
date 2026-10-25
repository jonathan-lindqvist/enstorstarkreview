import Foundation
import Security

/// The saved sign-in, in the Keychain.
///
/// The items use the attributes that skip-keychain used (generic password, account = key, no
/// service, accessible when unlocked), so a session saved by the Skip build is still found.
struct CredentialStore: Sendable {
    struct Credentials: Sendable, Equatable {
        var username: String
        var token: String
    }

    static let tokenKey = "session.token"
    static let usernameKey = "session.username"

    var storage: any SecureStorage = Keychain()

    func load() -> Credentials? {
        do {
            guard let token = try storage.string(forKey: Self.tokenKey),
                  let username = try storage.string(forKey: Self.usernameKey) else {
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
            try storage.set(credentials.token, forKey: Self.tokenKey)
            try storage.set(credentials.username, forKey: Self.usernameKey)
        } catch {
            logger.error("Could not save the session: \(error)")
        }
    }

    func clear() {
        do {
            try storage.removeValue(forKey: Self.tokenKey)
            try storage.removeValue(forKey: Self.usernameKey)
        } catch {
            logger.error("Could not remove the saved session: \(error)")
        }
    }
}

/// String storage for secrets.
protocol SecureStorage: Sendable {
    func string(forKey key: String) throws -> String?
    func set(_ value: String, forKey key: String) throws
    func removeValue(forKey key: String) throws
}

struct KeychainError: Error, CustomStringConvertible {
    let status: OSStatus
    var description: String { "Keychain error \(status)" }
}

/// Generic passwords in the app's Keychain.
struct Keychain: SecureStorage {
    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key]
    }

    func string(forKey key: String) throws -> String? {
        var request = query(key)
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        request[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func set(_ value: String, forKey key: String) throws {
        try removeValue(forKey: key)
        var item = query(key)
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    func removeValue(forKey key: String) throws {
        let status = SecItemDelete(query(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
    }
}
