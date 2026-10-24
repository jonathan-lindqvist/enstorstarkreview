#if os(Android)
import SwiftUI
import EnStorStarkModel

/// The change log (Droid05): one entry per editor, with before → after for each field.
struct ReviewHistoryView: View {
    let title: String
    @State var loader: Loader<ReviewHistory>

    init(title: String, loader: Loader<ReviewHistory>) {
        self.title = title
        _loader = State(initialValue: loader)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(loader.value?.title ?? title)
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Ess.secondary)
                if let errorMessage = loader.errorMessage {
                    ErrorCard(message: errorMessage) { await loader.load() }
                }
                if let history = loader.value {
                    if history.entries.isEmpty {
                        EmptyState(icon: .history, title: "Inga uppdateringar har registrerats ännu.")
                    }
                    ForEach(Array(history.entries.enumerated()), id: \.offset) { _, entry in
                        HistoryEntryView(entry: entry)
                    }
                } else if loader.errorMessage == nil {
                    EssProgress().frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Ess.bg)
        .navigationTitle("Ändringslogg")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await loader.load() }
        .task { await loader.load() }
    }
}

struct HistoryEntryView: View {
    let entry: ReviewHistoryEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Avatar(name: entry.updatedBy, size: 32)
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("av \(Formatting.authorName(entry.updatedBy))").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                    Text(Formatting.dateTime(entry.updatedAt)).font(Ess.bodySmall).foregroundStyle(Ess.secondary)
                }
                VStack(alignment: .leading, spacing: 12) {
                    if entry.changes.isEmpty {
                        Text("Ingen innehållsändring registrerad för den här uppdateringen.")
                            .font(Ess.bodyMedium)
                            .foregroundStyle(Ess.tertiary)
                    }
                    ForEach(Array(entry.changes.enumerated()), id: \.offset) { _, change in
                        VStack(alignment: .leading, spacing: 6) {
                            SectionLabel(text: change.label)
                            HStack(alignment: .top, spacing: 8) {
                                if !change.before.isEmpty {
                                    Text(change.before)
                                        .font(Ess.bodyMedium)
                                        .foregroundStyle(Ess.secondary)
                                        .strikethrough()
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    EssIconView(.forward, size: 16, color: Ess.amber).padding(.top, 2)
                                }
                                Text(change.after.isEmpty ? "–" : change.after)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .accessibilityLabel(Text("\(change.label): från \(change.before.isEmpty ? "tomt" : change.before) till \(change.after.isEmpty ? "tomt" : change.after)"))
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .essCard(18)
            }
        }
    }
}
#endif
