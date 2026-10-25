import CoreLocation
import SwiftUI
import EnStorStarkModel

/// Recensioner and search.
struct ReviewListView: View {
    @Bindable var model: ReviewListModel
    /// Opens a newly created draft.
    var onCreated: (Review) -> Void = { _ in }
    @Environment(AppModel.self) var app
    @State var isCreating = false
    @State var isSearching = false
    @State var signedInToast: String?
    @State var locationManager = CLLocationManager()
    @State var isLocationDenied = false
    @Environment(\.scenePhase) var scenePhase
    @FocusState var isSearchFocused: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if isSearching { searchField }
                sortPills
                if model.nearest { nearestNote }
                if isSearching { attributeFilters }
                if let errorMessage = model.errorMessage {
                    ErrorCard(message: errorMessage) { await model.load() }
                }
                if isSearching {
                    if !model.search.isEmpty || !model.attributeFilter.isEmpty {
                        Text(resultCountText)
                            .font(Theme.body(13, .medium))
                            .foregroundStyle(Theme.secondary)
                    }
                    ForEach(model.visibleReviews, id: \.id) { review in
                        NavigationLink(value: Route.review(slug: review.slug, preview: review)) {
                            ReviewRow(review: review)
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    ForEach(model.visibleReviews, id: \.id) { review in
                        NavigationLink(value: Route.review(slug: review.slug, preview: review)) {
                            ReviewCard(review: review, distance: model.distanceKm(for: review.slug).map { Formatting.distance(kilometres: $0) })
                        }
                        .buttonStyle(.plain)
                    }
                }
                if model.visibleReviews.isEmpty && model.errorMessage == nil {
                    if model.isLoading {
                        ProgressView().tint(Theme.amber).frame(maxWidth: .infinity).padding(.top, 60)
                    } else {
                        EmptyState(icon: "magnifyingglass", title: "Inga recensioner hittades")
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .scrollDismissesKeyboard(.interactively)
        .toolbar(isSearching ? .hidden : .automatic, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    withAnimation(.snappy) { isSearching = true }
                    isSearchFocused = true
                } label: {
                    Image(systemName: "magnifyingglass").foregroundStyle(.white)
                }
                .accessibilityLabel(Text("Sök"))
            }
            if app.session.isSignedIn {
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isCreating = true
                    } label: {
                        Image(systemName: "plus").foregroundStyle(.black)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(Theme.amber)
                    .accessibilityLabel(Text("Ny recension"))
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let signedInToast {
                Toast(text: "Inloggad som \(signedInToast) · du ser även utkast", avatar: signedInToast)
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onChange(of: app.session.username) { _, username in
            guard let username else { return }
            showSignedInToast(Formatting.authorName(username))
        }
        #if DEBUG
        // `-debugCreate YES` opens the new-review form, for simulator checks without taps.
        .task {
            if UserDefaults.standard.bool(forKey: "debugCreate"), app.session.isSignedIn {
                isCreating = true
            }
        }
        #endif
        .fullScreenCover(isPresented: $isCreating) {
            ReviewWizardSheet(editing: nil) { saved in
                app.didSave(saved.value)
                onCreated(saved.value)
            }
        }
        .refreshable {
            await model.load()
        }
        .task {
            await app.metadata.loadIfNeeded()
        }
        // Loads on appear, and again shortly after the search text or the sort changes.
        .task(id: model.nearest) { await locateForNearest() }
        // Back from Settings, or after moving: a new fix.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, model.nearest { Task { await locateForNearest() } }
        }
        .task(id: "\(model.sort.rawValue)|\(model.nearest)|\(model.search)") {
            if !model.reviews.isEmpty || !model.search.isEmpty {
                try? await Task.sleep(for: .milliseconds(300))
                if Task.isCancelled { return }
            }
            await model.load()
        }
    }

    var resultCountText: String {
        let count = model.visibleReviews.count
        return count == 1 ? "1 träff på bar, adress, öl eller skribent" : "\(count) träffar på bar, adress, öl eller skribent"
    }

    var searchField: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.secondary)
                TextField("Sök bar, adress, öl eller skribent", text: $model.search)
                    .font(Theme.body(17))
                    .foregroundStyle(.white)
                    .tint(Theme.amber)
                    .focused($isSearchFocused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                if !model.search.isEmpty {
                    Button {
                        model.search = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 17)).foregroundStyle(Theme.tertiary)
                    }
                    .accessibilityLabel(Text("Rensa sökningen"))
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 46)
            .glassEffect(.regular.interactive(), in: .capsule)

            Button {
                isSearchFocused = false
                withAnimation(.snappy) {
                    isSearching = false
                    model.search = ""
                    model.attributeFilter = []
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 46, height: 46)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .accessibilityLabel(Text("Stäng sökningen"))
        }
        .padding(.top, 6)
    }

