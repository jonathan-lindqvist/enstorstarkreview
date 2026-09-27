import SwiftUI
import EnStorStarkModel

/// The reviewer login. Only reachable through the hidden gesture in "Om".
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
            Form {
                Section {
                    TextField("Användarnamn", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Lösenord", text: $password)
                        .textContentType(.password)
                        .onSubmit { submit() }
                } footer: {
                    Text("För recensenter. Efter inloggningen kan du se utkast och publicera recensioner.")
                }

                if let message = app.session.errorMessage {
                    Section {
                        Label(message, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Color.red)
                    }
                }

                Section {
                    Button {
                        submit()
                    } label: {
                        HStack {
                            Text("Logga in")
                            if app.session.isSigningIn {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(!canSubmit)
                }
            }
            .navigationTitle("Logga in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Avbryt") { dismiss() }
                }
            }
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
