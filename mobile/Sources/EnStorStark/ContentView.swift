import SwiftUI
import EnStorStarkModel

enum ContentTab: String, Hashable {
    case reviews, map, statistics, about
}

struct ContentView: View {
    @State var tab = ContentTab.reviews

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                PlaceholderView(systemImage: "list.bullet", text: "Här kommer recensionerna.")
                    .navigationTitle("Recensioner")
            }
            .tabItem { Label("Recensioner", systemImage: "list.bullet") }
            .tag(ContentTab.reviews)

            NavigationStack {
                PlaceholderView(systemImage: "map", text: "Här kommer kartan.")
                    .navigationTitle("Karta")
            }
            .tabItem { Label("Karta", systemImage: "map") }
            .tag(ContentTab.map)

            NavigationStack {
                PlaceholderView(systemImage: "chart.bar", text: "Här kommer statistiken.")
                    .navigationTitle("Statistik")
            }
            .tabItem { Label("Statistik", systemImage: "chart.bar") }
            .tag(ContentTab.statistics)

            NavigationStack {
                AboutView()
                    .navigationTitle("Om")
            }
            .tabItem { Label("Om", systemImage: "info.circle") }
            .tag(ContentTab.about)
        }
    }
}

struct PlaceholderView: View {
    let systemImage: String
    let text: LocalizedStringKey

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(text)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct AboutView: View {
    var body: some View {
        Form {
            Section {
                Text("En stor stark – barrecensioner från ett gäng vänner.")
            }
            Section {
                LabeledContent("Server", value: AppConfiguration.serverOrigin.absoluteString)
                if let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
                   let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String {
                    LabeledContent("Version", value: "\(version) (\(buildNumber))")
                }
            }
        }
    }
}
