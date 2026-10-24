#if os(Android)
import SwiftUI
import SkipKit
import EnStorStarkModel

// MARK: Step 1: Bild

/// Step 1 (Droid13, Droid14): take or choose a photo, then move the square that the feed card
/// shows.
struct WizardPhotoStep: View {
    @Bindable var form: ReviewFormModel
    @Binding var photo: UIImage?
    @State var isPickingFromLibrary = false
    @State var isTakingPhoto = false
    @State var pickedURL: URL?
    @State var isProcessing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let photo {
                    WizardTitle(title: "Välj utsnitt", subtitle: "Dra rutan. Det som syns i den blir kortet i flödet.")
                    PhotoCropper(image: photo, focusX: $form.draft.focusX, focusY: $form.draft.focusY)
                    HStack(spacing: 10) {
                        TonalButton(text: "Ta nytt", icon: .camera) { isTakingPhoto = true }
                            .accessibilityIdentifier("wizard.photo.camera")
                        TonalButton(text: "Välj en annan", icon: .library) { isPickingFromLibrary = true }
                            .accessibilityIdentifier("wizard.photo.library")
                    }
                } else {
                    emptyState
                }
                FieldError(message: form.error(for: "/image", "/image/data", "/image/contentType", "/imageFocus", "/imageFocus/x", "/imageFocus/y"))
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 16)
        }
        // One picker for each view: two pickers on one view present only one of them.
        .background { Color.clear.withMediaPicker(type: .library, isPresented: $isPickingFromLibrary, selectedImageURL: $pickedURL) }
        .background { Color.clear.withMediaPicker(type: .camera, isPresented: $isTakingPhoto, selectedImageURL: $pickedURL) }
        .onChange(of: pickedURL) { _, url in
            if let url { usePickedImage(url) }
        }
    }

    var emptyState: some View {
        VStack(spacing: 20) {
            WizardTitle(title: "Börja med en bild", subtitle: "Få med baren. Bilden blir kortet i flödet.")
            // Overlays on the sized card: in a ZStack sized by `aspectRatio`, Skip gave the
            // stroked corners no height.
            RoundedRectangle(cornerRadius: 28).fill(Ess.raised)
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    CropCorners().stroke(Ess.amber, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .padding(2)
                }
                .overlay {
                    if isProcessing {
                        EssProgress()
                    } else {
                        EssIconView(.camera, size: 64, color: Ess.secondary.opacity(0.4))
                    }
                }
            VStack(spacing: 10) {
                PrimaryButton(text: "Ta foto", leadingIcon: .camera, height: 56) { isTakingPhoto = true }
                    .accessibilityIdentifier("wizard.photo.camera")
                TonalButton(text: "Välj från biblioteket", icon: .library, height: 56) { isPickingFromLibrary = true }
                    .accessibilityIdentifier("wizard.photo.library")
            }
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
        Image(uiImage: image)
            .resizable()
            .aspectRatio(aspect, contentMode: .fit)
            .overlay { GeometryReader { proxy in cropOverlay(size: proxy.size) } }
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .frame(maxWidth: .infinity, maxHeight: 460)
            .accessibilityLabel(Text("Bildutsnitt"))
            .accessibilityIdentifier("wizard.photo.crop")
    }

    func cropOverlay(size: CGSize) -> some View {
        let side = min(size.width, size.height)
        let slack = CGSize(width: size.width - side, height: size.height - side)
        let crop = CGRect(x: slack.width * focusX / 100, y: slack.height * focusY / 100, width: side, height: side)
        return ZStack(alignment: .topLeading) {
            Path { path in
                path.addRect(CGRect(origin: .zero, size: size))
                path.addRoundedRect(in: crop, cornerSize: CGSize(width: 22, height: 22))
            }
            .fill(Color.black.opacity(0.6), style: FillStyle(eoFill: true))
            CropCorners()
                .stroke(Ess.amber, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: crop.width - 8, height: crop.height - 8)
                .offset(x: crop.minX + 4, y: crop.minY + 4)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .gesture(DragGesture(minimumDistance: 0)
            .onChanged { drag in
                let start = dragStart ?? crop.origin
                if dragStart == nil { dragStart = start }
                if slack.width > 1 {
                    focusX = min(max((start.x + drag.translation.width) / slack.width, 0), 1) * 100
                }
                if slack.height > 1 {
                    focusY = min(max((start.y + drag.translation.height) / slack.height, 0), 1) * 100
                }
            }
            .onEnded { _ in dragStart = nil })
    }
}

/// Four rounded corner brackets, like a camera guide.
struct CropCorners: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let length = min(34, rect.width / 4), radius = min(26, rect.width / 6)
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

/// Step 2 (Droid15): the bar's name and address, and what the bar has (quiz, darts, …).
struct WizardBarStep: View {
    @Bindable var form: ReviewFormModel
    let photo: UIImage?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let photo {
                    HStack(spacing: 12) {
                        Image(uiImage: photo).resizable().scaledToFill()
                            .frame(width: 52, height: 52)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(alignment: .bottomTrailing) {
                                EssIconView(.check, size: 14, color: .black)
                                    .frame(width: 20, height: 20)
                                    .background(Circle().fill(Ess.amber))
                                    .offset(x: 6, y: 6)
                            }
                        Text("Bilden är klar").font(Ess.labelLarge).foregroundStyle(Ess.secondary)
                    }
                    .padding(.bottom, 4)
                }
                WizardTitle(title: "Var är ni?")
                EssField(label: "Barens namn", text: $form.draft.title, error: form.error(for: "/title"),
                         font: Font.system(size: 22, weight: .bold))
                    .textInputAutocapitalization(.words)
                    .accessibilityIdentifier("wizard.bar.title")
                EssField(label: "Adress", text: $form.draft.location, icon: .place, error: form.error(for: "/location"),
                         supporting: "Skriv gatan, postnumret och orten. Adressen hamnar på kartan när recensionen publiceras.",
                         font: Font.system(size: 22, weight: .bold))
                    .textInputAutocapitalization(.words)
                    .accessibilityIdentifier("wizard.bar.location")
                attributes
                if form.isEditing {
                    EssField(label: "Länk", text: $form.draft.slug, error: form.error(for: "/slug"),
                             supporting: "Recensionens adress på webben. Töm fältet för att skapa en ny länk från namnet.")
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(.top, 8)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder var attributes: some View {
        let options = form.metadata.barAttributes
        if !options.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Finns på stället")
                FlowRows(items: options.map(\.key)) { key in
                    let isOn = form.draft.attributes.contains(key)
                    EssChip(label: options.first { $0.key == key }?.label ?? key.rawValue, isOn: isOn, leading: .checkOrAdd) {
                        if isOn { form.draft.attributes.remove(key) } else { form.draft.attributes.insert(key) }
                    }
                }
                FieldError(message: form.error(for: "/attributes"))
            }
            .padding(.top, 12)
        }
    }
}

