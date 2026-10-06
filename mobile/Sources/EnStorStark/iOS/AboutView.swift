#if !os(Android)
import SwiftUI
import EnStorStarkModel

/// Om: what the site is, how the rating works, the tip form, the location note,
/// and the version row. A long press on the version row opens the hidden login.
struct AboutView: View {
    @Bindable var request: ReviewRequestModel
    /// Opens the server menu. Only Debug builds show the row that calls it.
    var showServerPicker: () -> Void = {}
    @Environment(AppModel.self) var app
    @State var isShowingLogin = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let username = app.session.username {
                    reviewerCard(username)
                }
                intro
                ratingScale
                ReviewRequestCard(request: request)
                locationNote
                VersionRow { isShowingLogin = true }
                #if DEBUG
                Button(action: showServerPicker) {
                    HStack {
                        Text("Server").font(Theme.body(16)).foregroundStyle(.white)
                        Spacer()
                        Text(app.api.serverOrigin.absoluteString)
                            .font(Theme.body(14))
                            .foregroundStyle(Theme.secondary)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 18)
                    .frame(height: 54)
                    .cardBackground(20)
                }
                .buttonStyle(.plain)
                #endif
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .scrollDismissesKeyboard(.interactively)
        .sheet(isPresented: $isShowingLogin) {
            LoginView()
        }
    }

    func reviewerCard(_ username: String) -> some View {
        HStack(spacing: 12) {
            Avatar(name: username, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("Recensentläge").font(Theme.body(16, .bold)).foregroundStyle(.white)
                Text("Inloggad som \(Formatting.authorName(username))").font(Theme.body(13)).foregroundStyle(Theme.secondary)
            }
            Spacer()
            Button("Logga ut") {
                Task { await app.session.signOut() }
            }
            .font(Theme.body(14, .semibold))
            .foregroundStyle(Theme.bad)
            .buttonStyle(.glass)
        }
        .padding(16)
        .cardBackground(24)
    }

    var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image("Logo", bundle: .module)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 54, height: 54)
                    .accessibilityHidden(true)
                Text("Vad är En Stor Stark?").font(Theme.title(21)).foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
            }
            Text("En oberoende guide till barer. Vi besöker ställen, testar upplevelsen och skriver recensioner så att du slipper chansa när du planerar en utekväll.")
                .font(Theme.body(15))
                .foregroundStyle(.white.opacity(0.82))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .cardBackground(26)
    }

    var ratingScale: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Hur fungerar betyget?").font(Theme.title(19)).foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            Text("Varje bar får ett slutbetyg mellan 0 och 3 baserat på helhetsupplevelsen.")
                .font(Theme.body(14))
                .foregroundStyle(Theme.secondary)
            VStack(alignment: .leading, spacing: 12) {
                ForEach(0..<4, id: \.self) { rating in
                    HStack(spacing: 14) {
                        Stars(rating: rating, size: 15, glow: rating == 3).frame(width: 64, alignment: .leading)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(Formatting.ratingWord(rating)).font(Theme.body(15, .bold)).foregroundStyle(.white)
                            Text(Formatting.ratingExplanation(rating)).font(Theme.body(13)).foregroundStyle(Theme.secondary)
                        }
                        Spacer()
                        Text(verbatim: "\(rating)/3").font(Theme.num(15)).foregroundStyle(rating == 3 ? Theme.amber : Theme.tertiary)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .cardBackground(26)
    }

    var locationNote: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "location.slash.fill")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.amber)
                .frame(width: 36, height: 36)
                .background(Theme.amber.opacity(0.14), in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text("Kartan och din position").font(Theme.body(16, .bold)).foregroundStyle(.white)
                Text("Kartan visar bara adresser från publicerade recensioner. Om du tillåter platstjänster visas din position bara på kartan i appen. Vi skickar inte positionen till vår server och sparar den inte.")
                    .font(Theme.body(13))
                    .foregroundStyle(Theme.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .cardBackground(24)
        .accessibilityElement(children: .combine)
    }
}

struct ReviewRequestCard: View {
    @Bindable var request: ReviewRequestModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Vilken bar borde vi recensera?").font(Theme.title(19)).foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            Text("Tipsa oss om ett ställe och berätta gärna varför det borde stå näst på tur. Vi samlar inte in några kontaktuppgifter.")
                .font(Theme.body(13))
                .foregroundStyle(Theme.secondary)
            if let message = request.successMessage {
                Label(message, systemImage: "checkmark.circle.fill")
                    .font(Theme.body(14, .semibold))
                    .foregroundStyle(Theme.good)
            }
            if let message = request.errorMessage {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .font(Theme.body(14, .semibold))
                    .foregroundStyle(Theme.bad)
            }
            ThemedTextField(placeholder: "Barens namn", text: $request.barName, error: request.fieldErrors["/barName"])
                .textInputAutocapitalization(.words)
            ThemedTextField(placeholder: "Ort eller adress", text: $request.location, error: request.fieldErrors["/location"])
                .textInputAutocapitalization(.words)
            ThemedTextField(
                placeholder: "Varför borde vi recensera den? (valfritt)",
                text: $request.motivation,
                error: request.fieldErrors["/motivation"],
                axis: .vertical
            )
            Button {
                Task { await request.submit() }
            } label: {
                ButtonLabel(text: "Skicka tips", icon: "paperplane.fill", isLoading: request.isSubmitting)
            }
            .buttonStyle(PrimaryButtonStyle(height: 50))
            .disabled(!request.canSubmit)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .cardBackground(26)
    }
}

/// The version row. A long press on it opens the hidden reviewer login; a ring fills while
/// the finger stays down.
struct VersionRow: View {
    let openLogin: () -> Void
    @Environment(AppModel.self) var app
    @State var isPressing = false
    @State var progress: CGFloat = 0
    @State var openCount = 0
    static let duration = 0.8

    var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "–"
        let build = info?["CFBundleVersion"] as? String ?? "–"
        return "\(short) (\(build))"
    }

    var body: some View {
        HStack {
            Text("Version").font(Theme.body(16)).foregroundStyle(.white)
            Spacer()
            Text(version).font(Theme.body(16)).foregroundStyle(Theme.secondary)
            if isPressing {
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(Theme.amber, style: .init(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 20, height: 20)
                    .padding(.leading, 6)
            }
        }
        .padding(.horizontal, 18)
        .frame(height: 54)
        .cardBackground(20, fill: isPressing ? Theme.raised3 : Theme.raised)
        .scaleEffect(isPressing ? 0.97 : 1)
        .animation(.snappy(duration: 0.2), value: isPressing)
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: Self.duration) {
            isPressing = false
            guard !app.session.isSignedIn else { return }
            openCount += 1
            openLogin()
        } onPressingChanged: { pressing in
            guard !app.session.isSignedIn else { return }
            isPressing = pressing
            progress = 0
            if pressing {
                withAnimation(.linear(duration: Self.duration)) { progress = 1 }
            }
        }
        .sensoryFeedback(.impact, trigger: openCount)
        .accessibilityElement(children: .combine)
    }
}
#endif
