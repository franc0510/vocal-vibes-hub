import SwiftUI

struct WeeklyChallengeView: View {
    @EnvironmentObject var session: Session
    @State private var navigateToReals = false
    @State private var showLogin = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Weekly Challenge")
                    .font(.largeTitle).bold()
                Text("Découvre le défi de la semaine et participe !")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                NavigationLink("Voir les Reals", destination: RealsView(), isActive: $navigateToReals)
                    .buttonStyle(.borderedProminent)

                Button("Publier mon Real pour le challenge") {
                    session.requireAuth(then: {
                        // Navigate to Reals with intent to publish (simplified)
                        navigateToReals = true
                    }, presentLogin: {
                        showLogin = true
                    })
                }
                .buttonStyle(.bordered)
            }
            .padding()
            .navigationTitle("Challenge")
        }
        .sheet(isPresented: $showLogin) {
            LoginView { user in
                session.didLogin(user: user)
                navigateToReals = true
            }
        }
    }
}

#Preview {
    WeeklyChallengeView()
        .environmentObject(Session())
}