// MARK: Step 3: Stor stark

/// Step 3 (Droid16): the price on a ruler, happy hour, and the brand.
struct WizardBeerStep: View {
    @Bindable var form: ReviewFormModel
    @State var isTypingPrice = false
    @State var typedPrice = ""

    var limits: ReviewMetadata.LimitsPayload { form.metadata.limits }
    var priceRange: ClosedRange<Int> { limits.beerPriceMinKr...max(limits.beerPriceMinKr, limits.beerPriceMaxKr) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                WizardTitle(title: "Stor stark", subtitle: "Vad kostade den, och vilket märke var det?")
                price
                happyHour
                brands.padding(.top, 8)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .scrollDismissesKeyboard(.interactively)
        .alert("Pris i kronor", isPresented: $isTypingPrice) {
            TextField("Kronor", text: $typedPrice).keyboardType(.numberPad)
            Button("Klar") {
                if let value = Int(typedPrice.trimmingCharacters(in: .whitespaces)) {
                    form.draft.priceKr = value
                }
            }
            Button("Avbryt", role: .cancel) {}
        }
    }

    var price: some View {
        VStack(spacing: 4) {
            Button {
                typedPrice = form.draft.priceKr.map(String.init) ?? ""
                isTypingPrice = true
            } label: {
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    Text(verbatim: form.draft.priceKr.map(String.init) ?? "–").font(Ess.num(96))
                    Text(verbatim: form.draft.isHappyHourPrice ? "kr*" : "kr").font(Ess.num(38))
                }
                .foregroundStyle(form.draft.priceKr == nil ? Ess.tertiary : Ess.amber)
                .glow(form.draft.priceKr != nil, radius: 26)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(form.draft.priceKr.map { "Pris \($0) kronor" } ?? "Inget pris"))
            .accessibilityIdentifier("wizard.beer.price")
            PriceRuler(price: $form.draft.priceKr, range: priceRange)
            if form.draft.priceKr == nil {
                Text("Dra i linjalen eller tryck på priset").font(Ess.bodySmall).foregroundStyle(Ess.tertiary)
            }
            FieldError(message: form.error(for: "/beer/priceKr"))
        }
    }

    var happyHour: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 16) {
                AmberDisc(icon: .clock)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Happy hour-pris").font(Ess.titleMedium).foregroundStyle(.white)
                    Text("Visas med * och räknas i statistiken").font(Ess.bodyMedium).foregroundStyle(Ess.secondary)
                }
                Spacer(minLength: 8)
                Toggle("Happy hour-pris", isOn: $form.draft.isHappyHourPrice)
                    .labelsHidden()
                    .tint(Ess.amber)
                    .accessibilityIdentifier("wizard.beer.happyHour")
            }
            .padding(16)
            .essCard()
            FieldError(message: form.error(for: "/beer/isHappyHourPrice"))
        }
    }

    var brands: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Märke")
            FlowRows(items: form.metadata.beerBrands + [ReviewFormModel.otherBrand]) { brand in
                if brand == ReviewFormModel.otherBrand {
                    EssChip(label: "Annat märke…", isOn: form.draft.brandChoice == brand, leading: .add) {
                        form.draft.brandChoice = brand
                    }
                } else {
                    EssChip(label: brand, isOn: form.draft.brandChoice == brand) {
                        form.draft.brandChoice = brand
                    }
                }
            }
            if form.draft.brandChoice == ReviewFormModel.otherBrand {
                EssField(label: "Märkets namn", text: $form.draft.customBrand)
                    .textInputAutocapitalization(.words)
                    .accessibilityIdentifier("wizard.beer.customBrand")
            }
            FieldError(message: form.error(for: "/beer/brand"))
        }
    }
}

