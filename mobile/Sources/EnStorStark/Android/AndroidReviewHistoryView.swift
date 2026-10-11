import SwiftUI
import EnStorStarkModel

#if os(Android)
/// The change log: one entry per update, with the reviewer, the time, and old → new values.
struct ReviewHistoryView: View {
    let title: String
    @State var loader: Loader<ReviewHistory>

    init(title: String, loader: Loader<ReviewHistory>) {
        self.title = title
        _loader = State(initialValue: loader)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(title).font(Ess.bodyMedium).foregroundStyle(Ess.variant)
                if let errorMessage = loader.errorMessage {
                    ErrorCard(message: errorMessage) { await loader.load() }
                }
                if let history = loader.value {
                    if history.entries.isEmpty {
                        EmptyState(icon: "history", title: "Inga uppdateringar har registrerats ännu.")
                    }
                    ForEach(Array(history.entries.enumerated()), id: \.offset) { _, entry in
                        HistoryEntryView(entry: entry)
                    }
                } else if loader.errorMessage == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .navigationTitle("Ändringslogg")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await loader.load()
        }
        .task {
            await loader.load()
        }
    }
}

struct HistoryEntryView: View {
    let entry: ReviewHistoryEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Avatar(name: entry.updatedBy, size: 36)
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: "av \(Formatting.authorName(entry.updatedBy))")
                        .font(Ess.titleSmall)
                        .foregroundStyle(Ess.onSurface)
                    Text(verbatim: Formatting.dateTime(entry.updatedAt))
                        .font(Ess.bodySmall)
                        .foregroundStyle(Ess.variant)
                }
                VStack(alignment: .leading, spacing: 12) {
                    if entry.changes.isEmpty {
                        Text("Ingen innehållsändring registrerad för den här uppdateringen.")
                            .font(Ess.bodyMedium)
                            .foregroundStyle(Ess.variant)
                    }
                    ForEach(Array(entry.changes.enumerated()), id: \.offset) { _, change in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(change.label).font(Ess.labelMedium).foregroundStyle(Ess.variant)
                            if !change.before.isEmpty {
                                Text(verbatim: change.before)
                                    .font(Ess.bodyMedium)
                                    .strikethrough()
                                    .foregroundStyle(Ess.outline)
                            }
                            HStack(alignment: .top, spacing: 6) {
                                if !change.before.isEmpty {
                                    MIcon("arrow_forward", size: 16, color: Ess.amber)
                                }
                                Text(verbatim: change.after.isEmpty ? "–" : change.after)
                                    .font(Ess.bodyMedium.weight(.semibold))
                                    .foregroundStyle(Ess.onSurface)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .tonal(Ess.low, radius: 16)
                .outlined(radius: 16)
            }
        }
    }
}
#endif
