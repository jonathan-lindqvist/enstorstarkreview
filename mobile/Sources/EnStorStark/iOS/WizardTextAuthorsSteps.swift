#if !os(Android)
import SwiftUI
import UIKit
import EnStorStarkModel

// MARK: Step 5: Helhet & text

/// Step 5: the overall rating (the suggestion from the aspects is only the start value) and the
/// review text.
struct WizardTextStep: View {
    @Bindable var form: ReviewFormModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                OverallRatingPicker(form: form)
                    .padding(16)
                    .cardBackground(24)
                MarkdownEditor(text: $form.draft.description, error: form.error(for: "/description"))
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }
}

/// Three large stars. A tap on the current rating sets it to 0.
struct OverallRatingPicker: View {
    @Bindable var form: ReviewFormModel

    var body: some View {
        let shown = form.effectiveOverallRating
        let suggested = form.suggestedOverallRating
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                ForEach(0..<3, id: \.self) { star in
                    Image(systemName: star < shown ? "star.fill" : "star")
                        .font(.system(size: 50, weight: .bold))
                        .foregroundStyle(star < shown ? Theme.amber : Color.white.opacity(0.22))
                        .shadow(color: star < shown ? Theme.amber.opacity(0.6) : .clear, radius: 12)
                        .contentShape(Rectangle())
                        .onTapGesture { set(shown == star + 1 ? 0 : star + 1) }
                }
            }
            .animation(.snappy, value: shown)
            .sensoryFeedback(.selection, trigger: shown)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("Helhetsbetyg"))
            .accessibilityValue(Text("\(shown) av 3, \(Formatting.ratingWord(shown))"))
            .accessibilityAdjustableAction { direction in
                set(min(max(shown + (direction == .increment ? 1 : -1), 0), 3))
            }
            .accessibilityIdentifier("wizard.text.overall")
            Text(Formatting.ratingWord(shown)).font(Theme.title(22)).foregroundStyle(.white)
            if form.draft.overallRating == nil {
                Text("Förslag från betygen: \(Formatting.decimal(form.weightedScore, maximumFractionDigits: 2)) poäng. Tryck för att ändra.")
                    .font(Theme.body(12)).foregroundStyle(Theme.secondary).multilineTextAlignment(.center)
            } else {
                HStack(spacing: 6) {
                    Text("Ändrat från förslaget, \(suggested)/3.").font(Theme.body(12)).foregroundStyle(Theme.secondary)
                    Button("Använd förslaget") {
                        withAnimation(.snappy) { form.draft.overallRating = nil }
                    }
                    .font(Theme.body(12, .bold))
                    .foregroundStyle(Theme.amber)
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

/// A Markdown text editor with buttons for headings, lists, and bold text, and a preview.
/// A new line after a list item starts the next item.
struct MarkdownEditor: View {
    @Binding var text: String
    var error: String?
    @State var selection: TextSelection?
    @State var isPreviewing = false
    @FocusState var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("Recension").font(Theme.body(17, .bold)).foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                if !isPreviewing {
                    formatButton("number", label: "Rubrik") { toggleLinePrefix("## ") }
                    formatButton("list.bullet", label: "Punktlista") { toggleLinePrefix("- ") }
                    formatButton("bold", label: "Fetstil") { wrapSelection("**") }
                }
                Button {
                    withAnimation(.snappy(duration: 0.2)) { isPreviewing.toggle() }
                    if isPreviewing { isFocused = false }
                } label: {
                    Label(isPreviewing ? "Skriv" : "Förhandsvisa", systemImage: isPreviewing ? "pencil" : "eye")
                        .font(Theme.body(13, .semibold))
                        .foregroundStyle(isPreviewing ? Color.black : .white)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .background(isPreviewing ? Theme.amber : Color.white.opacity(0.1), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("wizard.text.preview")
            }
            Group {
                if isPreviewing {
                    Group {
                        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text("Inget att visa än.").font(Theme.body(15)).foregroundStyle(Theme.tertiary)
                        } else {
                            DescriptionView(source: text, size: 15)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 200, alignment: .topLeading)
                    .padding(14)
                } else {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $text, selection: $selection)
                            .font(Theme.body(16))
                            .foregroundStyle(Theme.text)
                            .scrollContentBackground(.hidden)
                            .focused($isFocused)
                            .frame(minHeight: 220)
                            .accessibilityLabel(Text("Recension"))
                            .accessibilityIdentifier("wizard.text.editor")
                        if text.isEmpty {
                            Text("- Öppen lokal med fin inredning\n- Lugnt nog att prata")
                                .font(Theme.body(16))
                                .foregroundStyle(Theme.tertiary)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 8)
                                .allowsHitTesting(false)
                                .accessibilityHidden(true)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                }
            }
            .background(Theme.raised2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(error != nil ? Theme.bad : (isFocused ? Theme.amber : .clear), lineWidth: 2)
            }
            Text("En rad i taget. Börja raden med - för en punktlista. Finputsa hemma.")
                .font(Theme.body(12)).foregroundStyle(Theme.tertiary)
            FieldError(message: error)
        }
        .onChange(of: text) { old, new in continueList(old: old, new: new) }
    }

    func formatButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(Color.white.opacity(0.1), in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    // MARK: Editing

    /// The selected range as character offsets. Without a selection, the end of the text.
    var selectedOffsets: Range<Int> {
        if case .selection(let range)? = selection?.indices,
           range.lowerBound >= text.startIndex, range.upperBound <= text.endIndex {
            return text.distance(from: text.startIndex, to: range.lowerBound)..<text.distance(from: text.startIndex, to: range.upperBound)
        }
        return text.count..<text.count
    }

    func place(cursorAt offset: Int) {
        let clamped = min(max(offset, 0), text.count)
        selection = TextSelection(insertionPoint: text.index(text.startIndex, offsetBy: clamped))
    }

    /// Adds or removes a prefix (`- ` or `## `) at the start of the line with the cursor.
    func toggleLinePrefix(_ prefix: String) {
        let cursor = selectedOffsets.lowerBound
        var characters = Array(text)
        var lineStart = min(cursor, characters.count)
        while lineStart > 0 && characters[lineStart - 1] != "\n" { lineStart -= 1 }
        let line = String(characters[lineStart...].prefix { $0 != "\n" })
        var change = 0
        if line.hasPrefix(prefix) {
            characters.removeSubrange(lineStart..<lineStart + prefix.count)
            change = -prefix.count
        } else {
            for other in ["- ", "## "] where line.hasPrefix(other) {
                characters.removeSubrange(lineStart..<lineStart + other.count)
                change -= other.count
            }
            characters.insert(contentsOf: prefix, at: lineStart)
            change += prefix.count
        }
        text = String(characters)
        place(cursorAt: cursor + change)
        isFocused = true
    }

    /// Puts a marker before and after the selection, or two markers around the cursor.
    func wrapSelection(_ marker: String) {
        let range = selectedOffsets
        var characters = Array(text)
        characters.insert(contentsOf: marker, at: range.upperBound)
        characters.insert(contentsOf: marker, at: range.lowerBound)
        text = String(characters)
        place(cursorAt: range.isEmpty ? range.lowerBound + marker.count : range.upperBound + marker.count * 2)
        isFocused = true
    }

    /// After a new line at the end of a list item, starts the next item. A new line after an
    /// empty item ends the list.
    func continueList(old: String, new: String) {
        guard new.count == old.count + 1 else { return }
        let oldCharacters = Array(old), newCharacters = Array(new)
        var position = 0
        while position < oldCharacters.count && oldCharacters[position] == newCharacters[position] { position += 1 }
        guard newCharacters[position] == "\n" else { return }
        var lineStart = position
        while lineStart > 0 && newCharacters[lineStart - 1] != "\n" { lineStart -= 1 }
        let line = String(newCharacters[lineStart..<position])
        guard line.hasPrefix("- ") else { return }
        var characters = newCharacters
        if line.trimmingCharacters(in: .whitespaces) == "-" {
            characters.removeSubrange(lineStart...position)
            text = String(characters)
            place(cursorAt: lineStart)
        } else {
            characters.insert(contentsOf: "- ", at: position + 1)
            text = String(characters)
            place(cursorAt: position + 3)
        }
    }
}

// MARK: Step 6: Vem

/// Step 6: who was there, and a preview of the feed card.
struct WizardAuthorsStep: View {
    @Bindable var form: ReviewFormModel
    let photo: UIImage?

    var selected: [String] { form.authorOptions.filter { form.draft.authors.contains($0) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                WizardTitle(title: "Vilka var där?", subtitle: "Alla som du väljer står som författare.")
                FlowLayout(spacing: 6) {
                    ForEach(form.authorOptions, id: \.self) { name in
                        authorButton(name)
                    }
                }
                Text(selected.isEmpty ? "Välj minst en författare." : "\(Formatting.authorList(selected)) står som författare.")
                    .font(Theme.body(13))
                    .foregroundStyle(selected.isEmpty ? Theme.bad : Theme.tertiary)
                FieldError(message: form.error(for: "/authors"))
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Eyebrow(text: "Så ser den ut i flödet")
                        Spacer()
                        if form.isDraft {
                            Text("Bara inloggade ser utkast").font(Theme.body(12)).foregroundStyle(Theme.tertiary)
                        }
                    }
                    preview
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .scrollIndicators(.hidden)
    }

    func authorButton(_ name: String) -> some View {
        let isOn = form.draft.authors.contains(name)
        return Button {
            if isOn { form.draft.authors.remove(name) } else { form.draft.authors.insert(name) }
        } label: {
            VStack(spacing: 5) {
                Avatar(name: name, size: 48, dimmed: !isOn)
                    .overlay(Circle().strokeBorder(isOn ? Theme.amber : .clear, lineWidth: 2.5).padding(-4))
                    .overlay(alignment: .bottomTrailing) {
                        if isOn {
                            Image(systemName: "checkmark.circle.fill").font(.system(size: 17))
                                .foregroundStyle(.black, Theme.amber).offset(x: 4, y: 4)
                        }
                    }
                Text(name == form.currentUser ? "Du" : Formatting.authorName(name))
                    .font(Theme.body(12, isOn ? .bold : .medium))
                    .foregroundStyle(isOn ? .white : Theme.tertiary)
                    .lineLimit(1)
            }
            .frame(width: 66)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: isOn)
        .accessibilityLabel(Text(Formatting.authorName(name)))
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .accessibilityIdentifier("wizard.authors.\(name)")
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
                SquareImageOnBlur(image: Image(uiImage: photo), focusX: draft.focusX, focusY: draft.focusY)
            } else {
                PhotoPlaceholder()
            }
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
    }
}
#endif
