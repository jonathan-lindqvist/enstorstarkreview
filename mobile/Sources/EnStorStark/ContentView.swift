import SwiftUI
#if os(iOS)
import Combine
#endif
import EnStorStarkModel

enum ContentTab: String, Hashable {
    case reviews, map, statistics, about
}

/// Navigation targets that every tab can push.
enum Route: Hashable {
    /// `preview` is the list item, so the detail can show at once while it reloads.
    case review(slug: String, preview: Review?)
    case history(slug: String, title: String)
}

struct ContentView: View {
    @AppStorage("selectedTab") var tab = ContentTab.reviews
    @State var app = AppModel()
    @State var reviewsPath: [Route] = []
    @State var isShowingServerPicker = false

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $reviewsPath) {
                ReviewListView(model: app.reviewList) { created in
                    reviewsPath.append(.review(slug: created.slug, preview: created))
                }
                    .navigationTitle("Recensioner")
                    .routeDestinations()
            }
            .tabItem { Label("Recensioner", systemImage: "list.bullet") }
            .tag(ContentTab.reviews)

            NavigationStack {
                ReviewMapView()
                    .navigationTitle("Karta")
                    .routeDestinations()
            }
            .tabItem { Label("Karta", systemImage: Symbol.map) }
            .tag(ContentTab.map)

            NavigationStack {
                StatisticsView()
                    .navigationTitle("Statistik")
                    .routeDestinations()
            }
            .tabItem { Label("Statistik", systemImage: Symbol.statistics) }
            .tag(ContentTab.statistics)

            NavigationStack {
                AboutView(request: app.reviewRequest, showServerPicker: { isShowingServerPicker = true })
                    .navigationTitle("Om")
            }
            .tabItem { Label("Om", systemImage: "info.circle") }
            .tag(ContentTab.about)
        }
        // A new server gets a new AppModel; the new identity reloads every screen.
        .id(app.api.serverOrigin)
        .environment(app)
        .task { await app.session.validate() }
        #if DEBUG
        .task {
            await debugSignIn()
            openDebugRoute()
        }
        .sheet(isPresented: $isShowingServerPicker) {
            ServerPickerView(current: app.api.serverOrigin) { origin in
                Task { await useServer(origin) }
            }
        }
        #if os(iOS)
        .onReceive(NotificationCenter.default.publisher(for: .deviceDidShake)) { _ in
            isShowingServerPicker = true
        }
        #endif
        #endif
    }

    #if DEBUG
    /// Changes the server. The token belongs to the old server, so sign out there first.
    func useServer(_ origin: URL) async {
        await app.session.signOut()
        AppConfiguration.setDebugServerOrigin(origin)
        reviewsPath = []
        app = AppModel()
    }

    /// Signs in from a launch argument, for simulator checks: `-debugSignIn user:password`.
    /// `-debugSignIn out` signs out.
    func debugSignIn() async {
        guard let value = UserDefaults.standard.string(forKey: "debugSignIn") else { return }
        if value == "out" {
            await app.session.signOut()
        } else if let separator = value.firstIndex(of: ":") {
            _ = await app.session.signIn(
                username: String(value[..<separator]),
                password: String(value[value.index(after: separator)...])
            )
        }
    }

    /// Opens a screen from a launch argument, for simulator checks without taps:
    /// `-debugRoute review:<slug>` or `-debugRoute history:<slug>`.
    func openDebugRoute() {
        guard let value = UserDefaults.standard.string(forKey: "debugRoute"),
              let separator = value.firstIndex(of: ":") else { return }
        let kind = value[..<separator]
        let slug = String(value[value.index(after: separator)...])
        tab = .reviews
        switch kind {
        case "review": reviewsPath = [.review(slug: slug, preview: nil)]
        case "history": reviewsPath = [.review(slug: slug, preview: nil), .history(slug: slug, title: slug)]
        default: break
        }
    }
    #endif
}

extension View {
    func routeDestinations() -> some View {
        navigationDestination(for: Route.self) { route in
            RouteView(route: route)
        }
    }
}

struct RouteView: View {
    let route: Route
    @Environment(AppModel.self) var app

    var body: some View {
        switch route {
        case .review(let slug, let preview):
            ReviewDetailView(model: app.reviewDetail(slug: slug, preview: preview))
        case .history(let slug, let title):
            ReviewHistoryView(title: title, loader: app.historyLoader(slug: slug))
        }
    }
}