/// A price ruler: a tick for every krona, drag sideways to scrub.
struct PriceRuler: View {
    @Binding var price: Int?
    let range: ClosedRange<Int>
    @State var start: Int?
    private let spacing: CGFloat = 10

    /// Where the ruler stands before a price is chosen.
    var resting: Int { min(max(70, range.lowerBound), range.upperBound) }
    var shown: Int { price ?? resting }

    var body: some View {
        GeometryReader { proxy in
            let middle = proxy.size.width / 2
            let current = shown
            let reach = Int(middle / spacing) + 1
            let visible = Array(max(range.lowerBound, current - reach)...min(range.upperBound, current + reach))
            ZStack(alignment: .topLeading) {
                ForEach(visible, id: \.self) { kr in
                    let x = middle + CGFloat(kr - current) * spacing
                    let fade = max(0, 1 - abs(x - middle) / middle)
                    let isMajor = kr % 10 == 0, isHalf = kr % 5 == 0
                    let height: CGFloat = isMajor ? 30 : (isHalf ? 20 : 12)
                    Capsule()
                        .fill(Color.white.opacity((isMajor ? 0.75 : 0.28) * fade))
                        .frame(width: 2, height: height)
                        .offset(x: x - 1, y: 8)
                    if isMajor {
                        Text(verbatim: "\(kr)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color.white.opacity(0.5 * fade))
                            .frame(width: 40)
                            .offset(x: x - 20, y: height + 14)
                    }
                }
                Capsule().fill(price == nil ? Ess.amber.opacity(0.4) : Ess.amber)
                    .frame(width: 4, height: 46)
                    .glow(price != nil, radius: 8)
                    .offset(x: middle - 2, y: 0)
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
            .background(Color.black.opacity(0.001))
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { drag in
                    let origin = start ?? shown
                    if start == nil { start = origin }
                    let value = min(max(origin - Int((drag.translation.width / spacing).rounded()), range.lowerBound), range.upperBound)
                    if price != value { price = value }
                }
                .onEnded { _ in start = nil })
        }
        .frame(height: 70)
        .clipped()
        .accessibilityLabel(Text("Prislinjal"))
        .accessibilityIdentifier("wizard.beer.ruler")
    }
}

// MARK: Step 4: Betyg

/// Step 4 (Droid17): one card per aspect with its own control, and six round 0–5 buttons.
struct WizardRatingStep: View {
    @Bindable var form: ReviewFormModel
    @Binding var index: Int

    var metrics: [RatingMetric] { form.metadata.ratingMetrics }

