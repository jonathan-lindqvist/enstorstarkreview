#if !os(Android)
import SwiftUI
import UIKit
import EnStorStarkModel

/// Opens the review wizard full screen. It creates the form model when the metadata is ready.
struct ReviewWizardSheet: View {
    /// Nil creates a new draft.
    let editing: Tagged<Review>?
    let onSaved: (Tagged<Review>) -> Void
    @Environment(AppModel.self) var app
    @Environment(\.dismiss) var dismiss
    @State var form: ReviewFormModel?
    @State var loadFailed = false

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            if let form {
                ReviewWizardView(form: form, onSaved: { saved in
                    onSaved(saved)
                    dismiss()
                }, onClose: { dismiss() })
            } else if loadFailed {
                VStack(spacing: 16) {
                    ErrorCard(message: "Kunde inte hämta formulärets uppgifter.") { await makeForm() }
                    Button("Stäng") { dismiss() }
                        .buttonStyle(SecondaryButtonStyle())
                }
                .padding(20)
            } else {
                ProgressView().tint(Theme.amber)
            }
        }
        .preferredColorScheme(.dark)
        .task { await makeForm() }
    }

    func makeForm() async {
        loadFailed = false
        if let made = await app.makeReviewForm(editing: editing) {
            form = made
            await made.loadAuthors()
        } else {
            loadFailed = true
        }
    }
}

/// The review wizard: one question per screen, big controls low on the screen.
///
/// A new review goes through the steps in order. An edit starts on a list of all steps; a tap
/// opens one step, and "Klar" returns to the list.
struct ReviewWizardView: View {
    @Bindable var form: ReviewFormModel
    let onSaved: (Tagged<Review>) -> Void
    let onClose: () -> Void

    @State var step: ReviewWizardStep = .photo
    @State var ratingIndex = 0
    @State var furthest: ReviewWizardStep = .photo
    @State var showsOverview = false
    @State var isConfirmingClose = false
    @State var showsRestoredNote = false
    @State var forward = true
    /// The photo to show: the new photo or the current photo of an edited review.
    @State var photo: UIImage?
    @Environment(AppModel.self) var app
    @Environment(\.scenePhase) var scenePhase
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    var metrics: [RatingMetric] { form.metadata.ratingMetrics }

    var body: some View {
        ZStack(alignment: .top) {
            Theme.bg.ignoresSafeArea()
            if form.isEditing && showsOverview {
                WizardOverview(form: form, photo: photo) { open($0) }
                    .transition(.opacity)
            } else {
                stepView
                    .id(step)
                    .transition(stepTransition)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) { topBar }
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
        .overlay(alignment: .top) {
            if showsRestoredNote { restoredNote }
        }
        .preferredColorScheme(.dark)
        .tint(Theme.amber)
        .confirmationDialog(form.isEditing ? "Vill du slänga ändringarna?" : "Vill du stänga recensionen?",
                            isPresented: $isConfirmingClose, titleVisibility: .visible) {
            if form.isEditing {
                Button("Släng ändringarna", role: .destructive) { onClose() }
                Button("Fortsätt redigera", role: .cancel) {}
            } else {
                Button("Spara till senare") {
                    form.saveLocalCopy(step: step)
                    onClose()
                }
                Button("Släng recensionen", role: .destructive) {
                    form.discardLocalCopy()
                    onClose()
                }
                Button("Fortsätt skriva", role: .cancel) {}
            }
        } message: {
            if !form.isEditing {
                Text("Recensionen finns kvar på telefonen tills du sparar den eller slänger den.")
            }
        }
        .interactiveDismissDisabled()
        .disabled(form.isReloading)
        .onAppear(perform: start)
        // Keeps a local copy shortly after each change, and at once when the app goes to the
        // background.
        .task(id: form.draft) {
            try? await Task.sleep(nanoseconds: 600_000_000)
            if !Task.isCancelled { form.saveLocalCopy(step: step) }
        }
        .onChange(of: step) { _, newStep in
            furthest = max(furthest, newStep)
            form.saveLocalCopy(step: newStep)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { form.saveLocalCopy(step: step) }
        }
        .onChange(of: form.newImageData) { _, data in
            if let data { photo = UIImage(data: data) }
        }
        .task { await loadPhoto() }
    }

    // MARK: Steps

    @ViewBuilder var stepView: some View {
        switch step {
        case .photo:
            WizardPhotoStep(form: form, photo: $photo)
        case .bar:
            WizardBarStep(form: form, photo: photo)
        case .beer:
            WizardBeerStep(form: form)
        case .ratings:
            WizardRatingStep(form: form, index: $ratingIndex, forward: forward)
        case .text:
            WizardTextStep(form: form)
        case .authors:
            WizardAuthorsStep(form: form, photo: photo)
        }
    }

    var stepTransition: AnyTransition {
        if reduceMotion { return .opacity }
        return .asymmetric(
            insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
            removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity)
        )
    }

