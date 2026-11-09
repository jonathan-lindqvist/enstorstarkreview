import CryptoKit
import Foundation
import Observation

/// The APNs environment that issued the device token. Debug builds are signed with the
/// development `aps-environment` and get sandbox tokens; TestFlight and App Store builds get
/// production tokens. The server must send to the same environment.
public enum APNsEnvironment: String, Codable, Sendable {
    case sandbox, production

    public static var current: APNsEnvironment {
        #if DEBUG
        return .sandbox
        #else
        return .production
        #endif
    }
}

/// The system's answer to the notification permission. Provisional and ephemeral
/// authorization count as authorized.
public enum PushAuthorization: Sendable, Equatable {
    case notDetermined, denied, authorized
}

/// What the user chose in the app. `undecided` means off, but the one-time prompt may ask.
public enum PushPreference: String, Sendable {
    case undecided, enabled, disabled
}

/// The operating system's notification calls, so the model can be tested without them.
@MainActor public protocol PushSystem: AnyObject {
    func authorization() async -> PushAuthorization
    /// Shows the system permission dialog the first time. Returns whether notifications are allowed.
    func requestAuthorization() async -> Bool
    /// Asks APNs for a device token. It arrives through the app delegate.
    func registerForRemoteNotifications()
    func unregisterForRemoteNotifications()
}

