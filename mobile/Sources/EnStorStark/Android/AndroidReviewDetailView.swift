#if os(Android)
import SwiftUI
import EnStorStarkModel

/// A review (Droid03, Droid04), a draft with its publish banner (Droid25), the publish dialog
/// (Droid26), and the published snackbar (Droid27). The photo runs under the status bar, with
/// round buttons on it instead of a top app bar.
struct ReviewDetailView: View {
    @State var model: ReviewDetailModel
    @Environment(AppModel.self) var app
    @Environment(\.dismiss) var dismiss
    @State var isEditing = false
    @State var isConfirmingPublish = false
    @State var isPublishing = false
    @State var publishError: String?
    @State var showsPublishedSnackbar = false
    /// Bottom edges in global coordinates, to make the photo bar opaque once the photo is gone.
    @State var heroBottom: CGFloat?
    @State var barBottom: CGFloat = 0

    init(model: ReviewDetailModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        ZStack(alignment: .top) {
            ScrollView {
                if let review = model.review {
                    ReviewDetailContent(
                        review: review,
                        errorMessage: model.errorMessage,
                        reload: { await model.load() },
                        showsPublishBanner: review.isDraft && app.session.isSignedIn,
                        publish: {
                            publishError = nil
                            withAnimation { isConfirmingPublish = true }
                        },
                        onHeroBottomChange: { heroBottom = $0 }
                    )
                } else if let errorMessage = model.errorMessage {
                    ErrorCard(message: errorMessage) { await model.load() }
                        .padding(.horizontal, 16)
                        .padding(.top, 120)
                } else {
                    EssProgress().frame(maxWidth: .infinity).padding(.top, 240)
                }
            }
            .background(Ess.bg)
            .ignoresSafeArea(.container, edges: .top)
            .refreshable { await model.load() }
            photoBar
        }
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(isConfirmingPublish ? .hidden : .automatic, for: .tabBar)
        .overlay(alignment: .bottom) {
            if showsPublishedSnackbar {
                EssSnackbar(text: "Publicerad. Nu kan alla se den.", icon: .check)
                    .transition(.opacity)
            }
        }
        .overlay {
            if isConfirmingPublish, let review = model.review {
                PublishDialog(
                    review: review,
                    isPublishing: isPublishing,
                    errorMessage: publishError,
                    publish: { Task { await publish() } },
                    cancel: {
                        withAnimation { isConfirmingPublish = false }
                        publishError = nil
                    }
                )
                .transition(.opacity)
            }
        }
        .fullScreenCover(isPresented: $isEditing) {
            if let review = model.review {
                ReviewWizardSheet(editing: Tagged(value: review, eTag: model.eTag)) { saved in
                    model.replace(with: saved)
                    app.didSave(saved.value)
                }
            }
        }
        .task {
            async let review: Void = model.load()
            async let metadata: Void = app.metadata.loadIfNeeded()
            _ = await (review, metadata)
            #if DEBUG
            // `-debugEdit YES` opens the edit wizard, for checks without taps.
            if UserDefaults.standard.bool(forKey: "debugEdit"), model.eTag != nil {
                isEditing = true
            }
            #endif
        }
    }

    /// How far the photo bar has turned into a solid bar: 0 over the photo, 1 once the title
    /// would scroll under it. The fade starts while the hero's title block is still below the bar.
    var barCoverage: Double {
        guard let heroBottom else { return 0 }
        let fadeStart: CGFloat = 200, fadeEnd: CGFloat = 80
        return Double(min(1, max(0, (barBottom + fadeStart - heroBottom) / (fadeStart - fadeEnd))))
    }

