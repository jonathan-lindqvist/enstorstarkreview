import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
import SkipKit
import EnStorStarkModel

/// Presents the review form in a sheet. It creates the form model when the metadata is ready.
struct ReviewFormSheet: View {
    /// Nil creates a new draft.
    let editing: Tagged<Review>?
    let onSaved: (Tagged<Review>) -> Void
    @Environment(AppModel.self) var app
    @Environment(\.dismiss) var dismiss
    @State var form: ReviewFormModel?
    @State var loadFailed = false

    var body: some View {
        NavigationStack {
            Group {
                if let form {
                    ReviewFormView(form: form) { saved in
                        onSaved(saved)
                        dismiss()
                    }
                } else if loadFailed {
                    VStack(spacing: 16) {
                        ErrorBanner(message: "Kunde inte hämta formulärets uppgifter.") {
                            await makeForm()
                        }
                        Button("Stäng") { dismiss() }
                    }
                    .padding()
                } else {
                    ProgressView()
                }
            }
        }
        .task {
            await makeForm()
        }
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

/// A plain form that covers every field of a review. Server errors appear next to the field
/// that the problem pointer names.
struct ReviewFormView: View {
    @Bindable var form: ReviewFormModel
    let onSaved: (Tagged<Review>) -> Void
    @Environment(\.dismiss) var dismiss
    @State var isConfirmingDiscard = false

    var body: some View {
        Form {
            if form.errorMessage != nil || !form.unplacedErrors.isEmpty {
                FormErrorSection(form: form)
            }
            ReviewImageSection(form: form)
            barSection
            beerSection
            ratingSection
            overallSection
            descriptionSection
            authorSection
        }
        .navigationTitle(form.isEditing ? "Redigera recension" : "Ny recension")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Avbryt") {
                    if form.hasChanges {
                        isConfirmingDiscard = true
                    } else {
                        dismiss()
                    }
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                if form.isSubmitting {
                    ProgressView()
                } else {
                    Button(form.isEditing ? "Spara" : "Spara utkast") {
                        Task {
                            if let saved = await form.submit() {
                                onSaved(saved)
                            }
                        }
                    }
                }
            }
        }
        .confirmationDialog("Vill du slänga ändringarna?", isPresented: $isConfirmingDiscard, titleVisibility: .visible) {
            Button("Släng ändringarna", role: .destructive) { dismiss() }
            Button("Fortsätt redigera", role: .cancel) {}
        }
        .interactiveDismissDisabled(form.hasChanges)
        .disabled(form.isReloading)
    }

    var barSection: some View {
        Section {
            TextField("Barens namn", text: $form.draft.title)
                .textInputAutocapitalization(.words)
            FieldError(message: form.error(for: "/title"))
            TextField("Adress", text: $form.draft.location)
                .textInputAutocapitalization(.words)
            FieldError(message: form.error(for: "/location"))
            TextField("Länk (valfritt)", text: $form.draft.slug)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            FieldError(message: form.error(for: "/slug"))
        } header: {
            Text("Bar")
        } footer: {
            Text(form.isEditing
                ? "Länken är recensionens adress på webben. Töm fältet för att skapa en ny länk från namnet."
                : "Länken är recensionens adress på webben. Lämna fältet tomt för att skapa den från namnet.")
        }
    }

    var beerSection: some View {
        Section("Stor stark") {
            Picker("Märke", selection: $form.draft.brandChoice) {
                Text("Välj märke").tag("")
                ForEach(form.metadata.beerBrands, id: \.self) { brand in
                    Text(brand).tag(brand)
                }
                Text("Annat märke").tag(ReviewFormModel.otherBrand)
            }
            if form.draft.brandChoice == ReviewFormModel.otherBrand {
                TextField("Märkets namn", text: $form.draft.customBrand)
                    .textInputAutocapitalization(.words)
            }
            FieldError(message: form.error(for: "/beer/brand"))
            HStack {
                TextField("Pris", text: $form.draft.priceText)
                    .keyboardType(.numberPad)
                Text("kr")
                    .foregroundStyle(.secondary)
            }
            FieldError(message: form.error(for: "/beer/priceKr"))
            Toggle("Happy hour-pris", isOn: $form.draft.isHappyHourPrice)
            FieldError(message: form.error(for: "/beer/isHappyHourPrice"))
        }
    }

