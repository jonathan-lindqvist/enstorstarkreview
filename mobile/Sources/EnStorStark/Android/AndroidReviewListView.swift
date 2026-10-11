import SwiftUI
import EnStorStarkModel

#if os(Android)
/// Recensioner and search: sort chips and review cards; the search icon opens a search bar
/// with attribute filters and compact rows. Reviewers get an extended FAB for a new review.
struct ReviewListView: View {
    @Bindable var model: ReviewListModel
    /// Opens a newly created draft.
    var onCreated: (Review) -> Void = { _ in }
    @Environment(AppModel.self) var app
    @State var isCreating = false
    @State var isSearching = false
    @State var snackbarMessage: String?
    @FocusState var isSearchFocused: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                // One item: SkipUI adds the stack spacing also for empty `if` items.
                VStack(alignment: .leading, spacing: 12) {
                    if isSearching { searchBar }
                    sortChips
                    if isSearching { attributeFilters }
                    if let errorMessage = model.errorMessage {
                        ErrorCard(message: errorMessage) { await model.load() }
                    }
                }
                if isSearching {
                    if !model.search.isEmpty || !model.attributeFilter.isEmpty {
                        Text(resultCountText)
                            .font(Ess.labelLarge)
                            .foregroundStyle(Ess.variant)
                            .padding(.top, 4)
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
                            ReviewCard(review: review)
                        }
                        .buttonStyle(.plain)
                    }
                }
                if model.visibleReviews.isEmpty && model.errorMessage == nil {
                    if model.isLoading {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    } else {
                        EmptyState(icon: "search", title: "Inga recensioner hittades")
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, isSearching ? 8 : 0)
            .padding(.bottom, app.session.isSignedIn ? 96 : 24)
        }
        .toolbar(isSearching ? .hidden : .automatic, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    isSearching = true
                    isSearchFocused = true
                } label: {
                    // The SkipUI toolbar renders SF Symbols at 16 dp; Material uses 24 dp.
                    MIcon("search", size: 24, color: Ess.onSurface)
                }
                .accessibilityLabel(Text("Sök"))
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if app.session.isSignedIn && !isSearching && snackbarMessage == nil {
                ExtendedFAB(text: "Ny recension", icon: "add") { isCreating = true }
                    .padding(16)
            }
        }
        .snackbar($snackbarMessage)
        .onChange(of: app.session.username) { _, username in
            guard let username else { return }
            snackbarMessage = "Inloggad som \(Formatting.authorName(username)). Du ser även utkast."
        }
        #if DEBUG
        // `-debugCreate YES` opens the new review, for emulator checks without taps.
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
        .task(id: "\(model.sort.rawValue)|\(model.search)") {
            if !model.reviews.isEmpty || !model.search.isEmpty {
                try? await Task.sleep(nanoseconds: 300_000_000)
                if Task.isCancelled { return }
            }
            await model.load()
        }
    }

    var resultCountText: String {
        let count = model.visibleReviews.count
        return count == 1 ? "1 träff på bar, adress, öl eller skribent" : "\(count) träffar på bar, adress, öl eller skribent"
    }

    /// The Material 3 search bar: back, query, clear.
    var searchBar: some View {
        HStack(spacing: 0) {
            Button {
                isSearchFocused = false
                isSearching = false
                model.search = ""
                model.attributeFilter = []
            } label: {
                MIcon("arrow_back", color: Ess.onSurface).frame(width: 48, height: 48)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Stäng sökningen"))
            TextField("Sök bar, adress, öl eller skribent", text: $model.search)
                .textFieldStyle(.plain)
                .font(Ess.bodyLarge)
                .foregroundStyle(Ess.onSurface)
                .focused($isSearchFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !model.search.isEmpty {
                Button {
                    model.search = ""
                } label: {
                    MIcon("close", color: Ess.variant).frame(width: 48, height: 48)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Rensa sökningen"))
            }
        }
        .padding(.horizontal, 4)
        .frame(height: 56)
        .background(Capsule().fill(Ess.high))
    }

    var sortChips: some View {
        ChipFlow(labels: ReviewListModel.sortOptions.map(\.label),
                 selected: ReviewListModel.sortOptions.map { $0.sort == model.sort }) { index in
            model.sort = ReviewListModel.sortOptions[index].sort
        }
    }

    @ViewBuilder var attributeFilters: some View {
        let attributes = app.metadata.value?.barAttributes ?? []
        if !attributes.isEmpty {
            ChipFlow(labels: attributes.map(\.label),
                     selected: attributes.map { model.attributeFilter.contains($0.key) },
                     scrolls: true,
                     horizontalPadding: 16) { index in
                let key = attributes[index].key
                if model.attributeFilter.contains(key) {
                    model.attributeFilter.remove(key)
                } else {
                    model.attributeFilter.insert(key)
                }
            }
            .padding(.horizontal, -16)
        }
    }
}
#endif