    var sortPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ReviewListModel.sortOptions, id: \.sort) { option in
                    Pill(text: option.label, isOn: !model.nearest && model.sort == option.sort) {
                        withAnimation(.snappy) { model.choose(option.sort) }
                    }
                }
                Pill(text: "Närmast", isOn: model.nearest, icon: isLocationDenied ? "location.slash.fill" : "location.fill") {
                    withAnimation(.snappy) { model.nearest = true }
                }
                .accessibilityIdentifier("reviews.sort.nearest")
            }
            .padding(.horizontal, 14)
        }
        .padding(.horizontal, -14)
    }

    @ViewBuilder var nearestNote: some View {
        if isLocationDenied {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "location.slash").foregroundStyle(Theme.amber).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Platsåtkomst är avstängd, så de senaste visas först.")
                        .font(Theme.body(13, .semibold)).foregroundStyle(.white)
                    Button("Öppna Inställningar") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                    .font(Theme.body(13, .bold)).foregroundStyle(Theme.amber)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .cardBackground(18)
        } else {
            Text(model.origin == nil
                 ? "Hämtar din position…"
                 : "Från din position just nu, fågelvägen. Barer utan känd adress hamnar sist.")
                .font(Theme.body(12)).foregroundStyle(Theme.tertiary)
        }
    }

    /// For "Närmast": saved positions from the map markers and one location fix. The location
    /// stays in memory; the server never receives it.
    func locateForNearest() async {
        guard model.nearest else { return }
        async let map: Void = app.map.loadIfNeeded()
        if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        }
        do {
            for try await update in CLLocationUpdate.liveUpdates() {
                if update.authorizationDenied || update.authorizationDeniedGlobally || update.authorizationRestricted {
                    model.origin = nil
                    isLocationDenied = true
                    break
                }
                guard let location = update.location else { continue }
                isLocationDenied = false
                model.origin = GeoPoint(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
                break
            }
        } catch {
            // Location is optional: the newest show first.
        }
        await map
        if let markers = app.map.value {
            withAnimation(.snappy) { model.positions = ReviewDistance.positions(markers) }
        }
    }

    @ViewBuilder var attributeFilters: some View {
        let attributes = app.metadata.value?.barAttributes ?? []
        if !attributes.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(attributes, id: \.key) { attribute in
                        let isOn = model.attributeFilter.contains(attribute.key)
                        Pill(text: attribute.label, isOn: isOn, icon: isOn ? "checkmark" : nil) {
                            if isOn {
                                model.attributeFilter.remove(attribute.key)
                            } else {
                                model.attributeFilter.insert(attribute.key)
                            }
                        }
                    }
                }
                .padding(.horizontal, 14)
            }
            .padding(.horizontal, -14)
        }
    }

    func showSignedInToast(_ name: String) {
        withAnimation(.snappy) { signedInToast = name }
        Task {
            try? await Task.sleep(for: .seconds(3))
            withAnimation(.snappy) { signedInToast = nil }
        }
    }
}
