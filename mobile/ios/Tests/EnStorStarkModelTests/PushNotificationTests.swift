import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import EnStorStarkModel

/// The notification calls of the operating system, answered from the test.
@MainActor final class FakePushSystem: PushSystem {
    var status = PushAuthorization.notDetermined
    /// What the permission dialog answers.
    var grants = true
    private(set) var permissionRequests = 0
    private(set) var registerCalls = 0
    private(set) var unregisterCalls = 0

    func authorization() async -> PushAuthorization { status }

    func requestAuthorization() async -> Bool {
        permissionRequests += 1
        if status == .notDetermined { status = grants ? .authorized : .denied }
        return status == .authorized
    }

    func registerForRemoteNotifications() { registerCalls += 1 }
    func unregisterForRemoteNotifications() { unregisterCalls += 1 }
}

/// 32 bytes, like an APNs device token.
let apnsTokenData = Data((0..<32).map { UInt8($0 * 7 % 256) })
let apnsTokenHex = "00070e151c232a31383f464d545b626970777e858c939aa1a8afb6bdc4cbd2d9"

@MainActor struct PushHarness {
    let transport = FakeTransport()
    let system = FakePushSystem()
    let defaults: UserDefaults
    let credentials = CredentialStore(storage: MemoryStorage())
    let clock = TestClock()

    final class TestClock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    init(signedInAs username: String? = nil) {
        defaults = UserDefaults(suiteName: "push-tests-\(UUID().uuidString)")!
        if let username { credentials.save(.init(username: username, token: "secret-session")) }
        transport.respond(to: "registerPushDevice", with: FakeResponse(status: .noContent))
        transport.respond(to: "unregisterPushDevice", with: FakeResponse(status: .noContent))
    }

    func model(environment: APNsEnvironment = .sandbox, username: String? = nil, api: APIClient? = nil) -> PushNotificationsModel {
        let clock = clock
        let api = api ?? .fake(transport)
        return PushNotificationsModel(api: api, system: system, defaults: defaults, environment: environment,
                                      now: { clock.now }) { username }
    }

    func app() -> AppModel {
        AppModel(api: .fake(transport), credentials: credentials, pushSystem: system, defaults: defaults)
    }

    var registrations: [SentRequest] { transport.sent("registerPushDevice") }
}

// MARK: Requests

@MainActor @Suite struct PushDeviceRequestTests {
    let harness = PushHarness()

    @Test func deviceTokenIsLowercaseHex() {
        #expect(PushToken.hex(apnsTokenData) == apnsTokenHex)
        #expect(PushToken.hex(Data([0xAB, 0x01])) == "ab01")
    }

    @Test func registerSendsPlatformHexTokenAndSandboxWithoutBearerWhenSignedOut() async throws {
        try await APIClient.fake(harness.transport).registerPushDevice(token: apnsTokenHex, environment: .sandbox)
        let sent = try #require(harness.registrations.first)
        #expect(sent.request.method == .put)
        #expect(sent.request.path == "/push-devices")
        #expect(sent.request.headerFields[.authorization] == nil)
        #expect(sent.request.headerFields[.contentType]?.hasPrefix("application/json") == true)
        let json = try #require(sent.json)
        #expect(json["platform"] as? String == "ios")
        #expect(json["token"] as? String == apnsTokenHex)
        #expect(json["apnsEnvironment"] as? String == "sandbox")
        #expect(json.count == 3)
    }

    @Test func registerSendsTheBearerWhenSignedIn() async throws {
        let api = APIClient.fake(harness.transport)
        api.token = "secret-session"
        try await api.registerPushDevice(token: apnsTokenHex, environment: .production)
        let sent = try #require(harness.registrations.first)
        #expect(sent.request.headerFields[.authorization] == "Bearer secret-session")
        #expect(sent.json?["apnsEnvironment"] as? String == "production")
    }