    var ratingSection: some View {
        Section("Betyg") {
            ForEach(form.metadata.ratingMetrics, id: \.key) { metric in
                VStack(alignment: .leading, spacing: 6) {
                    Text(metric.label)
                        .font(.headline)
                    Text(metric.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Picker(metric.label, selection: ratingBinding(metric.key)) {
                        // Array, not a ClosedRange: SkipSwiftUI on Android crashes on ForEach over
                        // a ClosedRange (it casts the range index to Int).
                        ForEach(Array(0...5), id: \.self) { value in
                            Text(verbatim: "\(value)").tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    FieldError(message: form.error(for: "/ratings/\(metric.key.rawValue)"))
                }
                .padding(.vertical, 4)
            }
        }
    }

    var overallSection: some View {
        Section {
            Picker("Helhetsbetyg", selection: $form.draft.overallRating) {
                Text("Förslag: \(form.suggestedOverallRating)/3").tag(Int?.none)
                ForEach(Array(form.metadata.overallRating.minimum...form.metadata.overallRating.maximum), id: \.self) { value in
                    Text(verbatim: "\(value)/3").tag(Int?.some(value))
                }
            }
            FieldError(message: form.error(for: "/overallRating"))
        } header: {
            Text("Helhetsbetyg")
        } footer: {
            Text("Förslaget kommer från de viktade betygen (\(Formatting.decimal(form.weightedScore, maximumFractionDigits: 2)) poäng). Du kan välja ett annat betyg.")
        }
    }

    var descriptionSection: some View {
        Section {
            TextEditor(text: $form.draft.description)
                .frame(minHeight: 160)
            FieldError(message: form.error(for: "/description"))
        } header: {
            Text("Recension")
        } footer: {
            Text("Du kan använda Markdown: rubriker (#), listor (-) och **fetstil**.")
        }
    }

    var authorSection: some View {
        Section("Författare") {
            ForEach(form.authorOptions, id: \.self) { name in
                Toggle(Formatting.authorName(name), isOn: authorBinding(name))
            }
            FieldError(message: form.error(for: "/authors"))
        }
    }

    func ratingBinding(_ key: RatingKey) -> Binding<Int> {
        Binding(
            get: { form.draft.ratings[key] ?? 0 },
            set: { form.draft.ratings[key] = $0 }
        )
    }

    func authorBinding(_ name: String) -> Binding<Bool> {
        Binding(
            get: { form.draft.authors.contains(name) },
            set: { isOn in
                if isOn {
                    form.draft.authors.insert(name)
                } else {
                    form.draft.authors.remove(name)
                }
            }
        )
    }
}

struct FormErrorSection: View {
    let form: ReviewFormModel

    var body: some View {
        Section {
            if let message = form.errorMessage {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.red)
            }
            ForEach(form.unplacedErrors, id: \.self) { message in
                Text(message)
                    .foregroundStyle(Color.red)
            }
            if form.needsReload {
                Text("Någon annan har sparat recensionen efter att du öppnade den. Hämta den senaste versionen och gör dina ändringar igen.")
                    .font(.subheadline)
                Button {
                    Task { await form.reloadLatest() }
                } label: {
                    HStack {
                        Text("Hämta senaste versionen")
                        if form.isReloading {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
            }
        }
    }
}

/// Photo selection and the focus point. Tap the photo to choose the point that crops keep.
struct ReviewImageSection: View {
    let form: ReviewFormModel
    @Environment(AppModel.self) var app
    @State var displayImage: Image?
    @State var pickedURL: URL?
    @State var isPickingFromLibrary = false
    @State var isTakingPhoto = false
    @State var isProcessing = false

    var body: some View {
        Section {
            if let displayImage {
                FocusPicker(
                    image: displayImage,
                    focusX: Bindable(form).draft.focusX,
                    focusY: Bindable(form).draft.focusY
                )
                Color.clear
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .overlay {
                        FocusedFill(image: displayImage, focusX: form.draft.focusX, focusY: form.draft.focusY)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if isProcessing || form.existingImagePath != nil {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
            FieldError(message: form.error(for: "/image", "/image/data", "/image/contentType", "/imageFocus", "/imageFocus/x", "/imageFocus/y"))

            Button {
                isPickingFromLibrary = true
            } label: {
                SymbolLabel(displayImage == nil ? "Välj bild" : "Byt bild", systemImage: Symbol.pickImage)
            }
            .withMediaPicker(type: .library, isPresented: $isPickingFromLibrary, selectedImageURL: $pickedURL)

            Button {
                isTakingPhoto = true
            } label: {
                SymbolLabel("Ta foto", systemImage: Symbol.takePhoto)
            }
            .withMediaPicker(type: .camera, isPresented: $isTakingPhoto, selectedImageURL: $pickedURL)
        } header: {
            Text("Bild")
        } footer: {
            if displayImage != nil {
                Text("Tryck på bilden för att välja vad som ska synas när den beskärs.")
            }
        }
        .task {
            await loadExistingImage()
        }
        .onChange(of: pickedURL) { _, url in
            if let url {
                usePickedImage(url)
            }
        }
    }

    func loadExistingImage() async {
        guard displayImage == nil, let path = form.existingImagePath,
              let data = try? await app.api.imageData(path: path),
              let uiImage = UIImage(data: data) else { return }
        displayImage = Image(uiImage: uiImage)
    }

    func usePickedImage(_ url: URL) {
        isProcessing = true
        defer { isProcessing = false }
        guard let prepared = ReviewImageProcessing.prepare(fileURL: url) else {
            return
        }
        form.setImage(data: prepared.jpeg, contentType: .imageJpeg)
        form.draft.focusX = 50
        form.draft.focusY = 50
        displayImage = Image(uiImage: prepared.preview)
    }
}

/// The whole photo with a marker on the focus point. A tap moves the focus point.
struct FocusPicker: View {
    let image: Image
    @Binding var focusX: Double
    @Binding var focusY: Double
    @State var size: CGSize = .zero

    var body: some View {
        image
            .resizable()
            .scaledToFit()
            .onGeometryChange(for: CGSize.self) { $0.size } action: { size = $0 }
            .overlay(alignment: .topLeading) {
                Circle()
                    .stroke(Color.white, lineWidth: 3)
                    .background(Circle().fill(Color.accentColor.opacity(0.35)))
                    .frame(width: 28, height: 28)
                    .shadow(radius: 2)
                    .position(x: size.width * focusX / 100, y: size.height * focusY / 100)
                    .allowsHitTesting(false)
            }
            .onTapGesture { location in
                guard size.width > 0, size.height > 0 else { return }
                focusX = min(max(location.x / size.width * 100, 0), 100)
                focusY = min(max(location.y / size.height * 100, 0), 100)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityLabel(Text("Bildens fokuspunkt"))
    }
}
