import SwiftUI

struct LoginView: View {
    var onSuccess: (User) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("Connexion / Création de compte")
                .font(.title2).bold()
            Text("Connecte-toi pour publier.")
                .foregroundStyle(.secondary)
            Button("Se connecter rapidement") {
                onSuccess(User(id: UUID().uuidString, name: "Utilisateur"))
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .presentationDetents([.medium])
    }
}

#Preview {
    LoginView { _ in }
}
