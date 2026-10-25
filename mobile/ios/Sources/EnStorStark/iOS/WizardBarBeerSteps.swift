import SwiftUI
import UIKit
import EnStorStarkModel

// MARK: Step 2: Bar

/// Step 2: the bar's name and address, and what the bar has (quiz, darts, …).
struct WizardBarStep: View {
    @Bindable var form: ReviewFormModel
    let photo: UIImage?
    @FocusState var focus: Field?

    enum Field: Hashable { case title, location, slug }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let photo {
                    HStack(spacing: 12) {
                        Image(uiImage: photo).resizable().scaledToFill()
                            .frame(width: 58, height: 58)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(alignment: .bottomTrailing) {
                                Image(systemName: "checkmark.circle.fill").font(.system(size: 20))
                                    .foregroundStyle(.black, Theme.amber).offset(x: 6, y: 6)
                            }
                        Text("Bilden är klar").font(Theme.body(14, .semibold)).foregroundStyle(Theme.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
                WizardTitle(title: "Var är ni?", size: 40)
                    .padding(.top, 4)
                WizardField(placeholder: "Barens namn", text: $form.draft.title, error: form.error(for: "/title"),
                            focus: $focus, field: .title, identifier: "wizard.bar.title")
                    .textContentType(.organizationName)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.next)
                    .onSubmit { focus = .location }
                VStack(alignment: .leading, spacing: 8) {
                    WizardField(placeholder: "Adress", text: $form.draft.location, error: form.error(for: "/location"),
                                focus: $focus, field: .location, identifier: "wizard.bar.location")
                        .textContentType(.fullStreetAddress)
                        .textInputAutocapitalization(.words)
                        .submitLabel(.done)
                        .onSubmit { focus = nil }
                    Text("Skriv gatan, postnumret och orten. Adressen hamnar på kartan när recensionen publiceras.")
                        .font(Theme.body(13)).foregroundStyle(Theme.tertiary)
                }
                attributes
                if form.isEditing {
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow(text: "Länk")
                        WizardField(placeholder: "Länk", text: $form.draft.slug, error: form.error(for: "/slug"),
                                    focus: $focus, field: .slug, big: false, identifier: "wizard.bar.slug")
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Text("Recensionens adress på webben. Töm fältet för att skapa en ny länk från namnet.")
                            .font(Theme.body(13)).foregroundStyle(Theme.tertiary)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            if !form.isEditing && form.draft.title.isEmpty { focus = .title }
        }
    }

    @ViewBuilder var attributes: some View {
        let options = form.metadata.barAttributes
        if !options.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Eyebrow(text: "Finns på stället")
                FlowLayout(spacing: 8) {
                    ForEach(options, id: \.key) { option in
                        let isOn = form.draft.attributes.contains(option.key)
                        Pill(text: option.label, isOn: isOn, icon: isOn ? "checkmark" : "plus") {
                            if isOn { form.draft.attributes.remove(option.key) } else { form.draft.attributes.insert(option.key) }
                        }
                        .accessibilityIdentifier("wizard.bar.attribute.\(option.key.rawValue)")
                    }
                }
                FieldError(message: form.error(for: "/attributes"))
            }
            .padding(.top, 8)
        }
    }
}

/// A large text field in a dark box, with an amber ring on focus and a red ring on error.
struct WizardField<Field: Hashable>: View {
    let placeholder: String
    @Binding var text: String
    var error: String?
    var focus: FocusState<Field?>.Binding
    let field: Field
    var big = true
    var identifier: String

    var body: some View {
        let isFocused = focus.wrappedValue == field
        VStack(alignment: .leading, spacing: 7) {
            TextField(placeholder, text: $text)
                .font(Theme.body(big ? 22 : 17, big ? .bold : .regular))
                .foregroundStyle(Theme.text)
                .tint(Theme.amber)
                .focused(focus, equals: field)
                .padding(.horizontal, 16)
                .frame(height: big ? 62 : 54)
                .background(Theme.raised, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(error != nil ? Theme.bad : (isFocused ? Theme.amber : .clear), lineWidth: 2)
                }
                .accessibilityIdentifier(identifier)
            FieldError(message: error)
        }
    }
}

// MARK: Step 3: Stor stark

