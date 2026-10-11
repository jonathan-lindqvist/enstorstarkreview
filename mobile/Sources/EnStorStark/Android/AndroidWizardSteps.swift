import SwiftUI
import SkipKit
import EnStorStarkModel

#if os(Android)
// MARK: Step 1: Bild

/// Step 1: take or choose a photo, then move the square that the feed card shows.
struct WizardPhotoStep: View {
    @Bindable var form: ReviewFormModel
    @Binding var photo: UIImage?
    @State var isPickingFromLibrary = false
    @State var isTakingPhoto = false
    @State var pickedURL: URL?
    @State var isProcessing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let photo {
                StepTitle(title: "Välj utsnitt", subtitle: "Dra rutan. Det som syns i den blir kortet i flödet.")
                PhotoCropper(image: photo, focusX: $form.draft.focusX, focusY: $form.draft.focusY)
                HStack(spacing: 12) {
                    M3Button(text: "Ta nytt", icon: "camera", style: .outlined, height: 48) { isTakingPhoto = true }
                    M3Button(text: "Välj en annan", icon: "library", style: .outlined, height: 48) { isPickingFromLibrary = true }
                }
            } else {
                StepTitle(title: "Börja med en bild", subtitle: "Få med baren. Bilden blir kortet i flödet.")
                ZStack {
                    RoundedRectangle(cornerRadius: 28).fill(Ess.low)
                    CropCorners()
                        .stroke(Ess.amber, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(2)
                    // An edited review shows a spinner until its current photo has loaded.
                    if isProcessing || (form.newImageData == nil && form.existingImagePath != nil) {
                        ProgressView()
                    } else {
                        MIcon("camera", size: 64, color: Ess.onSurface.opacity(0.25))
                    }
                }
                .aspectRatio(1, contentMode: .fit)
                M3Button(text: "Ta foto", icon: "camera", height: 56) { isTakingPhoto = true }
                M3Button(text: "Välj från biblioteket", icon: "library", style: .tonal, height: 56) { isPickingFromLibrary = true }
            }
            FieldMessage(message: form.error(for: "/image", "/image/data", "/image/contentType", "/imageFocus", "/imageFocus/x", "/imageFocus/y"))
        }
        // One picker for each view: two pickers on one view present only one of them.
        .background { Color.clear.withMediaPicker(type: .library, isPresented: $isPickingFromLibrary, selectedImageURL: $pickedURL) }
        .background { Color.clear.withMediaPicker(type: .camera, isPresented: $isTakingPhoto, selectedImageURL: $pickedURL) }
        .onChange(of: pickedURL) { _, url in
            if let url { usePickedImage(url) }
        }
    }

    func usePickedImage(_ url: URL) {
        isProcessing = true
        defer { isProcessing = false }
        guard let prepared = ReviewImageProcessing.prepare(fileURL: url) else { return }
        form.setImage(data: prepared.jpeg, contentType: .imageJpeg)
        form.draft.focusX = 50
        form.draft.focusY = 50
        photo = prepared.preview
    }
}

/// The whole photo with the square crop of the feed card lit and the rest dimmed. Drag to move
/// the square. The focus point uses the same rule as `FocusedFill`.
struct PhotoCropper: View {
    let image: UIImage
    @Binding var focusX: Double
    @Binding var focusY: Double
    @State var dragStart: CGPoint?

    var aspect: CGFloat {
        image.size.height > 0 ? image.size.width / image.size.height : 1
    }

    var body: some View {
        Color.clear
            .aspectRatio(aspect, contentMode: .fit)
            .overlay {
                Image(uiImage: image).resizable().scaledToFill()
            }
            .overlay {
                GeometryReader { proxy in cropOverlay(size: proxy.size) }
            }
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .accessibilityLabel(Text("Bildutsnitt"))
    }

