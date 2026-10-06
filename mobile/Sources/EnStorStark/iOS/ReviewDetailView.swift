#if !os(Android)
import SwiftUI
import EnStorStarkModel

/// A review, the draft with its publish banner, the publish
/// confirmation, and the published confirmation.
struct ReviewDetailView: View {
    @State var model: ReviewDetailModel
    @Environment(AppModel.self) var app
    @State var isEditing = false
    @State var isConfirmingPublish = false
    @State var isPublishing = false
    @State var publishError: String?
    @State var showsPublishedToast = false
    @State var showsTitle = false

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
                    publishBanner: review.isDraft && app.session.isSignedIn
                        ? AnyView(publishBanner)
                        : nil
                )
            } else if let errorMessage = model.errorMessage {
                ErrorCard(message: errorMessage) { await model.load() }
                    .padding(.horizontal, 18)
                    .padding(.top, 120)
            } else {
                ProgressView().tint(Theme.amber).padding(.top, 200)
            }
        }
        .pageBackground()
        .ignoresSafeArea(.container, edges: .top)
        .onScrollGeometryChange(for: Bool.self) { geometry in
            geometry.contentOffset.y + geometry.contentInsets.top > 340
        } action: { _, isPastHero in
            withAnimation(.easeInOut(duration: 0.2)) { showsTitle = isPastHero }
        }
        .navigationTitle(showsTitle ? (model.review?.title ?? "") : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let review = model.review {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: AppConfiguration.webURL(slug: review.slug)) {
                        Image(systemName: "square.and.arrow.up").foregroundStyle(.white)
                    }
                    .accessibilityLabel(Text("Dela"))
                }
            }
            if app.session.isSignedIn {
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    // Editing needs the ETag from a fresh read, not the list preview.
                    Button("Redigera") { isEditing = true }
                        .foregroundStyle(.white)
                        .disabled(model.review == nil || model.eTag == nil)
                }
            }
        }
        .overlay(alignment: .top) {
            if showsPublishedToast {
                Toast(text: "Publicerad · nu kan alla se den", icon: "checkmark.seal.fill")
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .overlay {
            if isConfirmingPublish, let review = model.review {
                PublishConfirmation(
                    review: review,
                    isPublishing: isPublishing,
                    errorMessage: publishError,
                    publish: { Task { await publish() } },
                    cancel: {
                        withAnimation(.snappy) { isConfirmingPublish = false }
                        publishError = nil
                    }
                )
                .transition(.opacity)
            }
        }
        .toolbar(isConfirmingPublish ? .hidden : .automatic, for: .tabBar, .navigationBar)
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
            // `-debugEdit YES` opens the edit form, for simulator checks without taps.
            if UserDefaults.standard.bool(forKey: "debugEdit"), model.eTag != nil {
                isEditing = true
            }
            #endif
        }
    }

    var publishBanner: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "lock.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.amber)
                Text("Privat utkast").font(Theme.title(18)).foregroundStyle(.white)
            }
            Text("Endast inloggade användare kan se recensionen. Publicering går inte att ångra.")
                .font(Theme.body(14))
                .foregroundStyle(Theme.secondary)
            Button {
                publishError = nil
                withAnimation(.snappy) { isConfirmingPublish = true }
            } label: {
                ButtonLabel(text: "Publicera recension", icon: "paperplane.fill")
            }
            .buttonStyle(PrimaryButtonStyle(height: 48))
            .padding(.top, 2)
        }
        .padding(16)
        .background(Theme.amber.opacity(0.1), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Theme.amber.opacity(0.4), lineWidth: 1))
    }

    func publish() async {
        isPublishing = true
        defer { isPublishing = false }
        publishError = nil
        do {
            model.replace(with: try await app.publish(slug: model.slug))
            withAnimation(.snappy) {
                isConfirmingPublish = false
                showsPublishedToast = true
            }
            try? await Task.sleep(for: .seconds(3))
            withAnimation(.snappy) { showsPublishedToast = false }
        } catch let error as APIError where error.problem?.knownCode == .alreadyPublished {
            // Someone else published it first. Show the current state.
            withAnimation(.snappy) { isConfirmingPublish = false }
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
    let publishBanner: AnyView?
    @Environment(AppModel.self) var app

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    ErrorCard(message: errorMessage, retry: reload)
                }
                if let publishBanner { publishBanner }
                tiles
                credits
                AttributeTags(labels: app.attributeLabels(review.attributes))
                SectionTitle(text: "Recension").padding(.top, 4)
                DescriptionView(source: review.description)
                ratings
                NavigationLink(value: Route.history(slug: review.slug, title: review.title)) {
                    Label("Visa ändringslogg", systemImage: "clock.arrow.circlepath")
                }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 4)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
    }

    /// Square photo on its blurred colour field; the title block sits on its lower part.
    var hero: some View {
        ZStack(alignment: .bottomLeading) {
            Color.clear
                .aspectRatio(0.98, contentMode: .fit)
                .overlay { SquarePhotoOnBlur(image: review.image, solidUntil: 0.6) }
                .overlay {
                    LinearGradient(stops: [.init(color: .black.opacity(0.45), location: 0),
                                           .init(color: .black.opacity(0), location: 0.25),
                                           .init(color: .black.opacity(0), location: 0.45),
                                           .init(color: .black, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                }
                .clipped()
            VStack(alignment: .leading, spacing: 9) {
                if review.isDraft { DraftTag(onPhoto: true) }
                RatingLine(rating: review.overallRating, size: 15, wordColor: .white.opacity(0.75), glow: true)
                Text(review.title)
                    .font(Theme.title(38))
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                address
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 16)
        }
    }

    @ViewBuilder var address: some View {
        let label = HStack(spacing: 5) {
            Image(systemName: "mappin.circle.fill").font(.system(size: 14))
            Text(review.location).font(Theme.body(14, .medium)).lineLimit(1)
            Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .bold))
        }
        .foregroundStyle(Theme.amber)
        if let url = ExternalLinks.mapsURL(for: review.location) {
            Link(destination: url) { label }
                .accessibilityHint(Text("Öppnar adressen i Kartor"))
        } else {
            label
        }
    }

    var tiles: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(text: "Helhetsbetyg")
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(verbatim: "\(review.overallRating)").font(Theme.num(46)).foregroundStyle(Theme.amber).glow()
                    Text(verbatim: "/3").font(Theme.num(18)).foregroundStyle(Theme.secondary)
                }
                Stars(rating: review.overallRating, size: 13)
            }
            .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
            .padding(16)
            .cardBackground(22)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("Helhetsbetyg \(review.overallRating) av 3, \(Formatting.ratingWord(review.overallRating))"))

            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(text: "Stor stark")
                Text(review.beerBrandText)
                    .font(Theme.body(15, .bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                PriceLabel(priceKr: review.beer.priceKr, isHappyHour: review.beer.isHappyHourPrice, size: 42)
                if review.beer.isHappyHourPrice {
                    Text(Formatting.happyHourNote).font(Theme.body(11)).foregroundStyle(Theme.tertiary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
            .padding(16)
            .cardBackground(22)
            .accessibilityElement(children: .combine)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    var credits: some View {
        VStack(alignment: .leading, spacing: 6) {
            ReviewerLine(names: review.authorNames, text: .white, secondary: Theme.secondary, avatarSize: 28)
            Text("Skapad \(Formatting.shortDate(review.createdAt)) · Uppdaterad \(Formatting.shortDate(review.updatedAt))")
                .font(Theme.body(12))
                .foregroundStyle(Theme.tertiary)
        }
    }

    @ViewBuilder var ratings: some View {
        let metrics = app.ratingMetrics
        if !metrics.isEmpty {
            SectionTitle(text: "Betygsfördelning").padding(.top, 12)
            VStack(spacing: 14) {
                ForEach(metrics, id: \.key) { metric in
                    MetricBar(label: metric.label, hint: metric.description, value: review.ratings.value(for: metric.key))
                }
            }
            let weighted = metrics.reduce(0) { $0 + $1.weight * review.ratings.value(for: $1.key) }
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Viktat snitt \(Formatting.decimal(weighted, maximumFractionDigits: 2)) av 5")
                        .font(Theme.body(14, .semibold))
                        .foregroundStyle(.white)
                    Text("Helhetsbetyg: \(Formatting.ratingWord(review.overallRating).lowercased()), \(review.overallRating)/3")
                        .font(Theme.body(13))
                        .foregroundStyle(Theme.secondary)
                }
                Spacer()
                Stars(rating: review.overallRating, size: 18, glow: true)
            }
            .padding(16)
            .cardBackground(20)
            .accessibilityElement(children: .combine)
        }
    }
}

/// One-way publish confirmation that shows what becomes public.
struct PublishConfirmation: View {
    let review: Review
    let isPublishing: Bool
    let errorMessage: String?
    let publish: () -> Void
    let cancel: () -> Void

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture { if !isPublishing { cancel() } }
                .accessibilityHidden(true)
            VStack(spacing: 10) {
                VStack(spacing: 14) {
                    VStack(spacing: 6) {
                        Image(systemName: "paperplane.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(Theme.amber)
                            .glow()
                        Text("Publicera recensionen?").font(Theme.title(21)).foregroundStyle(.white)
                        Text("Alla kan se recensionen efter publiceringen. Det går inte att ångra.")
                            .font(Theme.body(14))
                            .foregroundStyle(Theme.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 8)
                    HStack(spacing: 12) {
                        ReviewPhoto(image: review.image)
                            .frame(width: 52, height: 52)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(review.title).font(Theme.body(15, .bold)).foregroundStyle(.white).lineLimit(1)
                            HStack(spacing: 6) {
                                Stars(rating: review.overallRating, size: 11)
                                Text("av \(Formatting.authorList(review.authorNames))")
                                    .font(Theme.body(12))
                                    .foregroundStyle(Theme.secondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                        PriceLabel(priceKr: review.beer.priceKr, isHappyHour: review.beer.isHappyHourPrice, size: 22)
                    }
                    .padding(12)
                    .cardBackground(18, fill: Color.white.opacity(0.06))
                    if let errorMessage {
                        Text(errorMessage).font(Theme.body(13, .medium)).foregroundStyle(Theme.bad)
                    }
                    Button(action: publish) {
                        ButtonLabel(text: "Publicera", isLoading: isPublishing)
                    }
                    .buttonStyle(PrimaryButtonStyle(height: 52))
                    .disabled(isPublishing)
                }
                .padding(18)
                .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 34, style: .continuous))

                Button(action: cancel) {
                    Text("Avbryt")
                        .font(Theme.body(17, .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: .capsule)
                .disabled(isPublishing)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .accessibilityAddTraits(.isModal)
    }
}
#endif
