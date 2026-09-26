import SwiftUI
import EnStorStarkModel

struct ReviewDetailView: View {
    @State var model: ReviewDetailModel
    @Environment(AppModel.self) var app
    @State var isEditing = false

    init(model: ReviewDetailModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        ScrollView {
            if let review = model.review {
                VStack(alignment: .leading, spacing: 0) {
                    if let errorMessage = model.errorMessage {
                        ErrorBanner(message: errorMessage) { await model.load() }
                            .padding()
                    }
                    if review.isDraft && app.session.isSignedIn {
                        DraftPublishBanner(model: model)
                            .padding()
                    }
                    ReviewDetailContent(review: review)
                }
            } else if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage) { await model.load() }
                    .padding()
            } else {
                ProgressView()
                    .padding(.top, 60)
            }
        }
        .navigationTitle(model.review?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if app.session.isSignedIn {
                ToolbarItem(placement: .primaryAction) {
                    // Editing needs the ETag from a fresh read, not the list preview.
                    Button("Redigera") { isEditing = true }
                        .disabled(model.review == nil || model.eTag == nil)
                }
            }
        }
        .sheet(isPresented: $isEditing) {
            if let review = model.review {
                ReviewFormSheet(editing: Tagged(value: review, eTag: model.eTag)) { saved in
                    model.replace(with: saved)
                    app.didSave(saved.value)
                }
            }
        }
        .refreshable {
            await model.load()
        }
        .task {
            async let review: Void = model.load()
            async let metadata: Void = app.metadata.loadIfNeeded()
            _ = await (review, metadata)
            #if DEBUG
            // `-debugEdit YES` opens the edit form, for simulator checks without taps.
            if UserDefaults.standard.bool(forKey: "debugEdit"), model.eTag != nil {
                isEditing = true
            }
            #endif
        }
    }
}

struct ReviewDetailContent: View {
    let review: Review
    @Environment(AppModel.self) var app

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Color.clear
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .overlay {
                    FocusedImage(path: review.image.url, focusX: review.image.focusX, focusY: review.image.focusY)
                }
                .clipped()

            VStack(alignment: .leading, spacing: 20) {
                header
                summary
                credits

                VStack(alignment: .leading, spacing: 8) {
                    Text("Recension")
                        .font(.headline)
                    ReviewDescriptionView(source: review.description)
                }

                ratings

                NavigationLink(value: Route.history(slug: review.slug, title: review.title)) {
                    SymbolLabel("Visa ändringslogg", systemImage: Symbol.history)
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
    }

    var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            if review.isDraft {
                DraftBadge()
            }
            Text(review.title)
                .font(.largeTitle.bold())
            if let mapsURL = ExternalLinks.mapsURL(for: review.location) {
                Link(destination: mapsURL) {
                    Label(review.location, systemImage: Symbol.location)
                        .font(.subheadline)
                }
            } else {
                Text(review.location)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    var summary: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 4) {
                Text("Helhetsbetyg")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(verbatim: "\(review.overallRating)/3")
                    .font(.largeTitle.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color.secondary.opacity(0.1)))

            VStack(alignment: .leading, spacing: 4) {
                Text("Märke")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(review.beerBrandText)
                    .font(.headline)
                if let price = review.beerPriceText {
                    Text(price)
                        .font(.title.bold())
                    if review.beer.isHappyHourPrice {
                        Text(Formatting.happyHourNote)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color.secondary.opacity(0.1)))
        }
    }

    var credits: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Författare: \(review.authorsText)")
                .font(.subheadline)
            Text("Skapad \(Formatting.date(review.createdAt)) • Uppdaterad \(Formatting.date(review.updatedAt))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder var ratings: some View {
        if !app.ratingMetrics.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("Betygsfördelning")
                    .font(.headline)
                ForEach(app.ratingMetrics, id: \.key) { metric in
                    let value = review.ratings.value(for: metric.key)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(metric.label)
                            Spacer()
                            Text(verbatim: "\(Formatting.decimal(value))/5")
                                .fontWeight(.semibold)
                        }
                        .font(.subheadline)
                        ProgressView(value: min(max(value, 0), 5), total: 5)
                    }
                    #if !os(Android)
                    .accessibilityElement(children: .combine)
                    #endif
                }
            }
        }
    }
}

/// Shown on drafts in reviewer mode. Publication is one-way, so it asks first.
struct DraftPublishBanner: View {
    let model: ReviewDetailModel
    @Environment(AppModel.self) var app
    @State var isConfirming = false
    @State var isPublishing = false
    @State var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Privat utkast")
                .font(.headline)
            Text("Endast inloggade användare kan se recensionen. Publicering går inte att ångra.")
                .font(.subheadline)
            if let errorMessage {
                Text(errorMessage)
                    .font(.subheadline)
                    .foregroundStyle(Color.red)
            }
            Button {
                isConfirming = true
            } label: {
                HStack {
                    Text("Publicera recension")
                    if isPublishing {
                        ProgressView()
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.orange)
            .disabled(isPublishing)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.orange.opacity(0.15)))
        .confirmationDialog("Publicera recensionen?", isPresented: $isConfirming, titleVisibility: .visible) {
            Button("Publicera") {
                Task { await publish() }
            }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Alla kan se recensionen efter publiceringen. Det går inte att ångra.")
        }
    }

    func publish() async {
        isPublishing = true
        defer { isPublishing = false }
        errorMessage = nil
        do {
            model.replace(with: try await app.publish(slug: model.slug))
        } catch let error as APIError where error.problem?.knownCode == .alreadyPublished {
            // Someone else published it first. Show the current state.
            await model.load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