/// Step 3: the price on a ruler, happy hour, and the brand.
struct WizardBeerStep: View {
    @Bindable var form: ReviewFormModel
    @State var isTypingPrice = false
    @State var typedPrice = ""
    @State var isTypingVolume = false
    @State var typedVolume = ""
    @FocusState var isBrandFocused: Bool

    var limits: ReviewMetadata.LimitsPayload { form.metadata.limits }
    var priceRange: ClosedRange<Int> { limits.beerPriceMinKr...max(limits.beerPriceMinKr, limits.beerPriceMaxKr) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                WizardTitle(title: "Stor stark", subtitle: "Vad kostade den, hur stor var den och vilket märke?")
                price
                volume
                happyHour
                brands
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .scrollIndicators(.hidden)
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
        .alert("Volym i centiliter", isPresented: $isTypingVolume) {
            TextField("Centiliter", text: $typedVolume).keyboardType(.numberPad)
            Button("Klar") {
                let text = typedVolume.trimmingCharacters(in: .whitespaces)
                form.draft.volumeCl = text.isEmpty ? nil : Int(text) ?? form.draft.volumeCl
                form.validate(.beer)
            }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Mellan \(limits.beerVolumeMinCl) och \(limits.beerVolumeMaxCl) cl. Lämna tomt om du inte vet.")
        }
    }

    /// Optional serving size: the common sizes are one tap, others are typed.
    var volume: some View {
        let quickPicks = ReviewFormModel.volumeQuickPicks
        let custom = form.draft.volumeCl.flatMap { quickPicks.contains($0) ? nil : $0 }
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Eyebrow(text: "Volym")
                Spacer()
                if let value = Formatting.clPerKr(volumeCl: form.draft.volumeCl, priceKr: form.draft.priceKr,
                                                  isHappyHour: form.draft.isHappyHourPrice) {
                    Text(value).font(Theme.body(13, .bold)).foregroundStyle(Theme.amber)
                        .contentTransition(.numericText())
                }
            }
            HStack(spacing: 8) {
                ForEach(quickPicks, id: \.self) { size in
                    let isOn = form.draft.volumeCl == size
                    Button {
                        withAnimation(.snappy) { form.draft.volumeCl = isOn ? nil : size }
                        form.validate(.beer)
                    } label: {
                        Text(verbatim: "\(size) cl").font(Theme.body(15, .bold))
                            .foregroundStyle(isOn ? .black : .white)
                            .frame(maxWidth: .infinity).frame(height: 44)
                            .background(isOn ? Theme.amber : Color.white.opacity(0.1), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("\(size) centiliter"))
                    .accessibilityAddTraits(isOn ? .isSelected : [])
                    .accessibilityIdentifier("wizard.beer.volume.\(size)")
                }
                Button {
                    typedVolume = form.draft.volumeCl.map(String.init) ?? ""
                    isTypingVolume = true
                } label: {
                    Group {
                        if let custom {
                            Text(verbatim: "\(custom) cl").font(Theme.body(15, .bold)).padding(.horizontal, 12)
                        } else {
                            Image(systemName: "ellipsis").font(.system(size: 15, weight: .bold)).frame(width: 44)
                        }
                    }
                    .foregroundStyle(custom == nil ? .white : .black)
                    .frame(height: 44)
                    .background(custom == nil ? Color.white.opacity(0.1) : Theme.amber, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(custom.map { "Annan volym, \($0) centiliter" } ?? "Annan volym"))
                .accessibilityIdentifier("wizard.beer.volume.other")
            }
            Text("Valfritt. Tryck igen för att ta bort.").font(Theme.body(12)).foregroundStyle(Theme.tertiary)
            FieldError(message: form.error(for: "/beer/volumeCl"))
        }
    }

