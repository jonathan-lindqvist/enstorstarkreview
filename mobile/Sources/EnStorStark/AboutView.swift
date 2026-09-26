import SwiftUI
import EnStorStarkModel

struct AboutView: View {
    @Bindable var request: ReviewRequestModel

    var body: some View {
        Form {
            Section("Vad är En Stor Stark?") {
                Text("En oberoende guide till barer. Vi besöker ställen, testar upplevelsen och skriver recensioner så att du slipper chansa när du planerar en utekväll.")
            }

            Section("Hur fungerar betyget?") {
                Text("Varje bar får ett slutbetyg mellan 0 och 3 baserat på helhetsupplevelsen.")
                RatingScaleRow(rating: 0, text: "Inget extra.")
                RatingScaleRow(rating: 1, text: "Sticker ut lite från mängden.")
                RatingScaleRow(rating: 2, text: "Riktigt bra.")
                RatingScaleRow(rating: 3, text: "Måste upplevas. Väldigt sällsynt.")
            }

            ReviewRequestSection(request: request)

            Section("Kartan och din position") {
                Text("Kartan visar bara adresser från publicerade recensioner. Om du tillåter platstjänster visas din position bara på kartan i appen. Vi skickar inte positionen till vår server och sparar den inte.")
            }

            Section {
                if let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
                   let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String {
                    LabeledContent("Version", value: "\(version) (\(buildNumber))")
                }
                #if DEBUG
                LabeledContent("Server", value: AppConfiguration.serverOrigin.absoluteString)
                #endif
            }
        }
    }
}

struct RatingScaleRow: View {
    let rating: Int
    let text: LocalizedStringKey

    var body: some View {
        HStack(spacing: 12) {
            RatingBadge(rating: rating)
            Text(text)
        }
    }
}

struct ReviewRequestSection: View {
    @Bindable var request: ReviewRequestModel

    var body: some View {
        Section {
            if let message = request.successMessage {
                Label(message, systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Color.green)
            }
            if let message = request.errorMessage {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.red)
            }

            TextField("Barens namn", text: $request.barName)
                .textInputAutocapitalization(.words)
            FieldError(message: request.fieldErrors["/barName"])

            TextField("Ort eller adress", text: $request.location)
                .textInputAutocapitalization(.words)
            FieldError(message: request.fieldErrors["/location"])

            TextField("Varför borde vi recensera den? (valfritt)", text: $request.motivation, axis: .vertical)
                #if os(Android)
                .lineLimit(6)
                #else
                .lineLimit(3...6)
                #endif
            FieldError(message: request.fieldErrors["/motivation"])

            Button {
                Task { await request.submit() }
            } label: {
                HStack {
                    Text("Skicka tips")
                    if request.isSubmitting {
                        Spacer()
                        ProgressView()
                    }
                }
            }
            .disabled(!request.canSubmit)
        } header: {
            Text("Vilken bar borde vi recensera?")
        } footer: {
            Text("Tipsa oss om ett ställe och berätta gärna varför det borde stå näst på tur. Vi samlar inte in några kontaktuppgifter.")
        }
    }
}

struct FieldError: View {
    let message: String?

    var body: some View {
        if let message {
            Text(message)
                .font(.caption)
                .foregroundStyle(Color.red)
        }
    }
}