    var body: some View {
        if metrics.isEmpty {
            EmptyState(icon: .star, title: "Inga betyg att sätta")
        } else {
            let metric = metrics[min(index, metrics.count - 1)]
            ScrollView {
                VStack(spacing: 16) {
                    header
                    card(metric)
                    valueButtons(metric)
                    FieldError(message: form.error(for: "/ratings/\(metric.key.rawValue)"))
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
        }
    }

    var header: some View {
        HStack(spacing: 0) {
            Text("Betyg \(index + 1) av \(metrics.count)")
                .font(Ess.labelLarge)
                .foregroundStyle(Ess.secondary)
            Spacer()
            ForEach(Array(metrics.enumerated()), id: \.offset) { position, item in
                Button {
                    withAnimation { index = position }
                } label: {
                    Circle()
                        .fill(position < index ? Ess.amber : (position == index ? Color.white : Ess.raised3))
                        .frame(width: 8, height: 8)
                        .frame(width: 16, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("\(item.label), \(value(item.key)) av 5"))
            }
        }
    }

    func card(_ metric: RatingMetric) -> some View {
        let current = value(metric.key)
        return VStack(spacing: 8) {
            VStack(spacing: 4) {
                Text(metric.label).font(Ess.stepTitle).foregroundStyle(.white).lineLimit(1)
                Text(metric.description).font(Ess.bodyMedium).foregroundStyle(Ess.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 16)
            RatingControl(key: metric.key, value: binding(metric.key), priceText: form.draft.priceKr.map { "\($0) kr" })
                .frame(maxWidth: .infinity)
                .frame(height: 220)
                .padding(.horizontal, 12)
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text(verbatim: "\(current)")
                    .font(Ess.num(60))
                    .foregroundStyle(Ess.amber)
                    .glow(radius: 18)
                Text(RatingWords.word(metric.key, current))
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer()
                Text("av 5").font(Ess.bodySmall).foregroundStyle(Ess.secondary)
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity)
        .essCard(32)
        .overlay(RoundedRectangle(cornerRadius: 32).stroke(Ess.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 32))
    }

    func valueButtons(_ metric: RatingMetric) -> some View {
        let current = value(metric.key)
        return HStack(spacing: 0) {
            ForEach(0..<6, id: \.self) { option in
                Button {
                    form.draft.ratings[metric.key] = option
                } label: {
                    Text(verbatim: "\(option)")
                        .font(Ess.num(20))
                        .foregroundStyle(option == current ? Color.black : .white)
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(option == current ? Ess.amber : Ess.raised2))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("\(option), \(RatingWords.word(metric.key, option))"))
                .accessibilityIdentifier("wizard.rating.value.\(option)")
                if option < 5 { Spacer(minLength: 0) }
            }
        }
    }

    func value(_ key: RatingKey) -> Int {
        form.draft.ratings[key] ?? 0
    }

    func binding(_ key: RatingKey) -> Binding<Int> {
        Binding(get: { form.draft.ratings[key] ?? 0 }, set: { form.draft.ratings[key] = $0 })
    }
}

// MARK: Step 5: Helhet & text

/// Step 5 (Droid18, Droid19): the overall rating (the suggestion from the aspects is only the
/// start value) and the review text, with a Skriv/Förhandsvisa segmented button.
struct WizardTextStep: View {
    @Bindable var form: ReviewFormModel
    @State var mode = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                OverallRatingPicker(form: form)
                    .padding(16)
                    .essCard()
                HStack(spacing: 0) {
                    Text("Recension").font(Ess.headlineSmall).foregroundStyle(.white)
                    Spacer()
                    if mode == 0 {
                        formatButton(.heading, label: "Rubrik") { toggleLinePrefix("## ") }
                        formatButton(.bullets, label: "Punktlista") { toggleLinePrefix("- ") }
                        formatButton(.bold, label: "Fetstil") { form.draft.description += "****" }
                    }
                }
                .frame(height: 48)
                .padding(.top, 8)
                Picker("Läge", selection: $mode) {
                    Text("Skriv").tag(0)
                    Text("Förhandsvisa").tag(1)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .tint(Ess.amber)
                .accessibilityIdentifier("wizard.text.preview")
                if mode == 1 {
                    Group {
                        if form.draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text("Inget att visa än.").font(Ess.bodyLarge).foregroundStyle(Ess.tertiary)
                        } else {
                            DescriptionView(source: form.draft.description)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 220, alignment: .topLeading)
                    .padding(16)
                    .essCard(18)
                } else {
                    EssField(label: "Recension", text: descriptionBinding, error: form.error(for: "/description"),
                             supporting: "En rad i taget. Börja raden med - för en punktlista. Finputsa hemma.",
                             isMultiline: true, minHeight: 220)
                        .accessibilityIdentifier("wizard.text.editor")
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    /// Continues lists as the text changes. Not `onChange`: on Android, Skip passed this view
    /// another `onChange`'s value (a `URL?` from the wizard) and the cast to `String` crashed.
    var descriptionBinding: Binding<String> {
        Binding(
            get: { form.draft.description },
            set: { new in
                let old = form.draft.description
                form.draft.description = new
                continueList(old: old, new: new)
            }
        )
    }

    func formatButton(_ icon: EssIcon, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            EssIconView(icon, size: 20, color: .white).frame(width: 48, height: 48)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    /// Adds or removes a prefix (`- ` or `## `) on the last line.
    func toggleLinePrefix(_ prefix: String) {
        var lines = form.draft.description.components(separatedBy: "\n")
        var line = lines.last ?? ""
        if line.hasPrefix(prefix) {
            line.removeFirst(prefix.count)
        } else {
            for other in ["- ", "## "] where line.hasPrefix(other) { line.removeFirst(other.count) }
            line = prefix + line
        }
        if lines.isEmpty { lines = [line] } else { lines[lines.count - 1] = line }
        form.draft.description = lines.joined(separator: "\n")
    }

    /// After a new line at the end of a list item, starts the next item. A new line after an
    /// empty item ends the list. Only at the end of the text, where the cursor stays put.
    func continueList(old: String, new: String) {
        guard new.count == old.count + 1, new.hasPrefix(old), new.hasSuffix("\n") else { return }
        let lastLine = old.components(separatedBy: "\n").last ?? ""
        guard lastLine.hasPrefix("- ") else { return }
        if lastLine.trimmingCharacters(in: .whitespaces) == "-" {
            form.draft.description = String(old.dropLast(lastLine.count))
        } else {
            form.draft.description = new + "- "
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
                    Button {
                        set(shown == star + 1 ? 0 : star + 1)
                    } label: {
                        EssIconView(.star, size: 52, color: star < shown ? Ess.amber : Color.white.opacity(0.25))
                            .glow(star < shown, radius: 10)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("\(star + 1) av 3"))
                }
            }
            .accessibilityIdentifier("wizard.text.overall")
            Text(Formatting.ratingWord(shown)).font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
            if form.draft.overallRating == nil {
                Text("Förslag från betygen: \(Formatting.decimal(form.weightedScore, maximumFractionDigits: 2)) poäng. Tryck för att ändra.")
                    .font(Ess.bodySmall).foregroundStyle(Ess.secondary).multilineTextAlignment(.center)
            } else {
                HStack(spacing: 6) {
                    Text("Ändrat från förslaget, \(suggested)/3.").font(Ess.bodySmall).foregroundStyle(Ess.secondary)
                    Button("Använd förslaget") { form.draft.overallRating = nil }
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Ess.amber)
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("wizard.text.useSuggestion")
                }
            }
            FieldError(message: form.error(for: "/overallRating"))
        }
        .frame(maxWidth: .infinity)
    }

    func set(_ value: Int) {
        form.draft.overallRating = value == form.suggestedOverallRating ? nil : value
    }
}

// MARK: Step 6: Vem

/// Step 6 (Droid20): who was there, and a preview of the feed card.
struct WizardAuthorsStep: View {
    @Bindable var form: ReviewFormModel
    let photo: UIImage?

    var selected: [String] { form.authorOptions.filter { form.draft.authors.contains($0) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                WizardTitle(title: "Vilka var där?", subtitle: "Alla som du väljer står som författare.")
                FlowRows(items: form.authorOptions) { name in
                    let isOn = form.draft.authors.contains(name)
                    EssChip(label: name == form.currentUser ? "Du (\(Formatting.authorName(name)))" : Formatting.authorName(name),
                            isOn: isOn, leading: .avatar(name), height: 40) {
                        if isOn { form.draft.authors.remove(name) } else { form.draft.authors.insert(name) }
                    }
                    .accessibilityIdentifier("wizard.authors.\(name)")
                }
                Text(selected.isEmpty ? "Välj minst en författare." : "\(Formatting.authorList(selected.map(Formatting.authorName))) står som författare.")
                    .font(Ess.bodySmall)
                    .foregroundStyle(selected.isEmpty ? Ess.bad : Ess.secondary)
                FieldError(message: form.error(for: "/authors"))
                HStack {
                    SectionLabel(text: "Så ser den ut i flödet")
                    Spacer()
                    if form.isDraft {
                        Text("Bara inloggade ser utkast").font(Ess.bodySmall).foregroundStyle(Ess.secondary)
                    }
                }
                .padding(.top, 12)
                preview
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
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
                FocusedFill(image: Image(uiImage: photo), focusX: draft.focusX, focusY: draft.focusY)
            } else {
                PhotoPlaceholder()
            }
        }
        .allowsHitTesting(false)
    }
}
#endif
