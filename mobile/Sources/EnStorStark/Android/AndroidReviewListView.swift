import SwiftUI
import EnStorStarkModel

// Android keeps the plain system screens until the Android design exists.
#if os(Android)
struct ReviewListView: View {
    @Bindable var model: ReviewListModel
    /// Opens a newly created draft.
    var onCreated: (Review) -> Void = { _ in }
    @Environment(AppModel.self) var app
    @State var isCreating = false

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage) { await model.load() }
            }
            ForEach(model.reviews, id: \.id) { review in
                NavigationLink(value: Route.review(slug: review.slug, preview: review)) {
                    ReviewRow(review: review)
                }
            }
        }
        .listStyle(.plain)
        .overlay {
            if model.reviews.isEmpty && model.errorMessage == nil {
                if model.isLoading {
                    ProgressView()
                } else {
                    EmptyStateView(systemImage: "magnifyingglass", title: "Inga recensioner hittades")
                }
            }
        }
        .searchable(text: $model.search, prompt: Text("Sök bar, adress, öl eller skribent"))
        .toolbar {
            if app.session.isSignedIn {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        isCreating = true
                    } label: {
                        Label("Ny recension", systemImage: "plus")
                    }
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Sortera", selection: $model.sort) {
                        ForEach(ReviewListModel.sortOptions, id: \.sort) { option in
                            Text(option.label).tag(option.sort)
                        }
                    }
                } label: {
                    Label("Sortera", systemImage: Symbol.sort)
                }
            }
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
        // Loads on appear, and again shortly after the search text or the sort changes.
        .task(id: "\(model.sort.rawValue)|\(model.search)") {
            if !model.reviews.isEmpty || !model.search.isEmpty {
                try? await Task.sleep(nanoseconds: 300_000_000)
                if Task.isCancelled { return }
            }
            await model.load()
        }
    }
}

#endif
