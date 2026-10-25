#if os(Android)
import SwiftUI
import EnStorStarkModel

/// Om (Droid08, Droid09, Droid12): what the site is, how the rating works, the tip form, the
/// location note, and the version row. A long press on the version row opens the hidden login.
struct AboutView: View {
    @Bindable var request: ReviewRequestModel
    /// Changes the server. Only Debug builds show the row that opens the server menu.
    var selectServer: (URL) -> Void = { _ in }
    @Environment(AppModel.self) var app
    @State var isShowingLogin = false
    @State var isShowingServerPicker = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let username = app.session.username {
                    reviewerCard(username)
                }
                intro
                ratingScale
                ReviewRequestCard(request: request)
                locationNote
                VersionRow { isShowingLogin = true }
                #if DEBUG
                Button { isShowingServerPicker = true } label: {
                    HStack {
                        Text("Server").font(Ess.bodyLarge).foregroundStyle(.white)
                        Spacer()
                        Text(app.api.serverOrigin.absoluteString)
                            .font(Ess.bodyMedium)
                            .foregroundStyle(Ess.secondary)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 56)
                    .essCard(20)
                }
                .buttonStyle(.plain)
                #endif
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Ess.bg)
        .scrollDismissesKeyboard(.interactively)
        .sheet(isPresented: $isShowingLogin) {
            LoginView()
        }
        #if DEBUG
        .sheet(isPresented: $isShowingServerPicker) {
            ServerPickerView(current: app.api.serverOrigin, onSelect: selectServer)
        }
        #endif
    }

    func reviewerCard(_ username: String) -> some View {
        HStack(spacing: 16) {
            Avatar(name: username, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("Recensentläge").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                Text("Inloggad som \(Formatting.authorName(username))").font(Ess.bodyMedium).foregroundStyle(Ess.secondary)
            }
            Spacer(minLength: 8)
            TonalButton(text: "Logga ut", icon: .logout, height: 40, color: Ess.bad, fill: Ess.badContainer, fillsWidth: false) {
                Task { await app.session.signOut() }
            }
        }
        .padding(16)
        .essCard()
    }

    var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image("Logo", bundle: .module)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 52, height: 52)
                    .accessibilityHidden(true)
                Text("Vad är En Stor Stark?").font(Ess.titleLarge).foregroundStyle(.white)
            }
            Text("En oberoende guide till barer. Vi besöker ställen, testar upplevelsen och skriver recensioner så att du slipper chansa när du planerar en utekväll.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Color.white.opacity(0.88))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .essCard()
    }

    var ratingScale: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Hur fungerar betyget?").font(Ess.titleLarge).foregroundStyle(.white)
            Text("Varje bar får ett slutbetyg mellan 0 och 3 baserat på helhetsupplevelsen.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.secondary)
            ForEach(0..<4, id: \.self) { rating in
                HStack(spacing: 14) {
                    Stars(rating: rating, size: 16).frame(width: 62, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(Formatting.ratingWord(rating)).font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                        Text(Formatting.ratingExplanation(rating)).font(Ess.bodySmall).foregroundStyle(Ess.secondary)
                    }
                    Spacer()
                    Text(verbatim: "\(rating)/3")
                        .font(Ess.num(15))
                        .foregroundStyle(rating == 3 ? Ess.amber : Ess.secondary)
                        .glow(rating == 3, radius: 8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .essCard()
    }

    var locationNote: some View {
        HStack(alignment: .top, spacing: 16) {
            EssIconView(.locationOff, color: Ess.amber)
            VStack(alignment: .leading, spacing: 4) {
                Text("Kartan och din position").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                Text("Kartan visar bara adresser från publicerade recensioner. Om du tillåter platstjänster visas din position bara på kartan i appen. Vi skickar inte positionen till vår server och sparar den inte.")
                    .font(Ess.bodyMedium)
                    .foregroundStyle(Ess.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .essCard()
    }
}

struct ReviewRequestCard: View {
    @Bindable var request: ReviewRequestModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Vilken bar borde vi recensera?").font(Ess.titleLarge).foregroundStyle(.white)
            Text("Tipsa oss om ett ställe och berätta gärna varför det borde stå näst på tur. Vi samlar inte in några kontaktuppgifter.")
                .font(Ess.bodyMedium)
                .foregroundStyle(Ess.secondary)
            if let message = request.successMessage {
                HStack(spacing: 8) {
                    EssIconView(.check, size: 20, color: Ess.good)
                    Text(message).font(.system(size: 14, weight: .semibold)).foregroundStyle(Ess.good)
                }
            }
            if let message = request.errorMessage {
                HStack(spacing: 8) {
                    EssIconView(.error, size: 20, color: Ess.bad)
                    Text(message).font(.system(size: 14, weight: .semibold)).foregroundStyle(Ess.bad)
                }
            }
            EssField(label: "Barens namn", text: $request.barName, error: request.fieldErrors["/barName"])
                .textInputAutocapitalization(.words)
            EssField(label: "Ort eller adress", text: $request.location, error: request.fieldErrors["/location"])
                .textInputAutocapitalization(.words)
            EssField(label: "Varför borde vi recensera den? (valfritt)", text: $request.motivation,
                     error: request.fieldErrors["/motivation"], isMultiline: true, minHeight: 96)
            PrimaryButton(text: "Skicka tips", icon: .send, height: 52, isLoading: request.isSubmitting,
                          isEnabled: request.canSubmit) {
                Task { await request.submit() }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .essCard()
    }
}

/// The version row. A long press on it opens the hidden reviewer login; a spinner shows while
/// the finger stays down.
struct VersionRow: View {
    let openLogin: () -> Void
    @Environment(AppModel.self) var app
    @State var isPressing = false

    var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "–"
        let build = info?["CFBundleVersion"] as? String ?? "–"
        return "\(short) (\(build))"
    }

    var body: some View {
        HStack(spacing: 10) {
            Text("Version").font(Ess.bodyLarge).foregroundStyle(.white)
            Spacer()
            Text(version).font(Ess.bodyLarge).foregroundStyle(Ess.secondary)
            if isPressing {
                ProgressView().tint(Ess.amber).frame(width: 20, height: 20)
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 56)
        .essCard(20, fill: isPressing ? Ess.raised2 : Ess.raised)
        .onLongPressGesture(minimumDuration: 0.8) {
            isPressing = false
            guard !app.session.isSignedIn else { return }
            openLogin()
        } onPressingChanged: { pressing in
            guard !app.session.isSignedIn else { return }
            isPressing = pressing
        }
    }
}
#endif