    var price: some View {
        VStack(spacing: 4) {
            Button {
                typedPrice = form.draft.priceKr.map(String.init) ?? ""
                isTypingPrice = true
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(verbatim: form.draft.priceKr.map(String.init) ?? "–")
                        .font(Theme.num(84))
                        .contentTransition(.numericText(value: Double(form.draft.priceKr ?? 0)))
                    Text(verbatim: form.draft.isHappyHourPrice ? "kr*" : "kr").font(Theme.num(28))
                }
                .foregroundStyle(form.draft.priceKr == nil ? Theme.tertiary : Theme.amber)
                .glow(form.draft.priceKr != nil, radius: 18)
                .frame(maxWidth: .infinity)
                .animation(.snappy(duration: 0.15), value: form.draft.priceKr)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(form.draft.priceKr.map { "Pris \($0) kronor" } ?? "Inget pris"))
            .accessibilityHint(Text("Tryck för att skriva priset."))
            .accessibilityIdentifier("wizard.beer.price")
            PriceRuler(price: $form.draft.priceKr, range: priceRange)
                .disabled(isTypingPrice)
            Text(form.draft.priceKr == nil ? "Dra i linjalen eller tryck på priset" : " ")
                .font(Theme.body(13)).foregroundStyle(Theme.tertiary)
            FieldError(message: form.error(for: "/beer/priceKr"))
        }
    }

    var happyHour: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: $form.draft.isHappyHourPrice) {
                HStack(spacing: 12) {
                    Image(systemName: "clock.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(Theme.amber)
                        .frame(width: 36, height: 36).background(Theme.amber.opacity(0.14), in: Circle())
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Happy hour-pris").font(Theme.body(16, .semibold)).foregroundStyle(.white)
                        Text("Visas med * och räknas i statistiken").font(Theme.body(12)).foregroundStyle(Theme.secondary)
                    }
                }
            }
            .tint(Theme.amber)
            .padding(14)
            .cardBackground(20)
            .accessibilityIdentifier("wizard.beer.happyHour")
            FieldError(message: form.error(for: "/beer/isHappyHourPrice"))
        }
    }

    var brands: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: "Märke")
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 12) {
                ForEach(form.metadata.beerBrands, id: \.self) { brand in
                    BrandTile(title: brand, isOn: form.draft.brandChoice == brand) {
                        BrandLogo(brand: brand, size: 92, radius: 18)
                    } action: {
                        form.draft.brandChoice = brand
                        isBrandFocused = false
                    }
                    .accessibilityIdentifier("wizard.beer.brand.\(brand)")
                }
                BrandTile(title: "Annat märke…", isOn: form.draft.brandChoice == ReviewFormModel.otherBrand) {
                    ZStack {
                        Color.white.opacity(0.1)
                        Image(systemName: "plus").font(.system(size: 28, weight: .semibold)).foregroundStyle(Theme.amber)
                    }
                    .frame(width: 92, height: 92)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                } action: {
                    form.draft.brandChoice = ReviewFormModel.otherBrand
                    isBrandFocused = true
                }
                .accessibilityIdentifier("wizard.beer.brand.other")
            }
            if form.draft.brandChoice == ReviewFormModel.otherBrand {
                TextField("Märkets namn", text: $form.draft.customBrand)
                    .font(Theme.body(17))
                    .foregroundStyle(Theme.text)
                    .textInputAutocapitalization(.words)
                    .focused($isBrandFocused)
                    .padding(.horizontal, 16)
                    .frame(height: 54)
                    .background(Theme.raised, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(isBrandFocused ? Theme.amber : .clear, lineWidth: 2)
                    }
                    .accessibilityIdentifier("wizard.beer.customBrand")
            }
            FieldError(message: form.error(for: "/beer/brand"))
        }
    }
}

/// A brand choice in the logo grid: amber ring and check mark when chosen.
struct BrandTile<Logo: View>: View {
    let title: String
    let isOn: Bool
    @ViewBuilder let logo: Logo
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                logo
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(isOn ? Theme.amber : .clear, lineWidth: 3).padding(-4)
                    }
                    .overlay(alignment: .topTrailing) {
                        if isOn {
                            Image(systemName: "checkmark.circle.fill").font(.system(size: 22))
                                .foregroundStyle(.black, Theme.amber).offset(x: 8, y: -8)
                        }
                    }
                Text(title).font(Theme.body(11, isOn ? .bold : .medium))
                    .foregroundStyle(isOn ? .white : Theme.secondary)
                    .lineLimit(2).multilineTextAlignment(.center).minimumScaleFactor(0.8)
                    .frame(maxHeight: .infinity, alignment: .top)
            }
            .padding(.top, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(title))
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .animation(.snappy(duration: 0.15), value: isOn)
    }
}