    @Test func removalSendsOnlyTheTokenAndNeverTheBearer() async throws {
        let api = APIClient.fake(harness.transport)
        api.token = "secret-session"
        try await api.unregisterPushDevice(token: apnsTokenHex)
        let sent = try #require(harness.transport.sent("unregisterPushDevice").first)
        #expect(sent.request.method == .post)
        #expect(sent.request.path == "/push-devices/removal")
        #expect(sent.request.headerFields[.authorization] == nil)
        let json = try #require(sent.json)
        #expect(json["token"] as? String == apnsTokenHex)
        #expect(json.count == 1)
    }

    @Test func registrationErrorsThrowTheProblem() async throws {
        harness.transport.respond(to: "registerPushDevice", with: .problem(status: .tooManyRequests, code: "rate_limited"))
        await #expect(throws: APIError.self) {
            try await APIClient.fake(harness.transport).registerPushDevice(token: apnsTokenHex, environment: .sandbox)
        }
    }
}

// MARK: When to register

@Suite struct PushRegistrationRuleTests {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let identity = PushDeviceIdentity(tokenDigest: "abc", username: nil, serverOrigin: "https://enstorstark.se",
                                      environment: .production)

    func record(_ identity: PushDeviceIdentity, daysAgo: Double) -> PushRegistrationRecord {
        PushRegistrationRecord(identity: identity, date: now.addingTimeInterval(-daysAgo * 24 * 60 * 60))
    }

    func should(enabled: Bool = true, _ authorization: PushAuthorization? = .authorized,
                identity: PushDeviceIdentity?, last: PushRegistrationRecord?) -> Bool {
        PushRegistrationRule.shouldRegister(isEnabled: enabled, authorization: authorization, identity: identity,
                                            last: last, now: now)
    }

    @Test func registersTheFirstTime() {
        #expect(should(identity: identity, last: nil))
    }

    @Test func doesNotRegisterWhenTurnedOff() {
        #expect(!should(enabled: false, identity: identity, last: nil))
    }

    @Test func doesNotRegisterWithoutPermission() {
        #expect(!should(.denied, identity: identity, last: nil))
        #expect(!should(.notDetermined, identity: identity, last: nil))
        #expect(!should(nil, identity: identity, last: nil))
    }

    @Test func doesNotRegisterWithoutAToken() {
        #expect(!should(identity: nil, last: nil))
    }

    @Test func skipsWhenNothingChangedWithinSevenDays() {
        #expect(!should(identity: identity, last: record(identity, daysAgo: 0)))
        #expect(!should(identity: identity, last: record(identity, daysAgo: 6.9)))
    }

    @Test func registersAgainAfterSevenDays() {
        #expect(should(identity: identity, last: record(identity, daysAgo: 7)))
    }

    @Test func registersAgainWhenTheTokenChanges() {
        var changed = identity
        changed.tokenDigest = "def"
        #expect(should(identity: changed, last: record(identity, daysAgo: 1)))
    }

    @Test func registersAgainWhenTheUserChanges() {
        var signedIn = identity
        signedIn.username = "test"
        #expect(should(identity: signedIn, last: record(identity, daysAgo: 1)))
        #expect(should(identity: identity, last: record(signedIn, daysAgo: 1)))
    }

    @Test func registersAgainWhenTheServerChanges() {
        var other = identity
        other.serverOrigin = "http://localhost:5173"
        #expect(should(identity: other, last: record(identity, daysAgo: 1)))
    }

    @Test func registersAgainWhenTheEnvironmentChanges() {
        var sandbox = identity
        sandbox.environment = .sandbox
        #expect(should(identity: sandbox, last: record(identity, daysAgo: 1)))
    }

    /// A clock that went backwards must not stop refreshes forever.
    @Test func registersAgainWhenTheLastSuccessIsInTheFuture() {
        #expect(should(identity: identity, last: record(identity, daysAgo: -30)))
    }
}

