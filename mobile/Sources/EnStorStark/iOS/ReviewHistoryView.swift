#if !os(Android)
import SwiftUI
import EnStorStarkModel

/// The change log as a timeline of editors, with before → after for each field.
struct ReviewHistoryView: View {
    let title: String
    @State var loader: Loader<ReviewHistory>

    init(title: String, loader: Loader<ReviewHistory>) {
        self.title = title
        _loader = State(initialValue: loader)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let errorMessage = loader.errorMessage {
                    ErrorCard(message: errorMessage) { await loader.load() }
                        .padding(.bottom, 16)
                }
                if let history = loader.value {
                    if history.entries.isEmpty {
                        EmptyState(icon: "clock.arrow.circlepath", title: "Inga uppdateringar har registrerats ännu.")
                    }
                    ForEach(Array(history.entries.enumerated()), id: \.offset) { index, entry in
                        HistoryEntryView(entry: entry, isLast: index == history.entries.count - 1)
                    }
                } else if loader.errorMessage == nil {
                    ProgressView().tint(Theme.amber).frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .navigationTitle("Ändringslogg")
        .navigationSubtitle(loader.value?.title ?? title)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loader.load() }
        .task { await loader.load() }
    }
}

struct HistoryEntryView: View {
    let entry: ReviewHistoryEntry
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 0) {
                Avatar(name: entry.updatedBy, size: 32)
                if !isLast {
                    Rectangle().fill(Theme.hairline).frame(width: 2).frame(maxHeight: .infinity)
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("av \(Formatting.authorName(entry.updatedBy))").font(Theme.body(16, .bold)).foregroundStyle(.white)
                    Text(Formatting.dateTime(entry.updatedAt)).font(Theme.body(13)).foregroundStyle(Theme.secondary)
                }
                .accessibilityElement(children: .combine)
                if entry.changes.isEmpty {
                    Text("Ingen innehållsändring registrerad för den här uppdateringen.")
                        .font(Theme.body(14))
                        .foregroundStyle(Theme.tertiary)
                }
                ForEach(Array(entry.changes.enumerated()), id: \.offset) { _, change in
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow(text: change.label)
                        HStack(alignment: .top, spacing: 10) {
                            Text(change.before.isEmpty ? "–" : change.before)
                                .font(Theme.body(14))
                                .foregroundStyle(Theme.secondary)
                                .strikethrough(color: Theme.tertiary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "arrow.right")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Theme.amber)
                                .padding(.top, 3)
                            Text(change.after.isEmpty ? "–" : change.after)
                                .font(Theme.body(14, .semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardBackground(18)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Text("\(change.label): från \(change.before.isEmpty ? "tomt" : change.before) till \(change.after.isEmpty ? "tomt" : change.after)"))
                }
            }
            .padding(.bottom, 22)
        }
    }
}
#endif
