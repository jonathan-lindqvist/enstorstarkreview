import Foundation
import Observation
import SkipFuse

/// Reader mode or reviewer mode. The server still does all authorization; this only decides
/// which controls the app shows and whether it sends a token.
@MainActor @Observable public final class SessionModel {
    /// The signed-in reviewer, or nil in reader mode.
    public private(set) var username: String?
    public private(set) var isSigningIn = false
    /// A Swedish message for the login form.
    public private(set) var errorMessage: String?

    public var isSignedIn: Bool { username != nil }

    /// Called after a sign-in, a sign-out, or an expired token.
    var onChange: (() -> Void)?

    private let api: APIClient
    private let store: CredentialStore

    init(api: APIClient, store: CredentialStore = CredentialStore()) {
        self.api = api
        self.store = store
        // Set the token before the first request, so the first list already has drafts.
        if let saved = store.load() {
            api.token = saved.token
            username = saved.username
        }
        api.setUnauthorizedHandler { [weak self] in
            Task { @MainActor in self?.expire() }
        }
    }

    /// Checks a saved token with the server. A 401 expires it (see `APIClient`). On a network
    /// error the app stays in reviewer mode, so it also works with a bad connection.
    public func validate() async {
        guard api.token != nil else { return }
        do {
            let name = try await api.currentUsername()
            if name != username, let token = api.token {
                username = name
                store.save(.init(username: name, token: token))
            }
        } catch {
            logger.info("Session check failed: \(error)")
        }
    }

    public func signIn(username: String, password: String) async -> Bool {
        isSigningIn = true
        defer { isSigningIn = false }
        errorMessage = nil
        do {
            let session = try await api.signIn(
                username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            api.token = session.token
            store.save(.init(username: session.username, token: session.token))
            self.username = session.username
            onChange?()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    public func signOut() async {
        guard isSignedIn else { return }
        // Invalidate the token on the server, but sign out locally also when that fails.
        try? await api.signOut()
        clearLocalSession()
    }

    public func clearError() {
        errorMessage = nil
    }

    private func expire() {
        guard isSignedIn else { return }
        logger.info("The server rejected the token; changing to reader mode")
        clearLocalSession()
    }

    private func clearLocalSession() {
        api.token = nil
        store.clear()
        username = nil
        onChange?()
    }
}