    func cropOverlay(size: CGSize) -> some View {
        let side = min(size.width, size.height)
        let slackX = size.width - side
        let slackY = size.height - side
        let x = slackX * focusX / 100
        let y = slackY * focusY / 100
        let dim = Color.black.opacity(0.6)
        return ZStack(alignment: .topLeading) {
            // Four dim bands around the square.
            dim.frame(width: size.width, height: y)
            dim.frame(width: size.width, height: max(size.height - y - side, 0)).offset(y: y + side)
            dim.frame(width: x, height: side).offset(y: y)
            dim.frame(width: max(size.width - x - side, 0), height: side).offset(x: x + side, y: y)
            CropCorners()
                .stroke(Ess.amber, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: side - 8, height: side - 8)
                .offset(x: x + 4, y: y + 4)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .gesture(DragGesture(minimumDistance: 0)
            .onChanged { drag in
                let start = dragStart ?? CGPoint(x: x, y: y)
                if dragStart == nil { dragStart = start }
                if slackX > 1 {
                    focusX = min(max((start.x + drag.translation.width) / slackX, 0), 1) * 100
                }
                if slackY > 1 {
                    focusY = min(max((start.y + drag.translation.height) / slackY, 0), 1) * 100
                }
            }
            .onEnded { _ in dragStart = nil })
    }
}

/// Four rounded corner brackets, like a camera guide.
struct CropCorners: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let length = min(34, rect.width / 4)
        let radius = min(24, rect.width / 6)
        path.move(to: CGPoint(x: rect.minX, y: rect.minY + radius + length))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        path.addQuadCurve(to: CGPoint(x: rect.minX + radius, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + radius + length, y: rect.minY))
        path.move(to: CGPoint(x: rect.maxX - radius - length, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + radius), control: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + radius + length))
        path.move(to: CGPoint(x: rect.maxX, y: rect.maxY - radius - length))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addQuadCurve(to: CGPoint(x: rect.maxX - radius, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX - radius - length, y: rect.maxY))
        path.move(to: CGPoint(x: rect.minX + radius + length, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - radius), control: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - radius - length))
        return path
    }
}

// MARK: Step 2: Bar

/// Step 2: the bar's name and address, and what the bar has (quiz, darts, …).
struct WizardBarStep: View {
    @Bindable var form: ReviewFormModel
    let photo: UIImage?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let photo {
                HStack(spacing: 12) {
                    LocalPhoto(image: photo, focusX: form.draft.focusX, focusY: form.draft.focusY)
                        .frame(width: 52, height: 52)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(alignment: .bottomTrailing) {
                            MIcon("check", size: 14, color: Ess.onAmber)
                                .frame(width: 20, height: 20)
                                .background(Circle().fill(Ess.amber))
                                .offset(x: 6, y: 6)
                        }
                    Text("Bilden är klar").font(Ess.labelLarge).foregroundStyle(Ess.variant)
                }
                .padding(.bottom, 4)
            }
            StepTitle(title: "Var är ni?")
            TextField("Barens namn", text: $form.draft.title)
                .font(Ess.titleLarge)
                .textContentType(.organizationName)
                .textInputAutocapitalization(.words)
            FieldMessage(message: form.error(for: "/title"))
            TextField("Adress", text: $form.draft.location)
                .font(Ess.titleLarge)
                .textContentType(.fullStreetAddress)
                .textInputAutocapitalization(.words)
            Text("Skriv gatan, postnumret och orten. Adressen hamnar på kartan när recensionen publiceras.")
                .font(Ess.bodySmall)
                .foregroundStyle(Ess.variant)
            FieldMessage(message: form.error(for: "/location"))
            attributes
            if form.isEditing {
                SectionLabel(text: "Länk").padding(.top, 8)
                TextField("Länk", text: $form.draft.slug)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Text("Recensionens adress på webben. Töm fältet för att skapa en ny länk från namnet.")
                    .font(Ess.bodySmall)
                    .foregroundStyle(Ess.variant)
                FieldMessage(message: form.error(for: "/slug"))
            }
        }
    }

    @ViewBuilder var attributes: some View {
        let options = form.metadata.barAttributes
        if !options.isEmpty {
            SectionLabel(text: "Finns på stället").padding(.top, 12)
            ChipFlow(labels: options.map(\.label),
                     selected: options.map { form.draft.attributes.contains($0.key) },
                     icons: .add) { index in
                let key = options[index].key
                if form.draft.attributes.contains(key) {
                    form.draft.attributes.remove(key)
                } else {
                    form.draft.attributes.insert(key)
                }
            }
            FieldMessage(message: form.error(for: "/attributes"))
        }
    }
}

