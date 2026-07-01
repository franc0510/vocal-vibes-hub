import Foundation
import SwiftUI

enum AuthState: Equatable {
    case guest
    case authenticated(User)
}

struct User: Equatable, Identifiable {
    let id: String
    let name: String
}

final class Session: ObservableObject {
    @Published var authState: AuthState = .guest

    func requireAuth(then: @escaping () -> Void, presentLogin: () -> Void) {
        switch authState {
        case .guest:
            presentLogin()
        case .authenticated:
            then()
        }
    }

    func didLogin(user: User) {
        authState = .authenticated(user)
    }

    func logout() {
        authState = .guest
    }
}
