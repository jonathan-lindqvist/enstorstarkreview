#if os(Android)
import SwiftUI
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
            Ess.bg.ignoresSafeArea()
            if let form {
                ReviewWizardView(form: form, onSaved: { saved in
                    onSaved(saved)
                    dismiss()
                }, onClose: { dismiss() })
            } else if loadFailed {
                VStack(spacing: 16) {
                    ErrorCard(message: "Kunde inte hämta formulärets uppgifter.") { await makeForm() }
                    TonalButton(text: "Stäng") { dismiss() }
                }
                .padding(16)
            } else {
                EssProgress()
            }
        }
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

/// The review wizard as a Material full-screen flow (Droid13–Droid24): a top app bar with ✕,
/// the step, and a segmented progress bar; a bottom bar with back and the next action.
///
/// A new review goes through the steps in order. An edit starts on a list of all steps
/// (the full-screen dialog pattern, with "Spara" in the top bar); a tap opens one step, and
/// "Klar" returns to the list.
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
    @State var hasStarted = false
    /// The photo to show: the new photo or the current photo of an edited review.
    @State var photo: UIImage?
    @Environment(AppModel.self) var app
    @Environment(\.scenePhase) var scenePhase

    var metrics: [RatingMetric] { form.metadata.ratingMetrics }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ZStack(alignment: .bottom) {
                if form.isEditing && showsOverview {
                    WizardOverview(form: form, photo: photo) { open($0) }
                } else {
                    // A separate identity per step, so Compose keeps no state of one step
                    // (such as an `onChange` value) for the next.
                    stepView.id(step)
                }
                if showsRestoredNote { restoredNote }
            }
            .frame(maxHeight: .infinity)
            bottomBar
        }
        .background(Ess.bg)
        .overlay {
            if isConfirmingClose { closeDialog }
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
            if newStep.rawValue > furthest.rawValue { furthest = newStep }
            form.saveLocalCopy(step: newStep)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { form.saveLocalCopy(step: step) }
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
            WizardRatingStep(form: form, index: $ratingIndex)
        case .text:
            WizardTextStep(form: form)
        case .authors:
            WizardAuthorsStep(form: form, photo: photo)
        }
    }

    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        if form.isEditing {
            showsOverview = true
            furthest = .authors
        } else if let restored = form.restoredStep {
            step = restored
            furthest = restored
            withAnimation { showsRestoredNote = true }
        }
        #if DEBUG
        // `-debugWizardStep ratings` opens a step, for checks without taps.
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
            photo = await DisplayImage.decode(data)
        } else if let path = form.existingImagePath {
            let key = ReviewImageCache.key(path: path, preview: .detail)
            if let cached = ReviewImageCache.images.object(forKey: key) {
                photo = cached
            } else if let data = try? await app.api.imageData(path: path, preview: .detail), let loaded = await DisplayImage.decode(data) {
                photo = loaded
            }
        }
    }

    func go(to target: ReviewWizardStep) {
        if target == .ratings {
            ratingIndex = target.rawValue >= step.rawValue ? 0 : max(metrics.count - 1, 0)
        }
        withAnimation { step = target }
    }

    func open(_ target: ReviewWizardStep) {
        ratingIndex = 0
        step = target
        withAnimation { showsOverview = false }
    }

    func returnToOverview() {
        withAnimation { showsOverview = true }
    }

    // MARK: Actions

    var hasNextMetric: Bool { step == .ratings && ratingIndex < metrics.count - 1 }

    func next() {
        if hasNextMetric {
            withAnimation { ratingIndex += 1 }
            return
        }
        guard form.validate(step) else { return }
        if form.isEditing {
            returnToOverview()
        } else if let following = step.next {
            go(to: following)
        } else {
            save()
        }
    }

    /// "Klar" in an edited step: checks the step and returns to the list of steps.
    func finishStep() {
        guard form.validate(step) else { return }
        returnToOverview()
    }

    func back() {
        if step == .ratings && ratingIndex > 0 {
            withAnimation { ratingIndex -= 1 }
        } else if form.isEditing {
            returnToOverview()
        } else if let previous = step.previous {
            go(to: previous)
        }
    }

    func close() {
        if form.hasChanges {
            withAnimation { isConfirmingClose = true }
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

    var isEditingStep: Bool { form.isEditing && !showsOverview }

    var topBar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                if isEditingStep {
                    TonalIconButton(icon: .back, label: "Alla steg") { finishStep() }
                        .accessibilityIdentifier("wizard.overview")
                } else {
                    TonalIconButton(icon: .close, label: "Stäng") { close() }
                        .accessibilityIdentifier("wizard.close")
                }
                if form.isEditing {
                    Text(showsOverview ? "Redigera recension" : step.title)
                        .font(Ess.titleMedium)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.leading, 8)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Ny recension").font(Ess.titleMedium).foregroundStyle(.white)
                        Text("Steg \(step.rawValue + 1) av \(ReviewWizardStep.allCases.count) · \(step.title)")
                            .font(Ess.bodySmall)
                            .foregroundStyle(Ess.secondary)
                    }
                    .padding(.leading, 8)
                }
                Spacer(minLength: 0)
                if !form.isEditing && step == .photo && photo == nil {
                    TonalButton(text: "Hoppa över", height: 40, fillsWidth: false) { go(to: .bar) }
                        .accessibilityIdentifier("wizard.skip")
                } else if form.isEditing && showsOverview {
                    if form.isSubmitting {
                        EssProgress().frame(width: 48, height: 40)
                    } else {
                        textAction("Spara", isEnabled: form.hasChanges, action: save)
                            .accessibilityIdentifier("wizard.save")
                    }
                } else if isEditingStep {
                    textAction("Klar", isEnabled: true, action: finishStep)
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 64)
            if !form.isEditing { progress }
        }
        .background(Ess.bg)
    }

    func textAction(_ title: String, isEnabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(isEnabled ? Ess.amber : Ess.tertiary)
                .padding(.horizontal, 12)
                .frame(height: 40)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }

    /// One segment per step. Steps that the reviewer has reached open with a tap.
    var progress: some View {
        HStack(spacing: 4) {
            ForEach(ReviewWizardStep.allCases, id: \.self) { item in
                Button {
                    if item != step { go(to: item) }
                } label: {
                    Capsule()
                        .fill(segmentColor(item))
                        .frame(height: 4)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .disabled(item.rawValue > furthest.rawValue)
                .accessibilityLabel(Text("Steg \(item.rawValue + 1) av \(ReviewWizardStep.allCases.count), \(item.title)"))
            }
        }
        .padding(.horizontal, 16)
    }

    func segmentColor(_ item: ReviewWizardStep) -> Color {
        if form.hasErrors(in: item) { return Ess.bad }
        if item.rawValue <= step.rawValue { return Ess.amber }
        return item.rawValue <= furthest.rawValue ? Ess.tertiary : Ess.raised3
    }

    var hidesStepButtons: Bool {
        if form.isEditing { return showsOverview || !(step == .ratings && metrics.count > 1) }
        return step == .photo && photo == nil
    }

    @ViewBuilder var bottomBar: some View {
        let showsButtons = !hidesStepButtons
        if form.errorMessage != nil || (form.isEditing && showsOverview && form.needsReload) || showsButtons {
            VStack(spacing: 10) {
                if let message = form.errorMessage {
                    ErrorCard(message: message)
                }
                if form.isEditing && showsOverview && form.needsReload {
                    reloadCard
                }
                if showsButtons {
                    HStack(spacing: 12) {
                        if canGoBack {
                            TonalIconButton(icon: .back, label: "Tillbaka", size: 56) { back() }
                                .accessibilityIdentifier("wizard.back")
                        }
                        PrimaryButton(text: nextLabel, icon: nextIcon, height: 56, isLoading: form.isSubmitting) { next() }
                            .accessibilityIdentifier(isLastStep ? "wizard.save" : "wizard.next")
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 12)
            .background(Ess.bg)
        }
    }

    var reloadCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Någon annan har sparat recensionen efter att du öppnade den. Hämta den senaste versionen och gör dina ändringar igen.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.text)
            TonalButton(text: "Hämta senaste versionen", icon: .history, height: 44, isLoading: form.isReloading) {
                Task { await form.reloadLatest() }
            }
        }
        .padding(16)
        .essCard(18)
    }

    var canGoBack: Bool {
        if form.isEditing { return step == .ratings && ratingIndex > 0 }
        return step != .photo
    }

    var isLastStep: Bool { !form.isEditing && step == .authors }

    var nextLabel: String {
        if hasNextMetric { return "Nästa: \(metrics[ratingIndex + 1].label)" }
        if form.isEditing { return "Klar" }
        if let following = step.next { return "Nästa: \(following.title)" }
        return "Spara utkast"
    }

    var nextIcon: EssIcon {
        if isLastStep { return .lock }
        if form.isEditing && !hasNextMetric { return .check }
        return .forward
    }

    var restoredNote: some View {
        EssSnackbar(text: "Du fortsätter där du slutade.", icon: .history, actionLabel: "Börja om") {
            form.startOver()
            photo = nil
            furthest = .photo
            go(to: .photo)
            withAnimation { showsRestoredNote = false }
        }
        .task {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            withAnimation { showsRestoredNote = false }
        }
    }

    /// The Material dialog for closing: keep the review on the phone, discard it, or go on.
    var closeDialog: some View {
        ZStack {
            Color.black.opacity(0.6)
                .ignoresSafeArea()
                .onTapGesture { withAnimation { isConfirmingClose = false } }
            VStack(alignment: .leading, spacing: 16) {
                Text(form.isEditing ? "Vill du slänga ändringarna?" : "Vill du stänga recensionen?")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
                if !form.isEditing {
                    Text("Recensionen finns kvar på telefonen tills du sparar den eller slänger den.")
                        .font(Ess.bodyMedium)
                        .foregroundStyle(Ess.secondary)
                }
                VStack(alignment: .trailing, spacing: 0) {
                    if form.isEditing {
                        dialogButton("Släng ändringarna", color: Ess.bad) { onClose() }
                        dialogButton("Fortsätt redigera", bold: true) { withAnimation { isConfirmingClose = false } }
                    } else {
                        dialogButton("Spara till senare") {
                            form.saveLocalCopy(step: step)
                            onClose()
                        }
                        dialogButton("Släng recensionen", color: Ess.bad) {
                            form.discardLocalCopy()
                            onClose()
                        }
                        dialogButton("Fortsätt skriva", bold: true) { withAnimation { isConfirmingClose = false } }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(24)
            .background(RoundedRectangle(cornerRadius: 28).fill(Ess.raised2))
            .padding(.horizontal, 28)
        }
    }

    func dialogButton(_ title: String, color: Color = Ess.amber, bold: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: bold ? .bold : .medium))
                .foregroundStyle(color)
                .padding(.horizontal, 12)
                .frame(height: 40)
        }
        .buttonStyle(.plain)
    }
}