// MARK: Step 3: Stor stark

/// Step 3: the price on a ruler, happy hour, and the brand.
struct WizardBeerStep: View {
    @Bindable var form: ReviewFormModel

    var limits: ReviewMetadata.LimitsPayload { form.metadata.limits }
    var priceRange: ClosedRange<Int> { limits.beerPriceMinKr...max(limits.beerPriceMinKr, limits.beerPriceMaxKr) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            StepTitle(title: "Stor stark", subtitle: "Vad kostade den, och vilket märke var det?")
            price
            happyHour
            brands
        }
    }

    var price: some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                stepButton("−", label: "En krona mindre") { change(by: -1) }
                Spacer(minLength: 0)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(verbatim: form.draft.priceKr.map(String.init) ?? "–").font(Ess.num(80))
                    Text(verbatim: form.draft.isHappyHourPrice ? "kr*" : "kr").font(Ess.num(28))
                }
                .foregroundStyle(form.draft.priceKr == nil ? Ess.outline : Ess.amber)
                Spacer(minLength: 0)
                stepButton("+", label: "En krona mer") { change(by: 1) }
            }
            PriceRuler(price: $form.draft.priceKr, range: priceRange)
            if form.draft.priceKr == nil {
                Text("Dra i linjalen för att välja priset").font(Ess.bodySmall).foregroundStyle(Ess.variant)
            }
            FieldMessage(message: form.error(for: "/beer/priceKr"))
        }
    }

    func stepButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: symbol)
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(Ess.onSurface)
                .frame(width: 48, height: 48)
                .background(Circle().fill(Ess.high))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    func change(by amount: Int) {
        let current = form.draft.priceKr ?? min(max(70, priceRange.lowerBound), priceRange.upperBound)
        form.draft.priceKr = min(max(current + amount, priceRange.lowerBound), priceRange.upperBound)
    }

    var happyHour: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: $form.draft.isHappyHourPrice) {
                HStack(spacing: 14) {
                    MIcon("schedule", size: 24, color: Ess.amber)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Happy hour-pris").font(Ess.titleMedium).foregroundStyle(Ess.onSurface)
                        Text("Visas med * och räknas i statistiken").font(Ess.bodySmall).foregroundStyle(Ess.variant)
                    }
                }
            }
            .padding(16)
            .tonal(Ess.low, radius: 20)
            FieldMessage(message: form.error(for: "/beer/isHappyHourPrice"))
        }
    }

    var brands: some View {
        let brands = form.metadata.beerBrands
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Märke")
            ChipFlow(labels: brands + ["Annat märke…"],
                     selected: brands.map { form.draft.brandChoice == $0 } + [form.draft.brandChoice == ReviewFormModel.otherBrand]) { index in
                form.draft.brandChoice = index < brands.count ? brands[index] : ReviewFormModel.otherBrand
            }
            if form.draft.brandChoice == ReviewFormModel.otherBrand {
                TextField("Märkets namn", text: $form.draft.customBrand)
                    .textInputAutocapitalization(.words)
            }
            FieldMessage(message: form.error(for: "/beer/brand"))
        }
    }
}

// MARK: Step 4: Betyg

/// Step 4: one card per aspect, with a dial and the 0–5 segmented buttons below.
struct WizardRatingStep: View {
    @Bindable var form: ReviewFormModel
    @Binding var index: Int

    var metrics: [RatingMetric] { form.metadata.ratingMetrics }