    func start() {
        guard step == .photo, furthest == .photo else { return }
        if form.isEditing {
            showsOverview = true
            furthest = .authors
        } else if let restored = form.restoredStep {
            step = restored
            furthest = restored
            withAnimation { showsRestoredNote = true }
        }
        #if DEBUG
        // `-debugWizardStep ratings` opens a step, for simulator checks without taps.
        if let name = UserDefaults.standard.string(forKey: "debugWizardStep"),
           let debugStep = ReviewWizardStep.allCases.first(where: { "\($0)" == name }) {
            step = debugStep
            furthest = .authors
            showsOverview = false
        }
        #endif
    }

    func loadPhoto() async {
        if let data = form.newImageData {
            photo = UIImage(data: data)
        } else if let path = form.existingImagePath {
            if let cached = ReviewImageCache.images.object(forKey: path as NSString) {
                photo = cached
            } else if let data = try? await app.api.imageData(path: path), let loaded = UIImage(data: data) {
                photo = loaded
            }
        }
    }

    func go(to target: ReviewWizardStep) {
        forward = target.rawValue >= step.rawValue
        if target == .ratings {
            ratingIndex = forward ? 0 : max(metrics.count - 1, 0)
        }
        withAnimation(.snappy(duration: 0.35)) { step = target }
    }

    func open(_ target: ReviewWizardStep) {
        forward = true
        ratingIndex = 0
        step = target
        withAnimation(.snappy(duration: 0.3)) { showsOverview = false }
    }

    func returnToOverview() {
        withAnimation(.snappy(duration: 0.3)) { showsOverview = true }
    }

    // MARK: Actions

    func next() {
        if step == .ratings && ratingIndex < metrics.count - 1 {
            forward = true
            withAnimation(.snappy(duration: 0.35)) { ratingIndex += 1 }
            return
        }
        guard form.validate(step) else {
            UIAccessibility.post(notification: .announcement, argument: "Kontrollera de markerade fälten.")
            return
        }
        if form.isEditing {
            returnToOverview()
        } else if let following = step.next {
            go(to: following)
        } else {
            save()
        }
    }

    func back() {
        if step == .ratings && ratingIndex > 0 {
            forward = false
            withAnimation(.snappy(duration: 0.35)) { ratingIndex -= 1 }
        } else if form.isEditing {
            returnToOverview()
        } else if let previous = step.previous {
            go(to: previous)
        }
    }

    func skipPhoto() {
        go(to: .bar)
    }

    func close() {
        if form.hasChanges {
            isConfirmingClose = true
        } else {
            onClose()
        }
    }

    func save() {
        Task {
            if let saved = await form.submit() {
                onSaved(saved)
            } else if let errorStep = form.firstStepWithError {
                if form.isEditing {
                    returnToOverview()
                } else if errorStep != step {
                    go(to: errorStep)
                }
            }
        }
    }

    // MARK: Chrome

