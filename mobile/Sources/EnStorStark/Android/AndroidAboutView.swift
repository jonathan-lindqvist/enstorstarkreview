import SwiftUI
import EnStorStarkModel

#if os(Android)
/// Om: the reviewer row, what the site is, how the rating works, the tip form, the location
/// note, and the version row. A long press on the version row opens the hidden login.
struct AboutView: View {
    @Bindable var request: ReviewRequestModel
    /// Opens the server menu. Only Debug builds show the row that calls it.
    var showServerPicker: () -> Void = {}
    @Environment(AppModel.self) var app
    @State var isShowingLogin = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let username = app.session.username {
                    reviewerRow(username)
                }
                intro
                ratingScale
                ReviewRequestCard(request: request)
                locationNote
                versionRow
                #if DEBUG
                Button(action: showServerPicker) {
                    ListRow(title: "Server", value: app.api.serverOrigin.absoluteString)
                }
                .buttonStyle(.plain)
                #endif
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .sheet(isPresented: $isShowingLogin) {
            LoginView()
        }
    }

    func reviewerRow(_ username: String) -> some View {
        HStack(spacing: 14) {
            Avatar(name: username, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("Recensentläge").font(Ess.titleMedium).foregroundStyle(Ess.onSurface)
                Text(verbatim: "Inloggad som \(Formatting.authorName(username))").font(Ess.bodyMedium).foregroundStyle(Ess.variant)
            }
            Spacer(minLength: 8)
            Button {
                Task { await app.session.signOut() }
            } label: {
                HStack(spacing: 6) {
                    MIcon("logout", size: 16, color: Ess.error)
                    Text("Logga ut").font(Ess.labelLarge).foregroundStyle(Ess.error)
                }
                .padding(.horizontal, 14)
                .frame(height: 40)
                .overlay(Capsule().stroke(Ess.outline, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .tonal(Ess.low, radius: 24)
    }

    var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image("Logo", bundle: .module)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 52, height: 52)
                    .accessibilityHidden(true)
                Text("Vad är En Stor Stark?").font(Ess.titleLarge).foregroundStyle(Ess.onSurface)
            }
            Text("En oberoende guide till barer. Vi besöker ställen, testar upplevelsen och skriver recensioner så att du slipper chansa när du planerar en utekväll.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.onSurface)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .tonal(Ess.low, radius: 24)
    }

    var ratingScale: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Hur fungerar betyget?").font(Ess.titleLarge).foregroundStyle(Ess.onSurface)
            Text("Varje bar får ett slutbetyg mellan 0 och 3 baserat på helhetsupplevelsen.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.variant)
            ForEach(0..<4, id: \.self) { rating in
                HStack(spacing: 14) {
                    Stars(rating: rating, size: 16).frame(width: 64, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(Formatting.ratingWord(rating)).font(Ess.titleSmall).foregroundStyle(Ess.onSurface)
                        Text(Formatting.ratingExplanation(rating)).font(Ess.bodySmall).foregroundStyle(Ess.variant)
                    }
                    Spacer()
                    Text(verbatim: "\(rating)/3").font(Ess.num(15)).foregroundStyle(rating == 3 ? Ess.amber : Ess.variant)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .tonal(Ess.low, radius: 24)
    }

    var locationNote: some View {
        HStack(alignment: .top, spacing: 14) {
            MIcon("location_off", size: 24, color: Ess.amber)
            VStack(alignment: .leading, spacing: 4) {
                Text("Kartan och din position").font(Ess.titleMedium).foregroundStyle(Ess.onSurface)
                Text("Kartan visar bara adresser från publicerade recensioner. Om du tillåter platstjänster visas din position bara på kartan i appen. Vi skickar inte positionen till vår server och sparar den inte.")
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Ess.variant)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .tonal(Ess.low, radius: 24)
    }

    @ViewBuilder var versionRow: some View {
        if let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
           let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String {
            // The login is hidden on purpose: a long press on the version row opens it.
            ListRow(title: "Version", value: "\(version) (\(buildNumber))")
                .onLongPressGesture {
                    if !app.session.isSignedIn {
                        isShowingLogin = true
                    }
                }
        }
    }
}

/// A one-line row with a title and a value, like a Material 3 list item.
struct ListRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Text(title).font(Ess.bodyLarge).foregroundStyle(Ess.onSurface)
            Spacer()
            Text(verbatim: value).font(Ess.bodyMedium).foregroundStyle(Ess.variant).lineLimit(1)
        }
        .padding(.horizontal, 16)
        .frame(height: 56)
        .tonal(Ess.low, radius: 20)
    }
}

/// The tip form: bar, place, and an optional reason.
struct ReviewRequestCard: View {
    @Bindable var request: ReviewRequestModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Vilken bar borde vi recensera?").font(Ess.titleLarge).foregroundStyle(Ess.onSurface)
            Text("Tipsa oss om ett ställe och berätta gärna varför det borde stå näst på tur. Vi samlar inte in några kontaktuppgifter.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.variant)
            if let message = request.successMessage {
                HStack(spacing: 8) {
                    MIcon("check_circle", size: 20, color: Ess.good)
                    Text(message).font(Ess.bodyMedium).foregroundStyle(Ess.good)
                }
            }
            if let message = request.errorMessage {
                FieldMessage(message: message)
            }
            TextField("Barens namn", text: $request.barName)
                .textInputAutocapitalization(.words)
            FieldMessage(message: request.fieldErrors["/barName"])
            TextField("Ort eller adress", text: $request.location)
                .textInputAutocapitalization(.words)
            FieldMessage(message: request.fieldErrors["/location"])
            TextField("Varför? (valfritt)", text: $request.motivation, axis: .vertical)
                .lineLimit(6)
            FieldMessage(message: request.fieldErrors["/motivation"])
            M3Button(text: "Skicka tips", icon: "send", iconAfter: true, height: 48,
                     isLoading: request.isSubmitting, isEnabled: request.canSubmit) {
                Task { await request.submit() }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .tonal(Ess.low, radius: 24)
    }
}
#endif
