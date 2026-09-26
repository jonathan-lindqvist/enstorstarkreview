import SwiftUI
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

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $reviewsPath) {
                ReviewListView(model: app.reviewList)
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
            .tabItem { Label("Karta", systemImage: "map") }
            .tag(ContentTab.map)

            NavigationStack {
                StatisticsView()
                    .navigationTitle("Statistik")
                    .routeDestinations()
            }
            .tabItem { Label("Statistik", systemImage: "chart.bar") }
            .tag(ContentTab.statistics)

            NavigationStack {
                AboutView(request: app.reviewRequest)
                    .navigationTitle("Om")
            }
            .tabItem { Label("Om", systemImage: "info.circle") }
            .tag(ContentTab.about)
        }
        .environment(app)
        #if DEBUG
        .task { openDebugRoute() }
        #endif
    }

    #if DEBUG
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
            ReviewDetailView(loader: app.reviewLoader(slug: slug, preview: preview))
        case .history(let slug, let title):
            ReviewHistoryView(title: title, loader: app.historyLoader(slug: slug))
        }
    }
}
