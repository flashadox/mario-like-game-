import SpriteKit

final class GameScene: SKScene, SKPhysicsContactDelegate {
    private enum Category {
        static let player: UInt32 = 1 << 0
        static let ground: UInt32 = 1 << 1
        static let coin: UInt32 = 1 << 2
        static let hazard: UInt32 = 1 << 3
        static let goal: UInt32 = 1 << 4
    }

    private let player = SKSpriteNode(color: .systemRed, size: CGSize(width: 38, height: 48))
    private let cameraNode = SKCameraNode()
    private let scoreLabel = SKLabelNode(fontNamed: "AvenirNext-Heavy")
    private let messageLabel = SKLabelNode(fontNamed: "AvenirNext-Heavy")

    private var movingLeft = false
    private var movingRight = false
    private var jumpHeld = false
    private var canJump = false
    private var score = 0
    private var levelComplete = false
    private var lastUpdateTime: TimeInterval = 0

    override func didMove(to view: SKView) {
        configureWorld()
        restartLevel()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        layoutHUD()
    }

    func setMovingLeft(_ isMoving: Bool) {
        movingLeft = isMoving
    }

    func setMovingRight(_ isMoving: Bool) {
        movingRight = isMoving
    }

    func setJumping(_ isJumping: Bool) {
        jumpHeld = isJumping
    }

    func restartLevel() {
        removeAllChildren()
        physicsWorld.gravity = CGVector(dx: 0, dy: -18)
        physicsWorld.contactDelegate = self
        backgroundColor = SKColor(red: 0.46, green: 0.76, blue: 0.96, alpha: 1.0)
        score = 0
        levelComplete = false
        lastUpdateTime = 0

        addCamera()
        addLevelGeometry()
        addCoins()
        addHazards()
        addGoal()
        addPlayer()
        updateScoreLabel()
    }

    override func update(_ currentTime: TimeInterval) {
        let deltaTime = lastUpdateTime == 0 ? 0 : min(currentTime - lastUpdateTime, 1.0 / 30.0)
        lastUpdateTime = currentTime

        guard !levelComplete else {
            centerCamera()
            return
        }

        applyInput(deltaTime: deltaTime)
        centerCamera()

        if player.position.y < -160 {
            showMessage("Try again")
            restartPlayer()
        }
    }

    func didBegin(_ contact: SKPhysicsContact) {
        let bodies = [contact.bodyA, contact.bodyB]
        guard bodies.contains(where: { $0.categoryBitMask == Category.player }) else { return }

        if let coin = bodies.first(where: { $0.categoryBitMask == Category.coin })?.node {
            collect(coin)
        }

        if bodies.contains(where: { $0.categoryBitMask == Category.hazard }) {
            showMessage("Ouch")
            restartPlayer()
        }

        if bodies.contains(where: { $0.categoryBitMask == Category.goal }) {
            levelComplete = true
            player.physicsBody?.velocity.dx = 0
            showMessage("Level clear")
        }

        if bodies.contains(where: { $0.categoryBitMask == Category.ground }) {
            canJump = true
        }
    }

    private func configureWorld() {
        view?.isMultipleTouchEnabled = true
    }

    private func addCamera() {
        cameraNode.removeAllChildren()
        camera = cameraNode
        addChild(cameraNode)

        scoreLabel.fontSize = 22
        scoreLabel.horizontalAlignmentMode = .left
        scoreLabel.verticalAlignmentMode = .center
        scoreLabel.fontColor = .white
        scoreLabel.zPosition = 100
        scoreLabel.addShadow()
        cameraNode.addChild(scoreLabel)

        messageLabel.fontSize = 34
        messageLabel.horizontalAlignmentMode = .center
        messageLabel.verticalAlignmentMode = .center
        messageLabel.fontColor = .white
        messageLabel.zPosition = 100
        messageLabel.addShadow()
        cameraNode.addChild(messageLabel)
        layoutHUD()
    }

    private func layoutHUD() {
        scoreLabel.position = CGPoint(x: -size.width / 2 + 24, y: size.height / 2 - 44)
        messageLabel.position = CGPoint(x: 0, y: size.height / 2 - 82)
    }

