import Foundation
import Synchronization
import Testing
@testable import EnStorStarkModel

/// In-memory secure storage for tests.
final class MemoryStorage: SecureStorage {
    let values = Mutex<[String: String]>([:])
    func string(forKey key: String) throws -> String? { values.withLock { $0[key] } }
    func set(_ value: String, forKey key: String) throws { values.withLock { $0[key] = value } }
    func removeValue(forKey key: String) throws { _ = values.withLock { $0.removeValue(forKey: key) } }
}

@Suite struct CredentialStoreTests {
    @Test func savedCredentialsLoadAgain() {
        let store = CredentialStore(storage: MemoryStorage())
        store.save(.init(username: "test", token: "secret"))
        #expect(store.load() == .init(username: "test", token: "secret"))
    }

    @Test func aTokenWithoutUsernameIsNoSession() throws {
        let storage = MemoryStorage()
        try storage.set("secret", forKey: CredentialStore.tokenKey)
        #expect(CredentialStore(storage: storage).load() == nil)
    }

    @Test func clearRemovesTokenAndUsername() {
        let storage = MemoryStorage()
        let store = CredentialStore(storage: storage)
        store.save(.init(username: "test", token: "secret"))
        store.clear()
        #expect(storage.values.withLock { $0.isEmpty })
    }
}

