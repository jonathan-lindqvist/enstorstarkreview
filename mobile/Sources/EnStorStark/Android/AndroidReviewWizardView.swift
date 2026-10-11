import SwiftUI
import EnStorStarkModel

#if os(Android)
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
            Ess.surface.ignoresSafeArea()
            if let form {
                ReviewWizardView(form: form, onSaved: { saved in
                    onSaved(saved)
                    dismiss()
                }, onClose: { dismiss() })
            } else if loadFailed {
                VStack(spacing: 16) {
                    ErrorCard(message: "Kunde inte hämta formulärets uppgifter.") { await makeForm() }
                    Button("Stäng") { dismiss() }
                }
                .padding(20)
            } else {
                ProgressView()
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

/// The review wizard, as Material 3: a top app bar with the step and a segmented progress
/// bar, one question per screen, and "Tillbaka" and "Nästa" at the bottom.
///
/// A new review goes through the steps in order. An edit starts on a list of all steps (the
/// full-screen dialog pattern, with "Spara" in the top bar); a tap opens one step, and "Klar"
/// returns to the list. The rules are the same as on iOS (`ReviewFormModel`).
struct ReviewWizardView: View {
    @Bindable var form: ReviewFormModel
    let onSaved: (Tagged<Review>) -> Void
    let onClose: () -> Void

    @State var step: ReviewWizardStep = .photo
    @State var ratingIndex = 0
    @State var furthest: ReviewWizardStep = .photo
    @State var showsOverview = false
    @State var isConfirmingClose = false
    @State var restoredMessage: String?
    @State var didStart = false
    /// The photo to show: the new photo or the current photo of an edited review.
    @State var photo: UIImage?
    @Environment(AppModel.self) var app
    @Environment(\.scenePhase) var scenePhase

    var metrics: [RatingMetric] { form.metadata.ratingMetrics }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            if !form.isEditing { progress }
            Group {
                if form.isEditing && showsOverview {
                    WizardOverview(form: form, photo: photo) { open($0) }
                } else {
                    ScrollView {
                        // A new identity per step: the steps share one place in the view tree,
                        // and without it SkipUI gives one step the state of another (crash).
                        stepView
                            .id(step)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .padding(.bottom, 24)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            bottomBar
        }
        .background(Ess.surface)
        .snackbar($restoredMessage, actionLabel: "Börja om", bottom: 96) { startOver() }
        .alert(form.isEditing ? "Vill du slänga ändringarna?" : "Vill du stänga recensionen?", isPresented: $isConfirmingClose) {
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
            WizardRatingStep(form: form, index: $ratingIndex)
        case .text:
            WizardTextStep(form: form)
        case .authors:
            WizardAuthorsStep(form: form, photo: photo)
        }
    }

    func start() {
        guard !didStart else { return }
        didStart = true
        if form.isEditing {
            showsOverview = true
            furthest = .authors
        } else if let restored = form.restoredStep {
            step = restored
            furthest = restored
            restoredMessage = "Du fortsätter där du slutade."
        }
        #if DEBUG
        // `-debugWizardStep ratings` opens a step, for emulator checks without taps.
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
        } else if let path = form.existingImagePath,
                  let data = try? await app.api.imageData(path: path) {
            photo = UIImage(data: data)
        }
    }

    func go(to target: ReviewWizardStep) {
        if target == .ratings {
            ratingIndex = target.rawValue >= step.rawValue ? 0 : max(metrics.count - 1, 0)
        }
        step = target
    }

    func open(_ target: ReviewWizardStep) {
        ratingIndex = 0
        step = target
        showsOverview = false
    }

    func startOver() {
        form.startOver()
        photo = nil
        furthest = .photo
        go(to: .photo)
    }

    // MARK: Actions

    func next() {
        if step == .ratings && ratingIndex < metrics.count - 1 {
            ratingIndex += 1
            return
        }
        guard form.validate(step) else { return }
        if form.isEditing {
            showsOverview = true
        } else if let following = step.next {
            go(to: following)
        } else {
            save()
        }
    }

    func back() {
        if step == .ratings && ratingIndex > 0 {
            ratingIndex -= 1
        } else if form.isEditing {
            showsOverview = true
        } else if let previous = step.previous {
            go(to: previous)
        }
    }

    /// "Klar" in the top bar of an edited step.
    func finishStep() {
        guard form.validate(step) else { return }
        showsOverview = true
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
                    showsOverview = true
                } else if errorStep != step {
                    go(to: errorStep)
                }
            }
        }
    }

    // MARK: Chrome

    /// The small top app bar. A new review shows the step; an edit shows the dialog title.
    var topBar: some View {
        HStack(spacing: 4) {
            if form.isEditing && !showsOverview {
                iconButton("arrow_back", label: "Alla steg") { showsOverview = true }
            } else {
                iconButton("close", label: "Stäng") { close() }
            }
            VStack(alignment: .leading, spacing: 1) {
                if form.isEditing {
                    Text(showsOverview ? "Redigera recension" : step.title)
                        .font(Ess.titleLarge)
                        .foregroundStyle(Ess.onSurface)
                        .lineLimit(1)
                } else {
                    Text("Ny recension").font(Ess.titleMedium).foregroundStyle(Ess.onSurface)
                    Text(verbatim: "Steg \(step.rawValue + 1) av \(ReviewWizardStep.allCases.count) · \(step.title)")
                        .font(Ess.bodySmall)
                        .foregroundStyle(Ess.variant)
                }
            }
            Spacer(minLength: 8)
            if form.isEditing {
                if showsOverview {
                    if form.isSubmitting {
                        ProgressView().frame(width: 24, height: 24).padding(.horizontal, 16)
                    } else {
                        Button("Spara") { save() }
                            .foregroundStyle(form.hasChanges ? Ess.amber : Ess.outline)
                            .disabled(!form.hasChanges)
                            .padding(.horizontal, 12)
                    }
                } else {
                    Button("Klar") { finishStep() }
                        .foregroundStyle(Ess.amber)
                        .padding(.horizontal, 12)
                }
            } else if step == .photo && photo == nil {
                Button("Hoppa över") { go(to: .bar) }
                    .foregroundStyle(Ess.amber)
                    .padding(.horizontal, 12)
            }
        }
        .padding(.horizontal, 4)
        .frame(height: 64)
    }

    func iconButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            MIcon(icon, color: Ess.onSurface).frame(width: 48, height: 48)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    /// One segment per step. Steps that the reviewer has reached open with a tap.
    var progress: some View {
        HStack(spacing: 4) {
            ForEach(ReviewWizardStep.allCases, id: \.self) { item in
                Capsule()
                    .fill(segmentColor(item))
                    .frame(height: 4)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .onTapGesture {
                        if item != step && item.rawValue <= furthest.rawValue { go(to: item) }
                    }
                    .accessibilityLabel(Text("Steg \(item.rawValue + 1) av \(ReviewWizardStep.allCases.count), \(item.title)"))
            }
        }
        .padding(.horizontal, 16)
    }

    func segmentColor(_ item: ReviewWizardStep) -> Color {
        if form.hasErrors(in: item) { return Ess.error }
        if item.rawValue <= step.rawValue { return Ess.amber }
        return item.rawValue <= furthest.rawValue ? Ess.outline : Ess.highest
    }

    @ViewBuilder var bottomBar: some View {
        let showsStepButtons = !form.isEditing
            ? !(step == .photo && photo == nil)
            : (!showsOverview && step == .ratings && metrics.count > 1)
        if form.errorMessage != nil || (form.isEditing && showsOverview && form.needsReload) || showsStepButtons {
            VStack(spacing: 10) {
                if let message = form.errorMessage {
                    ErrorCard(message: message)
                }
                if form.isEditing && showsOverview && form.needsReload {
                    reloadCard
                }
                if showsStepButtons {
                    WizardButtons(showsBack: canGoBack, nextLabel: nextLabel, nextIcon: nextIcon,
                                  isLoading: form.isSubmitting, back: back, next: next)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Ess.container)
        }
    }

    var reloadCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Någon annan har sparat recensionen efter att du öppnade den. Hämta den senaste versionen och gör dina ändringar igen.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.onSurface)
            M3Button(text: "Hämta senaste versionen", icon: "refresh", style: .tonal, height: 44,
                     isLoading: form.isReloading) {
                Task { await form.reloadLatest() }
            }
        }
        .padding(14)
        .tonal(Ess.high, radius: 16)
    }

    var canGoBack: Bool {
        if form.isEditing { return step == .ratings && ratingIndex > 0 }
        return step != .photo || (step == .ratings && ratingIndex > 0)
    }

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
        if isLastStep { return "lock" }
        if form.isEditing && !(step == .ratings && ratingIndex < metrics.count - 1) { return "check" }
        return "arrow_forward"
    }
}

