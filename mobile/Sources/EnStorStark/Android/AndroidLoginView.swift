#if os(Android)
import SwiftUI
import EnStorStarkModel

/// The hidden reviewer login (Droid10), a modal bottom sheet. Only reachable through the
/// version row in "Om".
struct LoginView: View {
    @Environment(AppModel.self) var app
    @Environment(\.dismiss) var dismiss
    @State var username = ""
    @State var password = ""

    var canSubmit: Bool {
        !app.session.isSigningIn
            && !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Image("Logo", bundle: .module)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 56, height: 56)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Recensentläge").font(Ess.headlineMedium).foregroundStyle(.white)
                    Text("För recensenter. Efter inloggningen kan du se utkast och publicera recensioner.")
                        .font(Ess.bodyMedium)
                        .foregroundStyle(Ess.secondary)
                }
                EssField(label: "Användarnamn", text: $username, icon: .person)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                EssField(label: "Lösenord", text: $password, icon: .key, error: app.session.errorMessage, isSecure: true)
                    .textContentType(.password)
                    .submitLabel(.go)
                    .onSubmit { submit() }
                PrimaryButton(text: "Logga in", height: 52, isLoading: app.session.isSigningIn, isEnabled: canSubmit) {
                    submit()
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .background(Ess.raised)
        .onAppear { app.session.clearError() }
    }

    func submit() {
        guard canSubmit else { return }
        Task {
            if await app.session.signIn(username: username, password: password) {
                password = ""
                dismiss()
            }
        }
    }
}
#endif