    /// Back, share, and (for reviewers) edit, on dark discs over the photo. Once the photo has
    /// scrolled away, the bar turns solid and shows the title.
    var photoBar: some View {
        HStack(spacing: 8) {
            photoButton(.back, label: "Tillbaka") { dismiss() }
            if let review = model.review {
                Text(review.title)
                    .font(Ess.titleLarge)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .opacity(barCoverage)
                    .accessibilityHidden(barCoverage < 0.5)
            } else {
                Spacer()
            }
            if let review = model.review {
                ShareLink(item: AppConfiguration.webURL(slug: review.slug)) {
                    EssIconView(.share, color: .white)
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(Color.black.opacity(0.45)))
                }
                .accessibilityLabel(Text("Dela"))
            }
            if app.session.isSignedIn {
                // Editing needs the ETag from a fresh read, not the list preview.
                TonalButton(text: "Redigera", icon: .edit, height: 48, fillsWidth: false) { isEditing = true }
                    .disabled(model.review == nil || model.eTag == nil)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .onGeometryChange(for: CGFloat.self, of: { $0.frame(in: .global).maxY }) { barBottom = $0 }
        // A scrim keeps the buttons and the status bar readable over bright photos. Below the
        // photo, a solid backdrop fades in so that text never shows through under the status bar.
        .background(alignment: .top) {
            LinearGradient(colors: [Color.black.opacity(0.85), Color.black.opacity(0.6), Color.clear],
                           startPoint: .top, endPoint: .bottom)
                .padding(.bottom, -24)
                .ignoresSafeArea(.container, edges: .top)
                .allowsHitTesting(false)
        }
        .background {
            Ess.bg.opacity(barCoverage)
                .ignoresSafeArea(.container, edges: .top)
                .allowsHitTesting(false)
        }
    }

    func photoButton(_ icon: EssIcon, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            EssIconView(icon, color: .white)
                .frame(width: 48, height: 48)
                .background(Circle().fill(Color.black.opacity(0.45)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    func publish() async {
        isPublishing = true
        defer { isPublishing = false }
        publishError = nil
        do {
            model.replace(with: try await app.publish(slug: model.slug))
            withAnimation {
                isConfirmingPublish = false
                showsPublishedSnackbar = true
            }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            withAnimation { showsPublishedSnackbar = false }
        } catch let error as APIError where error.problem?.knownCode == .alreadyPublished {
            // Someone else published it first. Show the current state.
            withAnimation { isConfirmingPublish = false }
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
    let showsPublishBanner: Bool
    let publish: () -> Void
    /// Reports the hero's bottom edge in global coordinates as the page scrolls.
    var onHeroBottomChange: (CGFloat) -> Void = { _ in }
    @Environment(AppModel.self) var app

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
                .onGeometryChange(for: CGFloat.self, of: { $0.frame(in: .global).maxY }, action: onHeroBottomChange)
            VStack(alignment: .leading, spacing: 14) {
                if let errorMessage {
                    ErrorCard(message: errorMessage, retry: reload)
                }
                if showsPublishBanner { publishBanner }
                tiles
                credits
                let attributes = app.attributeLabels(review.attributes)
                if !attributes.isEmpty {
                    FlowRows(items: attributes) { label in
                        EssChip(label: label)
                    }
                }
                Text("Recension").font(Ess.headlineSmall).foregroundStyle(.white).padding(.top, 4)
                DescriptionView(source: review.description)
                ratings
                NavigationLink(value: Route.history(slug: review.slug, title: review.title)) {
                    HStack(spacing: 8) {
                        EssIconView(.history, size: 18, color: .white)
                        Text("Visa ändringslogg").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Capsule().fill(Ess.raised2))
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 32)
        }
    }

    var hero: some View {
        ZStack(alignment: .bottomLeading) {
            ReviewPhoto(image: review.image, preview: .detail)
                .frame(maxWidth: .infinity)
                .frame(height: 400)
            LinearGradient(stops: [
                Gradient.Stop(color: Color.black.opacity(0.45), location: 0),
                Gradient.Stop(color: Color.black.opacity(0), location: 0.25),
                Gradient.Stop(color: Color.black.opacity(0), location: 0.5),
                Gradient.Stop(color: Ess.bg, location: 1)
            ], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                if review.isDraft { DraftTag(onPhoto: true) }
                RatingLine(rating: review.overallRating, size: 16, wordColor: Color.white.opacity(0.8))
                Text(review.title)
                    .font(.system(size: 36, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                address
            }
            .padding(.horizontal, 16)
        }
        .frame(height: 400)
        .clipped()
    }

    @ViewBuilder var address: some View {
        let label = HStack(spacing: 6) {
            EssIconView(.place, size: 16, color: Ess.amber)
            Text(review.location).font(Ess.labelLarge).foregroundStyle(Ess.amber).lineLimit(1)
            EssIconView(.openInNew, size: 14, color: Ess.amber)
        }
        if let url = ExternalLinks.mapsURL(for: review.location) {
            Link(destination: url) { label }
        } else {
            label
        }
    }

    var publishBanner: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                EssIconView(.lock, size: 18, color: Ess.amber)
                Text("Privat utkast").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
            }
            Text("Endast inloggade användare kan se recensionen. Publicering går inte att ångra.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.secondary)
            PrimaryButton(text: "Publicera recension", leadingIcon: .send, height: 52, action: publish)
        }
        .padding(16)
        .essCard(24, fill: Ess.amberContainer)
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Ess.amber.opacity(0.35), lineWidth: 1))
    }

    var tiles: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: "Helhetsbetyg")
                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text(verbatim: "\(review.overallRating)").font(Ess.num(48)).foregroundStyle(Ess.amber).glow(radius: 14)
                    Text(verbatim: "/3").font(Ess.num(18)).foregroundStyle(Ess.secondary)
                }
                Stars(rating: review.overallRating, size: 14)
            }
            .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
            .padding(18)
            .essCard()

            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: "Stor stark")
                Text(review.beerBrandText)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 0)
                PriceLabel(priceKr: review.beer.priceKr, isHappyHour: review.beer.isHappyHourPrice, size: 44)
                if review.beer.isHappyHourPrice {
                    Text(Formatting.happyHourNote).font(Ess.bodySmall).foregroundStyle(Ess.tertiary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
            .padding(18)
            .essCard()
        }
    }

    var credits: some View {
        VStack(alignment: .leading, spacing: 6) {
            ReviewerLine(names: review.authorNames, avatarSize: 26, ring: Ess.bg)
            Text("Skapad \(Formatting.shortDate(review.createdAt)) · Uppdaterad \(Formatting.shortDate(review.updatedAt))")
                .font(Ess.bodySmall)
                .foregroundStyle(Ess.secondary)
        }
    }

    @ViewBuilder var ratings: some View {
        let metrics = app.ratingMetrics
        if !metrics.isEmpty {
            let weighted = metrics.reduce(0) { $0 + $1.weight * review.ratings.value(for: $1.key) }
            VStack(alignment: .leading, spacing: 4) {
                Text("Betygsfördelning").font(Ess.headlineSmall).foregroundStyle(.white)
                Text("Viktat \(Formatting.decimal(weighted, maximumFractionDigits: 2)) av 5 ger \(Formatting.ratingWord(review.overallRating).lowercased()), \(review.overallRating)/3")
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Ess.secondary)
            }
            .padding(.top, 12)
            VStack(spacing: 14) {
                ForEach(metrics, id: \.key) { metric in
                    MetricBar(label: metric.label, hint: metric.description, value: review.ratings.value(for: metric.key))
                }
            }
        }
    }
}

