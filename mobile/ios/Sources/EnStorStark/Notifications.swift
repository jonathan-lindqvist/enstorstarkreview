import Observation
import SwiftUI
import UIKit
import UserNotifications
import EnStorStarkModel

/// What the app delegate hears from APNs and notification taps, for `ContentView`.
/// It outlives an `AppModel`, which a debug server switch replaces.
@MainActor @Observable final class NotificationInbox {
    static let shared = NotificationInbox()

    /// The latest APNs device token.
    var deviceToken: Data?
    /// The review whose notification the user tapped, until `ContentView` opens it.
    var openedSlug: String?
    /// The launch was counted for the notification prompt.
    var launchCounted = false
}

/// The app delegate, installed by the Darwin host with `UIApplicationDelegateAdaptor`.
/// It receives the device token and shows and opens notifications.
public final class EnStorStarkAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set before launch finishes, so a tap that started the app is delivered.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    public func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationInbox.shared.deviceToken = deviceToken
    }

    public func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        logger.info("No APNs token: \(error.localizedDescription)")
    }

    /// New-review notifications also show while the app is open.
    public nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    /// A tap opens the review.
    public nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              let slug = PushPayload.slug(from: response.notification.request.content.userInfo) else { return }
        await MainActor.run { NotificationInbox.shared.openedSlug = slug }
    }
}

/// The system notification calls.
@MainActor final class LivePushSystem: PushSystem {
    func authorization() async -> PushAuthorization {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .authorized, .provisional, .ephemeral: .authorized
        case .denied: .denied
        case .notDetermined: .notDetermined
        @unknown default: .denied
        }
    }

    func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            logger.info("Notification permission failed: \(error.localizedDescription)")
            return false
        }
    }

    func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    func unregisterForRemoteNotifications() {
        UIApplication.shared.unregisterForRemoteNotifications()
    }
}

/// The setting in Om: a toggle, and a way to iOS Settings when iOS blocks notifications.
struct NotificationSettingCard: View {
    let push: PushNotificationsModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: Binding(get: { push.isOn }, set: setEnabled)) {
                HStack(spacing: 12) {
                    Image(systemName: "bell.badge.fill")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Theme.amber)
                        .frame(width: 36, height: 36)
                        .background(Theme.amber.opacity(0.14), in: Circle())
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Notiser om nya recensioner").font(Theme.body(16, .bold)).foregroundStyle(.white)
                        Text("Få en notis när vi publicerar en ny recension. Inget annat, och du kan stänga av när du vill.")
                            .font(Theme.body(13))
                            .foregroundStyle(Theme.secondary)
                    }
                }
            }
            .tint(Theme.amber)
            .accessibilityIdentifier("about.notifications")
            if push.isBlockedInSettings {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Notiser är avstängda för En Stor Stark i iOS-inställningarna.")
                        .font(Theme.body(13, .semibold))
                        .foregroundStyle(.white)
                    Button("Öppna Inställningar", action: openSettings)
                        .font(Theme.body(13, .bold))
                        .foregroundStyle(Theme.amber)
                }
                .padding(.leading, 48)
            }
        }
        .padding(16)
        .cardBackground(24)
    }

    func setEnabled(_ enabled: Bool) {
        Task { await push.setEnabled(enabled) }
    }

    func openSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
    }
}