// MARK: Model

@MainActor @Suite struct PushNotificationsModelTests {
    let harness = PushHarness()

    @Test func turningOnAsksPermissionAndRegisters() async throws {
        let model = harness.model()
        await model.start()
        await model.setEnabled(true)
        #expect(harness.system.permissionRequests == 1)
        #expect(harness.system.registerCalls == 1)
        #expect(model.isOn)
        await model.didReceive(deviceToken: apnsTokenData)
        #expect(harness.registrations.count == 1)
        #expect(harness.registrations.first?.json?["token"] as? String == apnsTokenHex)
        #expect(harness.defaults.string(forKey: PushNotificationsModel.preferenceKey) == "enabled")
    }

    @Test func deniedPermissionShowsTheSettingsHintAndSendsNothing() async throws {
        harness.system.grants = false
        let model = harness.model()
        await model.start()
        await model.setEnabled(true)
        await model.didReceive(deviceToken: apnsTokenData)
        #expect(model.isOn == false)
        #expect(model.isBlockedInSettings)
        #expect(harness.system.registerCalls == 0)
        #expect(harness.registrations.isEmpty)
    }

    @Test func nothingIsSentBeforeTheUserTurnsItOn() async {
        harness.system.status = .authorized
        let model = harness.model()
        await model.start()
        await model.didReceive(deviceToken: apnsTokenData)
        #expect(harness.system.registerCalls == 0)
        #expect(harness.registrations.isEmpty)
    }

    @Test func aSuccessfulRegistrationIsNotRepeated() async throws {
        harness.system.status = .authorized
        let model = harness.model()
        await model.setEnabled(true)
        await model.didReceive(deviceToken: apnsTokenData)
        await model.refresh()
        // A new launch with the same token.
        let relaunched = harness.model()
        await relaunched.start()
        await relaunched.didReceive(deviceToken: apnsTokenData)
        #expect(harness.registrations.count == 1)
    }

    @Test func aWeekLaterTheLaunchRegistersAgain() async throws {
        harness.system.status = .authorized
        let first = harness.model()
        await first.setEnabled(true)
        await first.didReceive(deviceToken: apnsTokenData)
        #expect(harness.registrations.count == 1)
        harness.clock.now += 7 * 24 * 60 * 60
        let relaunched = harness.model()
        await relaunched.start()
        await relaunched.didReceive(deviceToken: apnsTokenData)
        #expect(harness.registrations.count == 2)
    }

    @Test func launchAsksAPNsForTheTokenWhenOnAndAllowed() async {
        harness.system.status = .authorized
        harness.defaults.set("enabled", forKey: PushNotificationsModel.preferenceKey)
        await harness.model().start()
        #expect(harness.system.registerCalls == 1)
    }

    @Test func theStoredRegistrationHoldsNoRawToken() async throws {
        harness.system.status = .authorized
        let model = harness.model()
        await model.setEnabled(true)
        await model.didReceive(deviceToken: apnsTokenData)
        let stored = try #require(harness.defaults.data(forKey: PushNotificationsModel.registrationKey))
        #expect(String(decoding: stored, as: UTF8.self).contains(apnsTokenHex) == false)
        #expect(model.lastRegistration?.identity.environment == .sandbox)
    }

    @Test(arguments: [
        FakeResponse.problem(status: .tooManyRequests, code: "rate_limited"),
        FakeResponse.problem(status: .serviceUnavailable, code: "service_unavailable"),
        FakeResponse.problem(status: .unprocessableContent, code: "validation_failed"),
        FakeResponse(status: .internalServerError)
    ])
    func aFailedRegistrationLeavesTheStateAndRetries(_ failure: FakeResponse) async throws {
        harness.system.status = .authorized
        harness.transport.respond(to: "registerPushDevice", with: failure)
        let model = harness.model()
        await model.setEnabled(true)
        await model.didReceive(deviceToken: apnsTokenData)
        #expect(harness.registrations.count == 1)
        #expect(model.lastRegistration == nil)
        harness.transport.respond(to: "registerPushDevice", with: FakeResponse(status: .noContent))
        await model.refresh()
        #expect(harness.registrations.count == 2)
        #expect(model.lastRegistration != nil)
    }