/// One aspect: label, description, value of 5, and a Material linear progress bar.
struct MetricBar: View {
    let label: String
    let hint: String
    let value: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(label).font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                    Text(hint).font(Ess.bodySmall).foregroundStyle(Ess.secondary)
                }
                Spacer()
                Text(verbatim: Formatting.decimal(value)).font(Ess.num(22)).foregroundStyle(Ess.amber).glow(radius: 8)
                Text(verbatim: "/5").font(Ess.labelMedium).foregroundStyle(Ess.secondary)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Ess.raised3)
                    Capsule().fill(Ess.amber)
                        .frame(width: proxy.size.width * CGFloat(min(max(value, 0), 5) / 5))
                }
            }
            .frame(height: 8)
        }
        .accessibilityLabel(Text("\(label): \(Formatting.decimal(value)) av 5"))
    }
}

/// The Material dialog that confirms the one-way publication, with what becomes public.
struct PublishDialog: View {
    let review: Review
    let isPublishing: Bool
    let errorMessage: String?
    let publish: () -> Void
    let cancel: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.6)
                .ignoresSafeArea()
                .onTapGesture { if !isPublishing { cancel() } }
            VStack(alignment: .leading, spacing: 16) {
                EssIconView(.send, size: 28, color: Ess.amber).frame(maxWidth: .infinity)
                Text("Publicera recensionen?").font(Ess.headlineSmall).foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                Text("Alla kan se recensionen efter publiceringen. Det går inte att ångra.")
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Ess.secondary)
                HStack(spacing: 12) {
                    ReviewPhoto(image: review.image)
                        .frame(width: 48, height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(review.title).font(.system(size: 14, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                        HStack(spacing: 6) {
                            Stars(rating: review.overallRating, size: 11)
                            Text("av \(Formatting.authorList(review.authorNames.map(Formatting.authorName)))")
                                .font(Ess.bodySmall)
                                .foregroundStyle(Ess.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                    PriceLabel(priceKr: review.beer.priceKr, isHappyHour: review.beer.isHappyHourPrice, size: 20)
                }
                .padding(12)
                .essCard(16, fill: Ess.raised3)
                if let errorMessage {
                    Text(errorMessage).font(Ess.bodyMedium).foregroundStyle(Ess.bad)
                }
                HStack(spacing: 8) {
                    Spacer()
                    Button("Avbryt", action: cancel)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Ess.amber)
                        .buttonStyle(.plain)
                        .padding(.horizontal, 12)
                        .frame(height: 40)
                        .disabled(isPublishing)
                    Button(action: publish) {
                        HStack(spacing: 8) {
                            if isPublishing { ProgressView().tint(Color.black).frame(width: 16, height: 16) }
                            Text("Publicera").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.black)
                        }
                        .padding(.horizontal, 24)
                        .frame(height: 40)
                        .background(Capsule().fill(Ess.amber))
                    }
                    .buttonStyle(.plain)
                    .disabled(isPublishing)
                }
                .padding(.top, 8)
            }
            .padding(24)
            .background(RoundedRectangle(cornerRadius: 28).fill(Ess.raised2))
            .padding(.horizontal, 28)
        }
    }
}
#endif