/// The big title and the hint at the top of a step.
struct WizardTitle: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Ess.stepTitle).foregroundStyle(.white)
            if let subtitle {
                Text(subtitle).font(Ess.bodyLarge).foregroundStyle(Ess.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 4)
    }
}

/// Edit mode (Droid23): every step as a list item with a summary. A tap opens the step.
struct WizardOverview: View {
    let form: ReviewFormModel
    let photo: UIImage?
    let open: (ReviewWizardStep) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(ReviewWizardStep.allCases, id: \.self) { step in
                    if step != .photo {
                        Rectangle().fill(Ess.hairline).frame(height: 1).padding(.leading, 72)
                    }
                    Button { open(step) } label: { row(step) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("wizard.step.\(step)")
                }
            }
            .essCard()
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    func row(_ step: ReviewWizardStep) -> some View {
        let hasError = form.hasErrors(in: step)
        return HStack(spacing: 16) {
            if step == .photo, let photo {
                Image(uiImage: photo).resizable().scaledToFill()
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                EssIconView(hasError ? .error : icon(step), size: 20, color: .black)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(hasError ? Ess.bad : Ess.amber))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(step.title).font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                Text(summary(step)).font(Ess.bodyMedium).foregroundStyle(hasError ? Ess.bad : Ess.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            EssIconView(.chevronRight, color: Ess.secondary)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 72)
    }

    func icon(_ step: ReviewWizardStep) -> EssIcon {
        switch step {
        case .photo: return .photo
        case .bar: return .place
        case .beer: return .mug
        case .ratings: return .star
        case .text: return .notes
        case .authors: return .group
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
            return Formatting.authorList(form.authorOptions.filter { draft.authors.contains($0) }.map(Formatting.authorName))
        }
    }
}
#endif