    @Test func aNetworkFailureLeavesTheState() async throws {
        harness.system.status = .authorized
        let model = harness.model(api: .fake(FailingTransport()))
        await model.setEnabled(true)
        await model.didReceive(deviceToken: apnsTokenData)
        #expect(model.lastRegistration == nil)
    }

    @Test func turningOffRemovesTheDeviceAndStops() async throws {
        harness.system.status = .authorized
        let model = harness.model()
        await model.setEnabled(true)
        await model.didReceive(deviceToken: apnsTokenData)
        await model.setEnabled(false)
        let removal = try #require(harness.transport.sent("unregisterPushDevice").first)
        #expect(removal.json?["token"] as? String == apnsTokenHex)
        #expect(harness.system.unregisterCalls == 1)
        #expect(model.isOn == false)
        #expect(model.lastRegistration == nil)
        await model.refresh()
        await model.didReceive(deviceToken: apnsTokenData)
        #expect(harness.registrations.count == 1)
    }

    @Test func aSignedInDeviceRegistersWithTheUser() async throws {
        harness.system.status = .authorized
        let model = harness.model(username: "test")
        await model.setEnabled(true)
        await model.didReceive(deviceToken: apnsTokenData)
        #expect(model.lastRegistration?.identity.username == "test")
    }
}

// MARK: Sessions

@MainActor @Suite struct PushSessionTests {
    func enabledApp(_ harness: PushHarness) async -> AppModel {
        harness.system.status = .authorized
        let app = harness.app()
        await app.push.setEnabled(true)
        await app.push.didReceive(deviceToken: apnsTokenData)
        return app
    }

    @Test func signOutRegistersAgainAnonymously() async throws {
        let harness = PushHarness(signedInAs: "test")
        let app = await enabledApp(harness)
        #expect(harness.registrations.last?.request.headerFields[.authorization] == "Bearer secret-session")
        await app.session.signOut()
        await app.push.refreshTask?.value
        #expect(harness.registrations.count == 2)
        #expect(harness.registrations.last?.request.headerFields[.authorization] == nil)
        #expect(app.push.lastRegistration?.identity.username == nil)
    }

    @Test func signInRegistersAgainWithTheBearer() async throws {
        let harness = PushHarness()
        let app = await enabledApp(harness)
        harness.transport.respond(to: "createSession", with: .json(Fixture.json([
            "user": ["username": "test"], "expiresAt": "2030-01-01T00:00:00.000Z", "token": "new-session"
        ]), status: .created))
        #expect(await app.session.signIn(username: "test", password: "testpass123"))
        await app.push.refreshTask?.value
        #expect(harness.registrations.count == 2)
        #expect(harness.registrations.last?.request.headerFields[.authorization] == "Bearer new-session")
        #expect(app.push.lastRegistration?.identity.username == "test")
    }

    /// The app's 401 handling signs out; the device then registers anonymously.
    @Test func aRejectedSessionSignsOutAndRegistersAnonymously() async throws {
        let harness = PushHarness(signedInAs: "test")
        harness.transport.respond(to: "registerPushDevice", with: .problem(status: .unauthorized, code: "unauthorized"))
        harness.system.status = .authorized
        let app = harness.app()
        await app.push.setEnabled(true)
        await app.push.didReceive(deviceToken: apnsTokenData)
        #expect(app.push.lastRegistration == nil)
        harness.transport.respond(to: "registerPushDevice", with: FakeResponse(status: .noContent))
        // The unauthorized handler hops to the main actor.
        for _ in 0..<10_000 where app.session.isSignedIn { await Task.yield() }
        #expect(app.session.isSignedIn == false)
        await app.push.refreshTask?.value
        #expect(harness.registrations.count == 2)
        #expect(harness.registrations.last?.request.headerFields[.authorization] == nil)
        #expect(app.push.lastRegistration?.identity.username == nil)
    }
}