/// The big title and the hint at the top of a step.
struct StepTitle: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Ess.headlineMedium).foregroundStyle(Ess.onSurface)
            if let subtitle {
                Text(subtitle).font(Ess.bodyLarge).foregroundStyle(Ess.variant)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Edit mode: every step as a list item with a summary, in one card. A tap opens the step.
struct WizardOverview: View {
    let form: ReviewFormModel
    let photo: UIImage?
    let open: (ReviewWizardStep) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(ReviewWizardStep.allCases, id: \.self) { step in
                    if step != .photo {
                        Rectangle().fill(Ess.outlineVariant).frame(height: 1).padding(.leading, 72)
                    }
                    Button { open(step) } label: { row(step) }
                        .buttonStyle(.plain)
                }
            }
            .tonal(Ess.low, radius: 24)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
    }

    func row(_ step: ReviewWizardStep) -> some View {
        let hasError = form.hasErrors(in: step)
        return HStack(spacing: 16) {
            if step == .photo, let photo, !hasError {
                LocalPhoto(image: photo, focusX: form.draft.focusX, focusY: form.draft.focusY)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                MIcon(hasError ? "error" : icon(step), size: 20, color: hasError ? Ess.onAmber : Ess.onAmberContainer)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(hasError ? Ess.error : Ess.amberContainer))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(step.title).font(Ess.titleMedium).foregroundStyle(Ess.onSurface)
                Text(verbatim: summary(step))
                    .font(Ess.bodyMedium)
                    .foregroundStyle(hasError ? Ess.error : Ess.variant)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            MIcon("chevron_right", size: 20, color: Ess.variant)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 72)
    }

    func icon(_ step: ReviewWizardStep) -> String {
        switch step {
        case .photo: return "image"
        case .bar: return "place"
        case .beer: return "beer"
        case .ratings: return "star"
        case .text: return "notes"
        case .authors: return "group"
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
            return [form.brand, price ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
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
