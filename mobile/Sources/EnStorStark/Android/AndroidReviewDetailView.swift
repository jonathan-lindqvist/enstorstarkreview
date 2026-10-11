import SwiftUI
import EnStorStarkModel

#if os(Android)
/// A review: the photo with the title, the summary cards, the text, and the ratings. Drafts
/// show the publish card; publication asks first in a Material 3 dialog.
struct ReviewDetailView: View {
    @State var model: ReviewDetailModel
    @Environment(AppModel.self) var app
    @Environment(\.dismiss) var dismiss
    @State var isEditing = false
    @State var isConfirmingPublish = false
    @State var isPublishing = false
    @State var publishError: String?
    @State var snackbarMessage: String?
    /// True when the photo has scrolled away: the top bar then gets a surface and the title.
    @State var isCollapsed = false
    /// The status bar height: the top bar surface goes behind it.
    @State var topInset: CGFloat = 0

    init(model: ReviewDetailModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        ScrollView {
            if let review = model.review {
                ReviewDetailContent(
                    review: review,
                    errorMessage: model.errorMessage,
                    reload: { await model.load() },
                    showsPublishCard: review.isDraft && app.session.isSignedIn,
                    isPublishing: isPublishing,
                    publishError: publishError,
                    publish: {
                        publishError = nil
                        isConfirmingPublish = true
                    },
                    heroBottomChanged: { bottom in
                        let collapsed = bottom < 140
                        if collapsed != isCollapsed { isCollapsed = collapsed }
                    }
                )
            } else if let errorMessage = model.errorMessage {
                ErrorCard(message: errorMessage) { await model.load() }
                    .padding(.horizontal, 16)
                    .padding(.top, 120)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 200)
            }
        }
        .overlay(alignment: .top) {
            // The Material top app bar on scroll: a surface behind the status bar and the
            // buttons, so the text below the photo does not show through. It is inside the
            // area that ignores the safe area, so it starts at the top of the screen.
            if isCollapsed {
                Ess.container
                    .frame(height: topInset + 56)
                    .allowsHitTesting(false)
            }
        }
        .ignoresSafeArea(edges: .top)
        .overlay(alignment: .top) {
            topButtons
                .onGeometryChange(for: CGFloat.self, of: { $0.frame(in: .global).minY }) { minY in
                    topInset = minY
                }
        }
        .toolbar(.hidden, for: .navigationBar)
        .snackbar($snackbarMessage)
        .alert("Publicera recensionen?", isPresented: $isConfirmingPublish) {
            Button("Avbryt", role: .cancel) {}
            Button("Publicera") { Task { await publish() } }
        } message: {
            Text("Alla kan se recensionen efter publiceringen. Det går inte att ångra.")
        }
        .fullScreenCover(isPresented: $isEditing) {
            if let review = model.review {
                ReviewWizardSheet(editing: Tagged(value: review, eTag: model.eTag)) { saved in
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
            // `-debugEdit YES` opens the edit wizard, for emulator checks without taps.
            if UserDefaults.standard.bool(forKey: "debugEdit"), model.eTag != nil {
                isEditing = true
            }
            #endif
        }
    }

    /// Back, share, and edit on round buttons over the photo.
    var topButtons: some View {
        HStack(spacing: 8) {
            Button { dismiss() } label: {
                MIcon("arrow_back", color: .white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.black.opacity(isCollapsed ? 0.0 : 0.45)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Tillbaka"))
            if isCollapsed, let review = model.review {
                Text(review.title)
                    .font(Ess.titleLarge)
                    .foregroundStyle(Ess.onSurface)
                    .lineLimit(1)
            }
            Spacer()
            if let review = model.review {
                ShareLink(item: AppConfiguration.webURL(slug: review.slug)) {
                    MIcon("share", color: .white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Color.black.opacity(isCollapsed ? 0.0 : 0.45)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Dela"))
            }
            if app.session.isSignedIn {
                // Editing needs the ETag from a fresh read, not the list preview.
                Button { isEditing = true } label: {
                    HStack(spacing: 6) {
                        MIcon("edit", size: 18, color: Ess.onAmberContainer)
                        Text("Redigera").font(Ess.labelLarge).foregroundStyle(Ess.onAmberContainer)
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(Capsule().fill(Ess.amberContainer))
                }
                .buttonStyle(.plain)
                .disabled(model.review == nil || model.eTag == nil)
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 56)
    }

    func publish() async {
        isPublishing = true
        defer { isPublishing = false }
        publishError = nil
        do {
            model.replace(with: try await app.publish(slug: model.slug))
            snackbarMessage = "Publicerad. Nu kan alla se den."
        } catch let error as APIError where error.problem?.knownCode == .alreadyPublished {
            // Someone else published it first. Show the current state.
            await model.load()
        } catch {
            publishError = error.localizedDescription
        }
    }
}

struct ReviewDetailContent: View {
    let review: Review
    let errorMessage: String?
    let reload: () async -> Void
    let showsPublishCard: Bool
    let isPublishing: Bool
    let publishError: String?
    let publish: () -> Void
    /// The bottom edge of the photo on the screen, for the top bar.
    var heroBottomChanged: (CGFloat) -> Void = { _ in }
    @Environment(AppModel.self) var app
    @State var showsHistory = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
                .onGeometryChange(for: CGFloat.self, of: { $0.frame(in: .global).maxY }) { bottom in
                    heroBottomChanged(bottom)
                }
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    ErrorCard(message: errorMessage, retry: reload)
                }
                if showsPublishCard { publishCard }
                summary
                credits
                attributes
                SectionTitle(text: "Recension").padding(.top, 4)
                ReviewDescriptionView(source: review.description)
                    .foregroundStyle(Ess.onSurface)
                ratings
                M3Button(text: "Visa ändringslogg", icon: "history", style: .outlined, height: 48) {
                    showsHistory = true
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
        .navigationDestination(isPresented: $showsHistory) {
            RouteView(route: .history(slug: review.slug, title: review.title))
        }
    }

    /// The photo with a gradient; the title block sits on its lower part.
    var hero: some View {
        Color.clear
            .frame(height: 400)
            .overlay { FocusedImage(path: review.image.url, focusX: review.image.focusX, focusY: review.image.focusY) }
            .overlay {
                LinearGradient(stops: [.init(color: Color.black.opacity(0.5), location: 0),
                                       .init(color: Color.black.opacity(0), location: 0.25),
                                       .init(color: Color.black.opacity(0), location: 0.45),
                                       .init(color: Ess.surface, location: 1)],
                               startPoint: .top, endPoint: .bottom)
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 8) {
                    if review.isDraft { DraftChip(onPhoto: true) }
                    RatingLine(rating: review.overallRating, size: 15, wordColor: Color.white.opacity(0.8))
                    Text(review.title)
                        .font(Ess.displaySmall)
                        .foregroundStyle(Color.white)
                        .lineLimit(3)
                    address
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            }
            .clipped()
    }

    @ViewBuilder var address: some View {
        let label = HStack(spacing: 6) {
            MIcon("place", size: 16, color: Ess.amber)
            Text(review.location).font(Ess.labelLarge).foregroundStyle(Ess.amber).lineLimit(1)
            MIcon("open", size: 14, color: Ess.amber)
        }
        if let url = ExternalLinks.mapsURL(for: review.location) {
            Link(destination: url) { label }
        } else {
            label
        }
    }

    var publishCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                MIcon("lock", size: 18, color: Ess.amber)
                Text("Privat utkast").font(Ess.titleMedium).foregroundStyle(Ess.onSurface)
            }
            Text("Endast inloggade användare kan se recensionen. Publicering går inte att ångra.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.variant)
            if let publishError {
                Text(publishError).font(Ess.bodyMedium).foregroundStyle(Ess.error)
            }
            M3Button(text: "Publicera recension", icon: "send", height: 48, isLoading: isPublishing, action: publish)
        }
        .padding(16)
        .tonal(Ess.amberContainer.opacity(0.45), radius: 24)
        .outlined(radius: 24, color: Ess.amber.opacity(0.4))
    }

    var summary: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Helhetsbetyg").font(Ess.labelMedium).foregroundStyle(Ess.variant)
                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text(verbatim: "\(review.overallRating)").font(Ess.num(44)).foregroundStyle(Ess.amber)
                    Text(verbatim: "/3").font(Ess.num(18)).foregroundStyle(Ess.variant)
                }
                Stars(rating: review.overallRating, size: 14)
            }
            .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
            .padding(16)
            .tonal(Ess.low, radius: 20)

            VStack(alignment: .leading, spacing: 4) {
                Text("Stor stark").font(Ess.labelMedium).foregroundStyle(Ess.variant)
                Text(review.beerBrandText)
                    .font(Ess.titleSmall)
                    .foregroundStyle(Ess.onSurface)
                    .lineLimit(2)
                Spacer(minLength: 0)
                PriceText(priceKr: review.beer.priceKr, isHappyHour: review.beer.isHappyHourPrice, size: 40)
                if review.beer.isHappyHourPrice {
                    Text(Formatting.happyHourNote).font(Ess.bodySmall).foregroundStyle(Ess.outline)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
            .padding(16)
            .tonal(Ess.low, radius: 20)
        }
    }

    var credits: some View {
        VStack(alignment: .leading, spacing: 6) {
            AuthorLine(names: review.authorNames, size: 26)
            Text(verbatim: "Skapad \(Formatting.shortDate(review.createdAt)) · Uppdaterad \(Formatting.shortDate(review.updatedAt))")
                .font(Ess.bodySmall)
                .foregroundStyle(Ess.variant)
        }
    }

    @ViewBuilder var attributes: some View {
        let labels = app.attributeLabels(review.attributes)
        if !labels.isEmpty {
            ChipFlow(labels: labels, selected: labels.map { _ in false }, icons: .none) { _ in }
                .allowsHitTesting(false)
                .accessibilityLabel(Text("Aktiviteter och utbud: \(labels.joined(separator: ", "))"))
        }
    }

    @ViewBuilder var ratings: some View {
        let metrics = app.ratingMetrics
        if !metrics.isEmpty {
            let weighted = metrics.reduce(0) { $0 + $1.weight * review.ratings.value(for: $1.key) }
            VStack(alignment: .leading, spacing: 4) {
                SectionTitle(text: "Betygsfördelning")
                Text(verbatim: "Viktat \(Formatting.decimal(weighted, maximumFractionDigits: 2)) av 5 ger \(Formatting.ratingWord(review.overallRating).lowercased()), \(review.overallRating)/3")
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Ess.variant)
            }
            .padding(.top, 12)
            VStack(spacing: 16) {
                ForEach(metrics, id: \.key) { metric in
                    MetricBar(label: metric.label, hint: metric.description, value: review.ratings.value(for: metric.key))
                }
            }
        }
    }
}
#endif