    private func addLevelGeometry() {
        addBlock(
            at: CGPoint(x: 2_000, y: 20),
            size: CGSize(width: 4_100, height: 40),
            color: SKColor(red: 0.18, green: 0.55, blue: 0.24, alpha: 1.0),
            category: Category.ground
        )

        for x in stride(from: 80, through: 3_840, by: 160) {
            let grass = SKSpriteNode(color: SKColor(red: 0.10, green: 0.70, blue: 0.28, alpha: 1.0), size: CGSize(width: 84, height: 8))
            grass.position = CGPoint(x: x, y: 44)
            grass.zPosition = 1
            addChild(grass)
        }

        let platforms: [(CGPoint, CGSize)] = [
            (CGPoint(x: 390, y: 116), CGSize(width: 180, height: 24)),
            (CGPoint(x: 690, y: 182), CGSize(width: 170, height: 24)),
            (CGPoint(x: 1_060, y: 140), CGSize(width: 220, height: 24)),
            (CGPoint(x: 1_430, y: 220), CGSize(width: 190, height: 24)),
            (CGPoint(x: 1_820, y: 150), CGSize(width: 240, height: 24)),
            (CGPoint(x: 2_180, y: 226), CGSize(width: 180, height: 24)),
            (CGPoint(x: 2_620, y: 150), CGSize(width: 260, height: 24)),
            (CGPoint(x: 3_030, y: 218), CGSize(width: 210, height: 24))
        ]

        for platform in platforms {
            addBlock(
                at: platform.0,
                size: platform.1,
                color: SKColor(red: 0.62, green: 0.38, blue: 0.18, alpha: 1.0),
                category: Category.ground
            )
        }

        for x in [520, 1_235, 1_950, 2_850, 3_320] {
            addBlock(
                at: CGPoint(x: x, y: 72),
                size: CGSize(width: 54, height: 62),
                color: SKColor(red: 0.82, green: 0.39, blue: 0.18, alpha: 1.0),
                category: Category.ground
            )
        }
    }

    private func addCoins() {
        let coinPositions = [
            CGPoint(x: 380, y: 170),
            CGPoint(x: 690, y: 240),
            CGPoint(x: 1_050, y: 198),
            CGPoint(x: 1_430, y: 278),
            CGPoint(x: 1_820, y: 208),
            CGPoint(x: 2_180, y: 284),
            CGPoint(x: 2_620, y: 208),
            CGPoint(x: 3_030, y: 276),
            CGPoint(x: 3_420, y: 120)
        ]

        for position in coinPositions {
            let coin = SKShapeNode(circleOfRadius: 15)
            coin.name = "coin"
            coin.fillColor = SKColor(red: 1.0, green: 0.82, blue: 0.16, alpha: 1.0)
            coin.strokeColor = SKColor(red: 0.96, green: 0.58, blue: 0.08, alpha: 1.0)
            coin.lineWidth = 3
            coin.position = position
            coin.zPosition = 4
            coin.physicsBody = SKPhysicsBody(circleOfRadius: 15)
            coin.physicsBody?.isDynamic = false
            coin.physicsBody?.categoryBitMask = Category.coin
            coin.physicsBody?.contactTestBitMask = Category.player
            coin.physicsBody?.collisionBitMask = 0
            addChild(coin)
        }
    }

    private func addHazards() {
        for position in [CGPoint(x: 880, y: 70), CGPoint(x: 1_630, y: 70), CGPoint(x: 2_390, y: 70), CGPoint(x: 3_210, y: 70)] {
            let hazard = SKShapeNode(rectOf: CGSize(width: 42, height: 34), cornerRadius: 8)
            hazard.name = "hazard"
            hazard.fillColor = SKColor(red: 0.14, green: 0.12, blue: 0.17, alpha: 1.0)
            hazard.strokeColor = SKColor(red: 0.95, green: 0.24, blue: 0.17, alpha: 1.0)
            hazard.lineWidth = 4
            hazard.position = position
            hazard.zPosition = 4
            hazard.physicsBody = SKPhysicsBody(rectangleOf: CGSize(width: 42, height: 34))
            hazard.physicsBody?.isDynamic = false
            hazard.physicsBody?.categoryBitMask = Category.hazard
            hazard.physicsBody?.contactTestBitMask = Category.player
            hazard.physicsBody?.collisionBitMask = 0
            addChild(hazard)
        }
    }