    var body: some View {
        if metrics.isEmpty {
            EmptyState(icon: "star", title: "Inga betyg att sätta")
        } else {
            let metric = metrics[min(index, metrics.count - 1)]
            let current = form.draft.ratings[metric.key] ?? 0
            VStack(spacing: 16) {
                header
                VStack(spacing: 4) {
                    Text(metric.label).font(Ess.headlineMedium).foregroundStyle(Ess.onSurface)
                    Text(metric.description)
                        .font(Ess.bodyMedium)
                        .foregroundStyle(Ess.variant)
                        .multilineTextAlignment(.center)
                    RatingDial(value: binding(metric.key), icon: Ess.icon(for: metric.key))
                        .accessibilityLabel(Text(metric.label))
                    HStack(alignment: .lastTextBaseline, spacing: 10) {
                        Text(verbatim: "\(current)").font(Ess.num(56)).foregroundStyle(Ess.amber)
                        Text(RatingWords.word(metric.key, current))
                            .font(Ess.headlineSmall)
                            .foregroundStyle(Ess.onSurface)
                            .lineLimit(1)
                        Spacer()
                        Text("av 5").font(Ess.bodySmall).foregroundStyle(Ess.variant)
                    }
                    .padding(.horizontal, 8)
                }
                .padding(20)
                .tonal(Ess.high, radius: 28)
                Picker(metric.label, selection: binding(metric.key)) {
                    // Array, not a ClosedRange: SkipSwiftUI on Android crashes on ForEach over
                    // a ClosedRange.
                    ForEach(Array(0...5), id: \.self) { value in
                        Text(verbatim: "\(value)").tag(value)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                FieldMessage(message: form.error(for: "/ratings/\(metric.key.rawValue)"))
            }
        }
    }

    var header: some View {
        HStack(spacing: 8) {
            Text("Betyg \(index + 1) av \(metrics.count)").font(Ess.labelLarge).foregroundStyle(Ess.variant)
            Spacer()
            ForEach(Array(metrics.enumerated()), id: \.offset) { position, item in
                Circle()
                    .fill(position < index ? Ess.amber : (position == index ? Ess.onSurface : Ess.highest))
                    .frame(width: 8, height: 8)
                    .padding(4)
                    .onTapGesture { index = position }
                    .accessibilityLabel(Text("\(item.label), \(form.draft.ratings[item.key] ?? 0) av 5"))
            }
        }
    }

    func binding(_ key: RatingKey) -> Binding<Int> {
        Binding(get: { form.draft.ratings[key] ?? 0 }, set: { form.draft.ratings[key] = $0 })
    }
}

// MARK: Step 5: Helhet & text

/// Step 5: the overall rating (the suggestion from the aspects is only the start value) and the
/// review text with a preview.
struct WizardTextStep: View {
    @Bindable var form: ReviewFormModel
    @State var isPreviewing = false
    @FocusState var isEditorFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            OverallRatingPicker(form: form)
                .padding(16)
                .tonal(Ess.low, radius: 24)
            // No format buttons and no list continuation: when Swift changes the text, the
            // Compose text field keeps its old cursor position, so inserted text lands elsewhere.
            Text("Recension").font(Ess.titleLarge).foregroundStyle(Ess.onSurface)
            Picker("Läge", selection: $isPreviewing) {
                Text("Skriv").tag(false)
                Text("Förhandsvisa").tag(true)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            if isPreviewing {
                Group {
                    if form.draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Inget att visa än.").font(Ess.bodyLarge).foregroundStyle(Ess.outline)
                    } else {
                        ReviewDescriptionView(source: form.draft.description)
                            .foregroundStyle(Ess.onSurface)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 220, alignment: .topLeading)
                .padding(16)
                .tonal(Ess.low, radius: 16)
            } else {
                // TextEditor fills its frame; the outline is drawn here, amber while it has focus.
                TextEditor(text: $form.draft.description)
                    .font(Ess.bodyLarge)
                    .focused($isEditorFocused)
                    .frame(height: 260)
                    .overlay(alignment: .topLeading) {
                        if form.draft.description.isEmpty {
                            Text(verbatim: "- Öppen lokal med fin inredning\n- Lugnt nog att prata")
                                .font(Ess.bodyLarge)
                                .foregroundStyle(Ess.outline)
                                .padding(16)
                                .allowsHitTesting(false)
                        }
                    }
                    .overlay(RoundedRectangle(cornerRadius: 4)
                        .stroke(form.error(for: "/description") != nil ? Ess.error : (isEditorFocused ? Ess.amber : Ess.outline),
                                lineWidth: isEditorFocused ? 2 : 1))
            }
            Text("En rad i taget. Börja raden med - för en punktlista. Finputsa hemma.")
                .font(Ess.bodySmall)
                .foregroundStyle(Ess.variant)
            FieldMessage(message: form.error(for: "/description"))
        }
    }
}

/// Three large stars. A tap on the current rating sets it to 0.
struct OverallRatingPicker: View {
    @Bindable var form: ReviewFormModel

