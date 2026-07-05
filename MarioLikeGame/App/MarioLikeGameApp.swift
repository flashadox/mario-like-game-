import SwiftUI

@main
struct MarioLikeGameApp: App {
    var body: some Scene {
        WindowGroup {
            GameView()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}