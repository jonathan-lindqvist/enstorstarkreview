#if !os(Android)
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
    @FocusState var isSearchFocused: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if isSearching { searchField }
                sortPills
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
                            ReviewCard(review: review)
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
        .sheet(isPresented: $isCreating) {
            ReviewFormSheet(editing: nil) { saved in
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
        HStack(spacing: 8) {
            ForEach(ReviewListModel.sortOptions, id: \.sort) { option in
                Pill(text: option.label, isOn: model.sort == option.sort) {
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
#endif
