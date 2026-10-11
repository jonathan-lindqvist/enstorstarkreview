import SwiftUI
import EnStorStarkModel

#if os(Android)
/// The reviewer login, in a Material 3 bottom sheet. Only reachable through the hidden
/// gesture in "Om".
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
                    Text("Recensentläge").font(Ess.headlineMedium).foregroundStyle(Ess.onSurface)
                    Text("För recensenter. Efter inloggningen kan du se utkast och publicera recensioner.")
                        .font(Ess.bodyMedium)
                        .foregroundStyle(Ess.variant)
                }
                TextField("Användarnamn", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Lösenord", text: $password)
                    .textContentType(.password)
                    .onSubmit { submit() }
                if let message = app.session.errorMessage {
                    ErrorCard(message: message)
                }
                M3Button(text: "Logga in", isLoading: app.session.isSigningIn, isEnabled: canSubmit) { submit() }
                Button("Avbryt") { dismiss() }
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
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
