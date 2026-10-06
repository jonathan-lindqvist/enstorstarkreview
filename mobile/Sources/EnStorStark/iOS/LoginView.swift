#if !os(Android)
import SwiftUI
import EnStorStarkModel

/// The hidden reviewer login sheet. Only reachable through the version row in "Om".
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
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Image("Logo", bundle: .module)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 60, height: 60)
                            .accessibilityHidden(true)
                        Text("Recensentläge").font(Theme.title(30)).foregroundStyle(.white)
                            .accessibilityAddTraits(.isHeader)
                        Text("För recensenter. Efter inloggningen kan du se utkast och publicera recensioner.")
                            .font(Theme.body(15))
                            .foregroundStyle(Theme.secondary)
                    }
                    ThemedTextField(placeholder: "Användarnamn", text: $username, icon: "person.fill", fill: Theme.raised)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                    ThemedTextField(
                        placeholder: "Lösenord",
                        text: $password,
                        icon: "key.fill",
                        error: app.session.errorMessage,
                        isSecure: true,
                        fill: Theme.raised
                    )
                    .textContentType(.password)
                    .submitLabel(.go)
                    .onSubmit { submit() }
                    Button(action: submit) {
                        ButtonLabel(text: "Logga in", isLoading: app.session.isSigningIn)
                    }
                    .buttonStyle(PrimaryButtonStyle(height: 52))
                    .disabled(!canSubmit)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
            .pageBackground()
            .navigationTitle("Logga in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel(Text("Avbryt"))
                }
            }
        }
        .presentationBackground(Color(white: 0.075))
        .onAppear {
            app.session.clearError()
        }
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