    var topBar: some View {
        HStack(spacing: 12) {
            if form.isEditing && !showsOverview {
                GlassIconButton(icon: "chevron.left", label: "Alla steg", identifier: "wizard.overview") { returnToOverview() }
            } else {
                GlassIconButton(icon: "xmark", label: "Stäng", identifier: "wizard.close") { close() }
            }
            Spacer(minLength: 0)
            if form.isEditing {
                Text(showsOverview ? "Redigera recension" : step.title)
                    .font(Theme.body(16, .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            } else {
                progress
            }
            Spacer(minLength: 0)
            if !form.isEditing && step == .photo && photo == nil {
                Button("Hoppa över", action: skipPhoto)
                    .font(Theme.body(15, .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .glassEffect(.regular.interactive(), in: .capsule)
                    .accessibilityIdentifier("wizard.skip")
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    /// One dash per step. Steps that the reviewer has reached open with a tap.
    var progress: some View {
        HStack(spacing: 5) {
            ForEach(ReviewWizardStep.allCases, id: \.self) { item in
                Button {
                    if item != step { go(to: item) }
                } label: {
                    Capsule()
                        .fill(dashColor(item))
                        .frame(width: item == step ? 26 : 12, height: 5)
                        .frame(height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(item > furthest)
                .accessibilityLabel(Text("Steg \(item.rawValue + 1) av \(ReviewWizardStep.allCases.count), \(item.title)"))
                .accessibilityAddTraits(item == step ? .isSelected : [])
            }
        }
        .animation(.snappy, value: step)
    }

    func dashColor(_ item: ReviewWizardStep) -> Color {
        if form.hasErrors(in: item) { return Theme.bad }
        if item.rawValue <= step.rawValue { return Theme.amber }
        return Color.white.opacity(item <= furthest ? 0.35 : 0.16)
    }

    @ViewBuilder var bottomBar: some View {
        VStack(spacing: 10) {
            if let message = form.errorMessage {
                ErrorCard(message: message)
            }
            if form.isEditing && showsOverview {
                if form.needsReload { reloadCard }
                Button(action: save) {
                    ButtonLabel(text: "Spara", icon: "checkmark", isLoading: form.isSubmitting)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(form.isSubmitting || !form.hasChanges)
                .accessibilityIdentifier("wizard.save")
            } else if !hidesStepButtons {
                HStack(spacing: 10) {
                    if canGoBack {
                        GlassIconButton(icon: "chevron.left", label: "Tillbaka", size: 56, identifier: "wizard.back") { back() }
                    }
                    Button(action: next) {
                        ButtonLabel(text: nextLabel, icon: nextIcon, isLoading: form.isSubmitting)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(form.isSubmitting)
                    .accessibilityIdentifier(isLastStep ? "wizard.save" : "wizard.next")
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background {
            LinearGradient(colors: [Theme.bg.opacity(0), Theme.bg], startPoint: .top, endPoint: .center)
                .padding(.top, -20)
                .ignoresSafeArea()
        }
    }

    var reloadCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Någon annan har sparat recensionen efter att du öppnade den. Hämta den senaste versionen och gör dina ändringar igen.")
                .font(Theme.body(14))
                .foregroundStyle(Theme.text)
            Button {
                Task { await form.reloadLatest() }
            } label: {
                ButtonLabel(text: "Hämta senaste versionen", icon: "arrow.clockwise", isLoading: form.isReloading)
            }
            .buttonStyle(SecondaryButtonStyle(height: 44))
        }
        .padding(14)
        .cardBackground(18)
    }

    var canGoBack: Bool {
        if form.isEditing { return step == .ratings && ratingIndex > 0 }
        return step != .photo
    }

    /// A new review without a photo: the photo step has its own buttons.
    var hidesStepButtons: Bool { !form.isEditing && step == .photo && photo == nil }

    var isLastStep: Bool { !form.isEditing && step == .authors }

    var nextLabel: String {
        if step == .ratings && ratingIndex < metrics.count - 1 {
            return "Nästa: \(metrics[ratingIndex + 1].label)"
        }
        if form.isEditing { return "Klar" }
        if let following = step.next { return "Nästa: \(following.title)" }
        return "Spara utkast"
    }

    var nextIcon: String {
        if isLastStep { return "lock.fill" }
        if form.isEditing && !(step == .ratings && ratingIndex < metrics.count - 1) { return "checkmark" }
        return "arrow.right"
    }

    var restoredNote: some View {
        HStack(spacing: 10) {
            Image(systemName: "clock.arrow.circlepath").foregroundStyle(Theme.amber)
            Text("Du fortsätter där du slutade.")
                .font(Theme.body(14, .semibold))
                .foregroundStyle(.white)
            Button("Börja om") {
                form.startOver()
                photo = nil
                furthest = .photo
                go(to: .photo)
                withAnimation { showsRestoredNote = false }
            }
            .font(Theme.body(14, .bold))
            .foregroundStyle(Theme.amber)
            .accessibilityIdentifier("wizard.startOver")
        }
        .padding(.horizontal, 16)
        .frame(height: 44)
        .glassEffect(.regular, in: .capsule)
        .padding(.top, 64)
        .transition(.move(edge: .top).combined(with: .opacity))
        .task {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            withAnimation { showsRestoredNote = false }
        }
    }
}

extension ReviewWizardStep: Comparable {
    public static func < (lhs: ReviewWizardStep, rhs: ReviewWizardStep) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// A round glass button with an icon.
struct GlassIconButton: View {
    let icon: String
    let label: String
    var size: CGFloat = 44
    var identifier: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: size > 50 ? 18 : 16, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .circle)
        .accessibilityLabel(Text(label))
        .accessibilityIdentifier(identifier ?? "")
    }
}

/// The big title and the hint at the top of a step.
struct WizardTitle: View {
    let title: String
    var subtitle: String? = nil
    var size: CGFloat = 34

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Theme.title(size)).foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            if let subtitle {
                Text(subtitle).font(Theme.body(15)).foregroundStyle(Theme.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Edit mode: every step as a row with a summary. A tap opens the step.
struct WizardOverview: View {
    let form: ReviewFormModel
    let photo: UIImage?
    let open: (ReviewWizardStep) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                ForEach(ReviewWizardStep.allCases, id: \.self) { step in
                    Button { open(step) } label: { row(step) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("wizard.step.\(step)")
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .scrollIndicators(.hidden)
    }

    func row(_ step: ReviewWizardStep) -> some View {
        let hasError = form.hasErrors(in: step)
        return HStack(spacing: 12) {
            if step == .photo, let photo {
                Image(uiImage: photo).resizable().scaledToFill()
                    .frame(width: 34, height: 34)
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            } else {
                Image(systemName: hasError ? "exclamationmark" : icon(step))
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(.black)
                    .frame(width: 34, height: 34)
                    .background(hasError ? Theme.bad : Theme.amber, in: Circle())
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(step.title).font(Theme.body(16, .semibold)).foregroundStyle(.white)
                Text(summary(step)).font(Theme.body(13)).foregroundStyle(hasError ? Theme.bad : Theme.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.tertiary)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 62)
        .cardBackground(18)
        .contentShape(Rectangle())
    }

    func icon(_ step: ReviewWizardStep) -> String {
        switch step {
        case .photo: return "photo.fill"
        case .bar: return "mappin"
        case .beer: return "mug.fill"
        case .ratings: return "star.fill"
        case .text: return "text.alignleft"
        case .authors: return "person.2.fill"
        }
    }

    func summary(_ step: ReviewWizardStep) -> String {
        let draft = form.draft
        switch step {
        case .photo:
            return form.newImageData != nil ? "Ny bild" : "Nuvarande bild"
        case .bar:
            let street = draft.location.split(separator: ",").first.map(String.init) ?? draft.location
            return [draft.title, street].filter { !$0.isEmpty }.joined(separator: " · ")
        case .beer:
            let price = draft.priceKr.map { "\($0) kr\(draft.isHappyHourPrice ? "*" : "")" }
            return [form.brand, price].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        case .ratings:
            return "Viktat \(Formatting.decimal(form.weightedScore, maximumFractionDigits: 2)) av 5"
        case .text:
            let lines = draft.description.split(separator: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
            return "\(Formatting.ratingWord(form.effectiveOverallRating)) · \(lines) rader"
        case .authors:
            return Formatting.authorList(form.authorOptions.filter { draft.authors.contains($0) })
        }
    }
}
#endif
