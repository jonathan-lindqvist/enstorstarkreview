import SwiftUI
import EnStorStarkModel

struct ReviewListView: View {
    @Bindable var model: ReviewListModel
    @Environment(AppModel.self) var app

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
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Sortera", selection: $model.sort) {
                        ForEach(ReviewListModel.sortOptions, id: \.sort) { option in
                            Text(option.label).tag(option.sort)
                        }
                    }
                } label: {
                    Label("Sortera", systemImage: "arrow.up.arrow.down")
                }
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

struct ReviewRow: View {
    let review: Review

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            FocusedImage(path: review.image.url, focusX: review.image.focusX, focusY: review.image.focusY)
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(review.title)
                        .font(.headline)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    RatingBadge(rating: review.overallRating)
                }
                Text(review.location)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(alignment: .firstTextBaseline) {
                    Text(review.beerBrandText)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if let price = review.beerPriceText {
                        Text(price)
                            .fontWeight(.semibold)
                    }
                }
                .font(.subheadline)
                if review.isDraft {
                    DraftBadge()
                }
            }
        }
        .padding(.vertical, 4)
    }
}