/// The device token as the API expects it.
public enum PushToken {
    /// Lowercase hexadecimal, two digits per byte.
    public static func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    /// SHA-256 of the hex token, to notice a new token without storing it.
    static func digest(_ token: String) -> String {
        SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

/// The custom keys of a new-review notification
/// (`{ "aps": { … }, "slug": "<review slug>" }`).
public enum PushPayload {
    /// Longer values are not slugs; the app ignores them.
    public static let maxSlugLength = 200

    /// The review to open, or nil when the payload has no usable slug.
    public static func slug(from userInfo: [AnyHashable: Any]) -> String? {
        guard let slug = userInfo["slug"] as? String,
              !slug.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              slug.count <= maxSlugLength else { return nil }
        return slug
    }
}

/// What the server knows about this device. The token is kept as a SHA-256 digest, so the
/// stored record can tell that the token changed without keeping the token itself.
struct PushDeviceIdentity: Codable, Equatable, Sendable {
    var tokenDigest: String
    /// The signed-in reviewer, or nil for an anonymous device.
    var username: String?
    var serverOrigin: String
    var environment: APNsEnvironment
}

/// The last registration that the server accepted.
struct PushRegistrationRecord: Codable, Equatable, Sendable {
    var identity: PushDeviceIdentity
    var date: Date
}

/// When to call `PUT /push-devices`.
enum PushRegistrationRule {
    /// The server forgets devices after 60 days; a weekly refresh keeps well inside that.
    static let refreshInterval: TimeInterval = 7 * 24 * 60 * 60

    /// Registers when the user turned notifications on, the system allows them, and a token
    /// is known (`identity` is nil without one), and only when something changed since the
    /// last success or that success is a week old.
    static func shouldRegister(
        isEnabled: Bool,
        authorization: PushAuthorization?,
        identity: PushDeviceIdentity?,
        last: PushRegistrationRecord?,
        now: Date
    ) -> Bool {
        guard isEnabled, authorization == .authorized, let identity else { return false }
        guard let last, last.identity == identity else { return true }
        let age = now.timeIntervalSince(last.date)
        return age >= refreshInterval || age < 0
    }
}

/// Notifications about newly published reviews: the setting in Om, the one-time prompt,
/// and the device registration with the server.
@MainActor @Observable public final class PushNotificationsModel {
    public private(set) var preference: PushPreference
    /// Nil until the system has answered.
    public private(set) var authorization: PushAuthorization?
    /// The prompt has been answered (either way) and never shows again.
    public private(set) var promptAnswered: Bool
    private(set) var launchCount: Int
    private(set) var hasViewedReview = false
    private(set) var deviceToken: String?

    @ObservationIgnored let api: APIClient
    @ObservationIgnored let system: PushSystem
    @ObservationIgnored let defaults: UserDefaults
    @ObservationIgnored let environment: APNsEnvironment
    @ObservationIgnored let now: () -> Date
    @ObservationIgnored let username: @MainActor () -> String?
    /// The latest registration pass. Passes run one after another.
    @ObservationIgnored private(set) var refreshTask: Task<Void, Never>?

    static let preferenceKey = "push.preference"
    static let promptAnsweredKey = "push.promptAnswered"
    static let launchCountKey = "push.launchCount"
    static let registrationKey = "push.lastRegistration"

    init(
        api: APIClient,
        system: PushSystem,
        defaults: UserDefaults = .standard,
        environment: APNsEnvironment = .current,
        now: @escaping () -> Date = Date.init,
        username: @escaping @MainActor () -> String?
    ) {
        self.api = api
        self.system = system
        self.defaults = defaults
        self.environment = environment
        self.now = now
        self.username = username
        preference = defaults.string(forKey: Self.preferenceKey).flatMap(PushPreference.init) ?? .undecided
        promptAnswered = defaults.bool(forKey: Self.promptAnsweredKey)
        launchCount = defaults.integer(forKey: Self.launchCountKey)
    }

    /// The toggle in Om: on when the user chose it and iOS does not block it.
    public var isOn: Bool { preference == .enabled && authorization != .denied }

    /// The user wants notifications, but they are turned off for the app in iOS Settings.
    public var isBlockedInSettings: Bool { preference == .enabled && authorization == .denied }

    /// Ask once, after the second launch or after the first review the user has read, unless
    /// the user already chose in Om or iOS already blocks notifications.
    public var shouldShowPrompt: Bool {
        guard preference == .undecided, !promptAnswered else { return false }
        guard let authorization, authorization != .denied else { return false }
        return launchCount >= 2 || hasViewedReview
    }

    // MARK: Lifecycle

    /// Counts a launch for the prompt. Call once per app start.
    public func noteLaunch() {
        launchCount += 1
        defaults.set(launchCount, forKey: Self.launchCountKey)
    }

    /// The user has read a review; the prompt may follow.
    public func noteReviewViewed() {
        hasViewedReview = true
    }

    /// Reads the permission and, when notifications are on, asks APNs for the token and
    /// registers. Call at launch and when the app returns to the foreground.
    public func start() async {
        authorization = await system.authorization()
        if preference == .enabled, authorization == .authorized {
            system.registerForRemoteNotifications()
        }
        await refresh()
    }

    /// From the app delegate. The token is never logged.
    public func didReceive(deviceToken data: Data) async {
        deviceToken = PushToken.hex(data)
        await refresh()
    }

    // MARK: User choices

    /// The toggle in Om. On asks for the permission and registers; off removes the device
    /// from the server and stops.
    public func setEnabled(_ enabled: Bool) async {
        if enabled {
            setPreference(.enabled)
            let granted = await system.requestAuthorization()
            authorization = granted ? .authorized : await system.authorization()
            guard granted else { return }
            system.registerForRemoteNotifications()
            await refresh()
        } else {
            setPreference(.disabled)
            // Let a running registration finish first, so it cannot store a record afterwards.
            await refreshTask?.value
            defaults.removeObject(forKey: Self.registrationKey)
            if let deviceToken {
                do {
                    try await api.unregisterPushDevice(token: deviceToken)
                } catch {
                    logger.info("Could not remove the device from notifications: \(error)")
                }
            }
            system.unregisterForRemoteNotifications()
        }
    }

    public func answerPrompt(accept: Bool) async {
        promptAnswered = true
        defaults.set(true, forKey: Self.promptAnsweredKey)
        if accept { await setEnabled(true) }
    }

    private func setPreference(_ value: PushPreference) {
        preference = value
        defaults.set(value.rawValue, forKey: Self.preferenceKey)
    }

    // MARK: Registration

    /// Registers again if the rule says so. Call after a sign-in or sign-out. Passes run one
    /// after another, and each reads the state when it starts.
    @discardableResult public func scheduleRefresh() -> Task<Void, Never> {
        let previous = refreshTask
        let task = Task { [weak self] in
            await previous?.value
            await self?.registerIfNeeded()
        }
        refreshTask = task
        return task
    }

    private func registerIfNeeded() async {
        let identity = deviceToken.map {
            PushDeviceIdentity(tokenDigest: PushToken.digest($0), username: username(),
                               serverOrigin: api.serverOrigin.absoluteString, environment: environment)
        }
        guard let token = deviceToken, let identity, PushRegistrationRule.shouldRegister(
            isEnabled: preference == .enabled, authorization: authorization, identity: identity,
            last: lastRegistration, now: now()
        ) else { return }
        do {
            // The client sends the bearer token when the reviewer is signed in.
            try await api.registerPushDevice(token: token, environment: environment)
            // A sign-out while the request ran schedules another pass, which compares again.
            guard preference == .enabled else { return }
            let record = PushRegistrationRecord(identity: identity, date: now())
            defaults.set(try JSONEncoder().encode(record), forKey: Self.registrationKey)
        } catch {
            // 401 already returned the app to reader mode, which schedules an anonymous pass.
            // Other failures keep the old record, so the next launch tries again.
            logger.info("Notification registration failed: \(error)")
        }
    }

    public func refresh() async {
        await scheduleRefresh().value
    }

    var lastRegistration: PushRegistrationRecord? {
        guard let data = defaults.data(forKey: Self.registrationKey) else { return nil }
        return try? JSONDecoder().decode(PushRegistrationRecord.self, from: data)
    }
}