    var body: some View {
        let shown = form.effectiveOverallRating
        let suggested = form.suggestedOverallRating
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                ForEach(0..<3, id: \.self) { star in
                    MIcon(star < shown ? "star" : "star_outline", size: 52,
                          color: star < shown ? Ess.amber : Ess.onSurface.opacity(0.25))
                        .frame(width: 64, height: 64)
                        .onTapGesture { set(shown == star + 1 ? 0 : star + 1) }
                        .accessibilityLabel(Text("\(star + 1) av 3"))
                }
            }
            Text(Formatting.ratingWord(shown)).font(Ess.headlineSmall).foregroundStyle(Ess.onSurface)
            if form.draft.overallRating == nil {
                Text(verbatim: "Förslag från betygen: \(Formatting.decimal(form.weightedScore, maximumFractionDigits: 2)) poäng. Tryck för att ändra.")
                    .font(Ess.bodySmall)
                    .foregroundStyle(Ess.variant)
                    .multilineTextAlignment(.center)
            } else {
                HStack(spacing: 4) {
                    Text(verbatim: "Ändrat från förslaget, \(suggested)/3.").font(Ess.bodySmall).foregroundStyle(Ess.variant)
                    Button { form.draft.overallRating = nil } label: {
                        Text("Använd förslaget").font(Ess.bodySmall.weight(.bold)).foregroundStyle(Ess.amber)
                    }
                    .buttonStyle(.plain)
                }
            }
            FieldMessage(message: form.error(for: "/overallRating"))
        }
        .frame(maxWidth: .infinity)
    }

    func set(_ value: Int) {
        form.draft.overallRating = value == form.suggestedOverallRating ? nil : value
    }
}

// MARK: Step 6: Vem

/// Step 6: who was there, and a preview of the feed card.
struct WizardAuthorsStep: View {
    @Bindable var form: ReviewFormModel
    let photo: UIImage?

    var selected: [String] { form.authorOptions.filter { form.draft.authors.contains($0) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            StepTitle(title: "Vilka var där?", subtitle: "Alla som du väljer står som författare.")
            ChipFlow(labels: form.authorOptions.map { $0 == form.currentUser ? "Du (\(Formatting.authorName($0)))" : Formatting.authorName($0) },
                     selected: form.authorOptions.map { form.draft.authors.contains($0) },
                     icons: .add) { index in
                let name = form.authorOptions[index]
                if form.draft.authors.contains(name) {
                    form.draft.authors.remove(name)
                } else {
                    form.draft.authors.insert(name)
                }
            }
            Text(verbatim: selected.isEmpty ? "Välj minst en författare." : "\(Formatting.authorList(selected)) står som författare.")
                .font(Ess.bodySmall)
                .foregroundStyle(selected.isEmpty ? Ess.error : Ess.variant)
            FieldMessage(message: form.error(for: "/authors"))
            HStack {
                SectionLabel(text: "Så ser den ut i flödet")
                Spacer()
                if form.isDraft {
                    Text("Bara inloggade ser utkast").font(Ess.bodySmall).foregroundStyle(Ess.variant)
                }
            }
            .padding(.top, 8)
            preview
        }
    }

    var preview: some View {
        let draft = form.draft
        return ReviewCardLayout(
            rating: form.effectiveOverallRating,
            title: draft.title.isEmpty ? "Barens namn" : draft.title,
            excerpt: ReviewMarkdown.plainText(draft.description),
            authors: selected,
            brand: form.brand.isEmpty ? "Märke" : form.brand,
            street: draft.location.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? draft.location,
            priceKr: draft.priceKr,
            isHappyHour: draft.isHappyHourPrice,
            isDraft: form.isDraft
        ) {
            if let photo {
                LocalPhoto(image: photo, focusX: draft.focusX, focusY: draft.focusY)
            } else {
                PhotoPlaceholder()
            }
        }
        .allowsHitTesting(false)
    }
}
#endif
