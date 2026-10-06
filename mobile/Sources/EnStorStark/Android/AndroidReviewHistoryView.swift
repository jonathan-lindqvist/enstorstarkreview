import SwiftUI
import EnStorStarkModel

// Android keeps the plain system screens until the Android design exists.
#if os(Android)
struct ReviewHistoryView: View {
    let title: String
    @State var loader: Loader<ReviewHistory>

    init(title: String, loader: Loader<ReviewHistory>) {
        self.title = title
        _loader = State(initialValue: loader)
    }

    var body: some View {
        List {
            if let errorMessage = loader.errorMessage {
                ErrorBanner(message: errorMessage) { await loader.load() }
            }
            if let history = loader.value {
                if history.entries.isEmpty {
                    Text("Inga uppdateringar har registrerats ännu.")
                        .foregroundStyle(.secondary)
                }
                ForEach(Array(history.entries.enumerated()), id: \.offset) { _, entry in
                    Section {
                        if entry.changes.isEmpty {
                            Text("Ingen innehållsändring registrerad för den här uppdateringen.")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(Array(entry.changes.enumerated()), id: \.offset) { _, change in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(change.label)
                                    .font(.caption.weight(.semibold))
                                    .textCase(.uppercase)
                                    .foregroundStyle(.secondary)
                                ChangeValue(label: "Tidigare", value: change.before, tint: .secondary)
                                ChangeValue(label: "Ny", value: change.after, tint: .green)
                            }
                            .padding(.vertical, 4)
                        }
                    } header: {
                        Text("\(Formatting.dateTime(entry.updatedAt)) av \(Formatting.authorName(entry.updatedBy))")
                    }
                }
            }
        }
        .overlay {
            if loader.value == nil && loader.errorMessage == nil {
                ProgressView()
            }
        }
        .navigationTitle("Ändringslogg")
        .refreshable {
            await loader.load()
        }
        .task {
            await loader.load()
        }
    }
}

struct ChangeValue: View {
    let label: LocalizedStringKey
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2.weight(.bold))
                .foregroundStyle(tint)
            Text(value.isEmpty ? "–" : value)
                .font(.subheadline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(tint.opacity(0.1)))
    }
}
#endif