/// A price ruler with continuous dragging and friction after a flick.
struct PriceRuler: View {
    @Binding var price: Int?
    let range: ClosedRange<Int>
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isEnabled) private var isEnabled
    @State private var start: Double?
    @GestureState private var isDragging = false
    @State private var motion: PriceRulerMotion
    @State private var coastGeneration = 0
    private let spacing: CGFloat = 10

    init(price: Binding<Int?>, range: ClosedRange<Int>) {
        _price = price
        self.range = range
        _motion = State(initialValue: PriceRulerMotion(value: Double(price.wrappedValue ?? 70), range: range))
    }

    /// Where the ruler stands before a price is chosen.
    var resting: Int { min(max(70, range.lowerBound), range.upperBound) }
    var shown: Int { price ?? resting }

    var body: some View {
        GeometryReader { proxy in
            let middle = proxy.size.width / 2
            let current = motion.position
            Canvas { context, size in
                let first = max(range.lowerBound, Int(floor(current - Double(middle / spacing))) - 2)
                let last = min(range.upperBound, Int(ceil(current + Double(middle / spacing))) + 2)
                for kr in first...max(first, last) {
                    let x = middle + CGFloat(Double(kr) - current) * spacing
                    guard x > -20, x < size.width + 20 else { continue }
                    let isMajor = kr % 10 == 0, isHalf = kr % 5 == 0
                    let height: CGFloat = isMajor ? 30 : (isHalf ? 20 : 12)
                    context.fill(Path(roundedRect: CGRect(x: x - 1, y: 8, width: 2, height: height), cornerRadius: 1),
                                 with: .color(.white.opacity(isMajor ? 0.75 : 0.28)))
                    if isMajor {
                        context.draw(Text(verbatim: "\(kr)").font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(.white.opacity(0.5)), at: CGPoint(x: x, y: height + 22))
                    }
                }
            }
            .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.25),
                                         .init(color: .black, location: 0.75), .init(color: .clear, location: 1)],
                                 startPoint: .leading, endPoint: .trailing))
            .overlay(alignment: .top) {
                Capsule().fill(price == nil ? Theme.amber.opacity(0.4) : Theme.amber)
                    .frame(width: 4, height: 46)
                    .glow(price != nil, radius: 8)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .updating($isDragging) { _, active, _ in active = true }
                .onChanged { drag in
                    if start == nil {
                        coastGeneration += 1
                        start = motion.position
                    }
                    motion.drag(to: (start ?? motion.position) - Double(drag.translation.width / spacing))
                    price = motion.selected
                }
                .onEnded { drag in
                    start = nil
                    motion.release(velocity: -Double(drag.velocity.width / spacing), reduceMotion: reduceMotion)
                    price = motion.selected
                    coastGeneration += 1
                })
        }
        .frame(height: 66)
        .sensoryFeedback(.selection, trigger: price)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Prislinjal"))
        .accessibilityValue(Text(price.map { "\($0) kronor" } ?? "Inget pris"))
        .accessibilityAdjustableAction { direction in
            stopCoasting()
            let value = shown + (direction == .increment ? 1 : -1)
            price = min(max(value, range.lowerBound), range.upperBound)
            motion.drag(to: Double(price ?? resting))
        }
        .accessibilityIdentifier("wizard.beer.ruler")
        .task(id: coastGeneration) {
            var previous = ProcessInfo.processInfo.systemUptime
            while motion.isMoving {
                do { try await Task.sleep(for: .milliseconds(16)) } catch { return }
                guard !Task.isCancelled else { return }
                let now = ProcessInfo.processInfo.systemUptime
                motion.advance(by: now - previous)
                previous = now
                price = motion.selected
            }
        }
        .onChange(of: price) { _, value in
            // Binding updates made by the animation must not interrupt that animation.
            if value != motion.selected {
                stopCoasting()
                motion.drag(to: Double(value ?? resting))
            }
        }
        .onChange(of: range) { _, updated in
            stopCoasting()
            motion = PriceRulerMotion(value: Double(shown), range: updated)
        }
        .onChange(of: reduceMotion) { _, reduced in if reduced { stopCoasting() } }
        .onChange(of: isDragging) { _, dragging in
            // Gesture cancellation (unlike a completed release) has no onEnded call.
            if !dragging, start != nil { stopCoasting() }
        }
        .onChange(of: isEnabled) { _, enabled in if !enabled { stopCoasting() } }
        .onChange(of: scenePhase) { _, phase in if phase != .active { stopCoasting() } }
        .onDisappear { stopCoasting() }
    }

    private func stopCoasting() {
        coastGeneration += 1
        start = nil
        motion.stop()
    }
}