// MARK: Opening a notification

@Suite struct PushPayloadTests {
    @Test func readsTheSlug() {
        let userInfo: [AnyHashable: Any] = [
            "aps": ["alert": ["title": "Ny recension", "body": "Majornas bryggeri"], "thread-id": "new-reviews"],
            "slug": "majornas-bryggeri"
        ]
        #expect(PushPayload.slug(from: userInfo) == "majornas-bryggeri")
    }

    @Test func ignoresAMissingSlug() {
        #expect(PushPayload.slug(from: ["aps": [:]]) == nil)
    }

    @Test func ignoresANonStringSlug() {
        #expect(PushPayload.slug(from: ["slug": 42]) == nil)
        #expect(PushPayload.slug(from: ["slug": ["majornas-bryggeri"]]) == nil)
    }

    @Test func ignoresAnEmptySlug() {
        #expect(PushPayload.slug(from: ["slug": ""]) == nil)
        #expect(PushPayload.slug(from: ["slug": "   "]) == nil)
    }

    @Test func ignoresAnOverlongSlug() {
        #expect(PushPayload.slug(from: ["slug": String(repeating: "a", count: 201)]) == nil)
        #expect(PushPayload.slug(from: ["slug": String(repeating: "a", count: 200)]) == String(repeating: "a", count: 200))
    }
}

// MARK: The one-time prompt

@MainActor @Suite struct PushPromptTests {
    let harness = PushHarness()

    func launched(times: Int) async -> PushNotificationsModel {
        var model = harness.model()
        for _ in 0..<times {
            model = harness.model()
            model.noteLaunch()
            await model.start()
        }
        return model
    }

    @Test func notOnTheFirstLaunch() async {
        #expect(await launched(times: 1).shouldShowPrompt == false)
    }

    @Test func onTheSecondLaunch() async {
        #expect(await launched(times: 2).shouldShowPrompt)
    }

    @Test func afterTheFirstReviewWasRead() async {
        let model = await launched(times: 1)
        model.noteReviewViewed()
        #expect(model.shouldShowPrompt)
    }

    @Test func notBeforeThePermissionIsKnown() {
        let model = harness.model()
        model.noteLaunch()
        model.noteLaunch()
        #expect(model.shouldShowPrompt == false)
    }

    @Test func neverAgainAfterNotNow() async {
        let model = await launched(times: 2)
        await model.answerPrompt(accept: false)
        #expect(model.shouldShowPrompt == false)
        #expect(model.isOn == false)
        #expect(harness.system.permissionRequests == 0)
        #expect(await launched(times: 3).shouldShowPrompt == false)
    }

    @Test func yesPleaseTurnsNotificationsOnAndNeverAsksAgain() async {
        let model = await launched(times: 2)
        await model.answerPrompt(accept: true)
        #expect(harness.system.permissionRequests == 1)
        #expect(model.isOn)
        #expect(model.shouldShowPrompt == false)
        #expect(await launched(times: 3).shouldShowPrompt == false)
    }

    @Test func notWhenTheUserAlreadyChoseInOm() async {
        let model = await launched(times: 1)
        await model.setEnabled(false)
        model.noteReviewViewed()
        #expect(model.shouldShowPrompt == false)
        #expect(await launched(times: 3).shouldShowPrompt == false)
    }

    @Test func notWhenIOSAlreadyBlocksNotifications() async {
        harness.system.status = .denied
        #expect(await launched(times: 2).shouldShowPrompt == false)
    }
}

/// A transport without a network.
final class FailingTransport: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        throw URLError(.notConnectedToInternet)
    }
}
