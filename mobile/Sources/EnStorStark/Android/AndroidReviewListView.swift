#if os(Android)
import SwiftUI
import EnStorStarkModel

/// Recensioner and search (Droid01, Droid02, Droid11): feed cards under a large top app bar,
/// sort chips, an extended FAB for reviewers, and a full-width search bar with filter chips.
struct ReviewListView: View {
    @Bindable var model: ReviewListModel
    /// Opens a newly created draft.
    var onCreated: (Review) -> Void = { _ in }
    @Environment(AppModel.self) var app
    @State var isCreating = false
    @State var isSearching = false
    @State var signedInSnackbar: String?
    @FocusState var isSearchFocused: Bool

    var body: some View {
        // Type-erased in parts: very deep generic view types overflow the main thread's stack
        // on Android while Swift instantiates their metadata.
        AnyView(list)
            .toolbar(isSearching ? .hidden : .automatic, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        withAnimation { isSearching = true }
                        isSearchFocused = true
                    } label: {
                        EssIconView(.search, color: .white)
                    }
                    .accessibilityLabel(Text("Sök"))
                }
            }
            .overlay(alignment: .bottomTrailing) { AnyView(fab) }
            .overlay(alignment: .bottom) { AnyView(snackbar) }
            .onChange(of: app.session.username) { _, username in
                guard let username else { return }
                showSignedInSnackbar(Formatting.authorName(username))
            }
            #if DEBUG
            // `-debugCreate YES` opens the new-review wizard, for checks without taps.
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

    @ViewBuilder var fab: some View {
        if app.session.isSignedIn && !isSearching {
            newReviewButton.padding(16)
        }
    }

    @ViewBuilder var snackbar: some View {
        if let signedInSnackbar {
            EssSnackbar(text: "Inloggad som \(signedInSnackbar). Du ser även utkast.", avatar: signedInSnackbar)
                .padding(.bottom, 72)
        }
    }

    var list: some View {
        VStack(spacing: 0) {
            // Pinned above the results.
            if isSearching { searchBar.padding(.bottom, 8) }
            results
        }
        .background(Ess.bg)
    }

    var results: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                sortChips.padding(.horizontal, 16)
                if isSearching { attributeFilters }
                if let errorMessage = model.errorMessage {
                    ErrorCard(message: errorMessage) { await model.load() }
                        .padding(.horizontal, 16)
                }
                if isSearching {
                    if !model.search.isEmpty || !model.attributeFilter.isEmpty {
                        Text(resultCountText)
                            .font(Ess.labelLarge)
                            .foregroundStyle(Ess.secondary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 4)
                    }
                    ForEach(model.visibleReviews, id: \.id) { review in
                        NavigationLink(value: Route.review(slug: review.slug, preview: review)) {
                            AnyView(ReviewRow(review: review))
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    ForEach(model.visibleReviews, id: \.id) { review in
                        NavigationLink(value: Route.review(slug: review.slug, preview: review)) {
                            AnyView(ReviewCard(review: review))
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 16)
                    }
                }
                if model.visibleReviews.isEmpty && model.errorMessage == nil {
                    if model.isLoading {
                        EssProgress().frame(maxWidth: .infinity).padding(.top, 60)
                    } else {
                        EmptyState(icon: .search, title: "Inga recensioner hittades")
                    }
                }
            }
            .padding(.top, isSearching ? 8 : 0)
            // Room for the FAB over the last card.
            .padding(.bottom, app.session.isSignedIn ? 96 : 16)
        }
        .background(Ess.bg)
        .scrollDismissesKeyboard(.interactively)
        .refreshable {
            await model.load()
        }
    }

    var resultCountText: String {
        let count = model.visibleReviews.count
        return count == 1 ? "1 träff på bar, adress, öl eller skribent" : "\(count) träffar på bar, adress, öl eller skribent"
    }

    /// The Material search bar: back, the query, and a clear button.
    var searchBar: some View {
        HStack(spacing: 4) {
            Button {
                isSearchFocused = false
                withAnimation {
                    isSearching = false
                    model.search = ""
                    model.attributeFilter = []
                }
            } label: {
                EssIconView(.back, color: .white).frame(width: 48, height: 48)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Stäng sökningen"))
            TextField("Sök bar, adress, öl eller skribent", text: $model.search)
                .textFieldStyle(.plain)
                .font(Ess.bodyLarge)
                .foregroundStyle(.white)
                .tint(Ess.amber)
                .focused($isSearchFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !model.search.isEmpty {
                Button {
                    model.search = ""
                } label: {
                    EssIconView(.close, color: .white).frame(width: 48, height: 48)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Rensa sökningen"))
            }
        }
        .padding(.horizontal, 4)
        .frame(height: 56)
        .background(Capsule().fill(Ess.raised2))
        .padding(.horizontal, 16)
    }

    var sortChips: some View {
        HStack(spacing: 8) {
            ForEach(ReviewListModel.sortOptions, id: \.sort) { option in
                EssChip(label: option.label, isOn: model.sort == option.sort) {
                    model.sort = option.sort
                }
            }
        }
    }

    @ViewBuilder var attributeFilters: some View {
        let attributes = app.metadata.value?.barAttributes ?? []
        if !attributes.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(attributes, id: \.key) { attribute in
                        let isOn = model.attributeFilter.contains(attribute.key)
                        EssChip(label: attribute.label, isOn: isOn, leading: .check) {
                            if isOn {
                                model.attributeFilter.remove(attribute.key)
                            } else {
                                model.attributeFilter.insert(attribute.key)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    /// The Material 3 extended FAB.
    var newReviewButton: some View {
        Button {
            isCreating = true
        } label: {
            HStack(spacing: 12) {
                EssIconView(.add, color: .black)
                Text("Ny recension").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.black)
            }
            .padding(.horizontal, 20)
            .frame(height: 56)
            .background(RoundedRectangle(cornerRadius: 16).fill(Ess.amber))
            .shadow(color: Color.black.opacity(0.5), radius: 6, y: 3)
        }
        .buttonStyle(.plain)
    }

    func showSignedInSnackbar(_ name: String) {
        withAnimation { signedInSnackbar = name }
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            withAnimation { signedInSnackbar = nil }
        }
    }
}
#endif