    private func addGoal() {
        let pole = SKSpriteNode(color: .white, size: CGSize(width: 10, height: 180))
        pole.position = CGPoint(x: 3_760, y: 130)
        pole.zPosition = 3
        addChild(pole)

        let flag = SKShapeNode(rectOf: CGSize(width: 86, height: 52), cornerRadius: 6)
        flag.fillColor = SKColor(red: 0.98, green: 0.33, blue: 0.22, alpha: 1.0)
        flag.strokeColor = .white
        flag.lineWidth = 3
        flag.position = CGPoint(x: 3_808, y: 190)
        flag.zPosition = 4
        flag.physicsBody = SKPhysicsBody(rectangleOf: CGSize(width: 86, height: 130), center: CGPoint(x: -42, y: -42))
        flag.physicsBody?.isDynamic = false
        flag.physicsBody?.categoryBitMask = Category.goal
        flag.physicsBody?.contactTestBitMask = Category.player
        flag.physicsBody?.collisionBitMask = 0
        addChild(flag)
    }

    private func addPlayer() {
        player.removeAllChildren()
        player.color = .systemRed
        player.position = CGPoint(x: 120, y: 112)
        player.zPosition = 8
        player.physicsBody = SKPhysicsBody(rectangleOf: player.size)
        player.physicsBody?.allowsRotation = false
        player.physicsBody?.restitution = 0
        player.physicsBody?.friction = 0.2
        player.physicsBody?.linearDamping = 0
        player.physicsBody?.categoryBitMask = Category.player
        player.physicsBody?.contactTestBitMask = Category.coin | Category.hazard | Category.goal | Category.ground
        player.physicsBody?.collisionBitMask = Category.ground
        addChild(player)

        let face = SKLabelNode(text: ":)")
        face.fontName = "AvenirNext-Heavy"
        face.fontSize = 18
        face.fontColor = .white
        face.verticalAlignmentMode = .center
        face.position = CGPoint(x: 0, y: 3)
        face.zPosition = 2
        player.addChild(face)
    }

    private func addBlock(at position: CGPoint, size blockSize: CGSize, color: SKColor, category: UInt32) {
        let block = SKSpriteNode(color: color, size: blockSize)
        block.position = position
        block.zPosition = 2
        block.physicsBody = SKPhysicsBody(rectangleOf: blockSize)
        block.physicsBody?.isDynamic = false
        block.physicsBody?.categoryBitMask = category
        block.physicsBody?.contactTestBitMask = Category.player
        block.physicsBody?.collisionBitMask = Category.player
        addChild(block)
    }

    private func applyInput(deltaTime: TimeInterval) {
        guard let body = player.physicsBody else { return }

        let targetSpeed: CGFloat
        if movingLeft == movingRight {
            targetSpeed = 0
        } else {
            targetSpeed = movingRight ? 245 : -245
        }

        let smoothing = CGFloat(min(deltaTime * 12, 1))
        body.velocity.dx += (targetSpeed - body.velocity.dx) * smoothing

        if jumpHeld && canJump {
            body.velocity.dy = 560
            canJump = false
        }

        player.xScale = body.velocity.dx < -10 ? -1 : 1
    }

    private func centerCamera() {
        let x = min(max(player.position.x, size.width / 2), 3_740)
        cameraNode.position = CGPoint(x: x, y: size.height / 2)
    }

    private func collect(_ coin: SKNode) {
        score += 1
        updateScoreLabel()
        coin.removeFromParent()
    }

    private func updateScoreLabel() {
        scoreLabel.text = "Coins \(score)/9"
    }

    private func showMessage(_ text: String) {
        messageLabel.text = text
        messageLabel.removeAllActions()
        messageLabel.alpha = 1
        messageLabel.run(.sequence([
            .wait(forDuration: 1.0),
            .fadeOut(withDuration: 0.35),
            .run { [weak self] in self?.messageLabel.text = "" },
            .fadeIn(withDuration: 0)
        ]))
    }

    private func restartPlayer() {
        player.position = CGPoint(x: 120, y: 112)
        player.physicsBody?.velocity = .zero
        movingLeft = false
        movingRight = false
        jumpHeld = false
        canJump = false
    }
}

private extension SKLabelNode {
    func addShadow() {
        let shadow = SKLabelNode(fontNamed: fontName)
        shadow.text = text
        shadow.fontSize = fontSize
        shadow.fontColor = .black.withAlphaComponent(0.45)
        shadow.horizontalAlignmentMode = horizontalAlignmentMode
        shadow.verticalAlignmentMode = verticalAlignmentMode
        shadow.position = CGPoint(x: 2, y: -2)
        shadow.zPosition = -1
        addChild(shadow)
    }
}