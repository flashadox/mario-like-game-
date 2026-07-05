import SpriteKit
import SwiftUI

struct GameView: View {
    @State private var scene: GameScene

    init() {
        let scene = GameScene(size: CGSize(width: 844, height: 390))
        scene.scaleMode = .resizeFill
        _scene = State(initialValue: scene)
    }

    var body: some View {
        ZStack {
            SpriteView(scene: scene, options: [.ignoresSiblingOrder])
                .ignoresSafeArea()

            VStack {
                HStack(spacing: 14) {
                    Spacer()

                    Button {
                        scene.togglePause()
                    } label: {
                        Image(systemName: "pause.fill")
                            .font(.system(size: 20, weight: .bold))
                            .frame(width: 54, height: 54)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)
                    .background(.black.opacity(0.28), in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.35), lineWidth: 1))

                    Button {
                        scene.restartLevel()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 22, weight: .bold))
                            .frame(width: 54, height: 54)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)
                    .background(.black.opacity(0.28), in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.35), lineWidth: 1))

                    Spacer()
                }
                .padding(.top, 14)

                Spacer()

                HStack(alignment: .bottom) {
                    HStack(spacing: 18) {
                        HoldButton(systemName: "arrow.left") { isHeld in
                            scene.setMovingLeft(isHeld)
                        }

                        HoldButton(systemName: "arrow.right") { isHeld in
                            scene.setMovingRight(isHeld)
                        }
                    }

                    Spacer()

                    HStack(spacing: 18) {
                        HoldButton(systemName: "flame.fill") { isHeld in
                            scene.setShooting(isHeld)
                        }

                        HoldButton(systemName: "arrow.up") { isHeld in
                            scene.setJumping(isHeld)
                        }
                    }
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 24)
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct HoldButton: View {
    let systemName: String
    let onHoldChanged: (Bool) -> Void

    init(systemName: String, onHoldChanged: @escaping (Bool) -> Void) {
        self.systemName = systemName
        self.onHoldChanged = onHoldChanged
    }

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 30, weight: .black))
            .foregroundStyle(.white)
            .frame(width: 76, height: 76)
            .background(.black.opacity(0.30), in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.38), lineWidth: 1))
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in onHoldChanged(true) }
                    .onEnded { _ in onHoldChanged(false) }
            )
            .accessibilityLabel(Text(systemName))
    }
}
