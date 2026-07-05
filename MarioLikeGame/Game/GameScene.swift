import SpriteKit

final class GameScene: SKScene, SKPhysicsContactDelegate {
    private enum Cat {
        static let player: UInt32 = 1 << 0
        static let solid: UInt32 = 1 << 1
        static let gem: UInt32 = 1 << 2
        static let hazard: UInt32 = 1 << 3
        static let flag: UInt32 = 1 << 4
        static let enemy: UInt32 = 1 << 5
        static let bullet: UInt32 = 1 << 6
        static let boss: UInt32 = 1 << 7
        static let berry: UInt32 = 1 << 8
        static let gate: UInt32 = 1 << 9
        static let projectile: UInt32 = 1 << 10
    }

    private struct World {
        let name: String
        let boss: String
        let sky: SKColor
        let dirt: SKColor
        let grass: SKColor
        let accent: SKColor
        let enemy: SKColor
        let speed: CGFloat
    }

    private let tile: CGFloat = 40
    private let worldWidth: CGFloat = 7_200
    private let groundTop: CGFloat = 82
    private let worlds = [
        World(name: "Outskirts", boss: "GRAVE BRUTE", sky: SKColor(red: 0.38, green: 0.78, blue: 1, alpha: 1), dirt: SKColor(red: 0.46, green: 0.27, blue: 0.14, alpha: 1), grass: SKColor(red: 0.22, green: 0.58, blue: 0.26, alpha: 1), accent: SKColor(red: 1, green: 0.80, blue: 0.20, alpha: 1), enemy: SKColor(red: 0.36, green: 0.50, blue: 0.34, alpha: 1), speed: 1.0),
        World(name: "Graveyard", boss: "BOG ABOMINATION", sky: SKColor(red: 0.30, green: 0.24, blue: 0.43, alpha: 1), dirt: SKColor(red: 0.23, green: 0.20, blue: 0.24, alpha: 1), grass: SKColor(red: 0.25, green: 0.42, blue: 0.27, alpha: 1), accent: SKColor(red: 0.94, green: 0.72, blue: 0.46, alpha: 1), enemy: SKColor(red: 0.30, green: 0.46, blue: 0.38, alpha: 1), speed: 1.18),
        World(name: "Compound", boss: "ZOMBIE OVERLORD", sky: SKColor(red: 0.07, green: 0.09, blue: 0.16, alpha: 1), dirt: SKColor(red: 0.15, green: 0.16, blue: 0.20, alpha: 1), grass: SKColor(red: 0.24, green: 0.39, blue: 0.31, alpha: 1), accent: SKColor(red: 0.77, green: 0.86, blue: 1, alpha: 1), enemy: SKColor(red: 0.35, green: 0.38, blue: 0.50, alpha: 1), speed: 1.35)
    ]

    private let cameraNode = SKCameraNode()
    private let scoreLabel = SKLabelNode(fontNamed: "AvenirNext-Heavy")
    private let gemLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let livesLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let worldLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let timeLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let bossLabel = SKLabelNode(fontNamed: "AvenirNext-Heavy")
    private let messageLabel = SKLabelNode(fontNamed: "AvenirNext-Heavy")

    private var player = SKSpriteNode(color: .clear, size: CGSize(width: 30, height: 42))
    private var enemies: [SKSpriteNode] = []
    private var bullets: [SKSpriteNode] = []
    private var projectiles: [SKSpriteNode] = []
    private var gates: [SKSpriteNode] = []
    private var bossNode: SKSpriteNode?
    private var world = 0
    private var score = 0
    private var gems = 0
    private var lives = 3
    private var timeLeft: TimeInterval = 420
    private var checkpointX: CGFloat = 120
    private var powered = false
    private var invincible: TimeInterval = 0
    private var fireCooldown: TimeInterval = 0
    private var bossCooldown: TimeInterval = 2
    private var lastUpdate: TimeInterval = 0
    private var phase = "play"
    private var grounded = false
    private var facing: CGFloat = 1
    private var left = false
    private var right = false
    private var jump = false
    private var fire = false
    private var tapFire = false

    override func didMove(to view: SKView) {
        view.isMultipleTouchEnabled = true
        physicsWorld.gravity = CGVector(dx: 0, dy: -28)
        physicsWorld.contactDelegate = self
        startCampaign()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        layoutHUD()
        centerCamera()
    }

    func setMovingLeft(_ isMoving: Bool) { left = isMoving }
    func setMovingRight(_ isMoving: Bool) { right = isMoving }
    func setJumping(_ isJumping: Bool) { jump = isJumping }
    func setShooting(_ isShooting: Bool) {
        if isShooting && !fire { tapFire = true }
        fire = isShooting
    }

    func togglePause() {
        if phase == "play" {
            phase = "pause"
            isPaused = true
        } else if phase == "pause" {
            isPaused = false
            phase = "play"
        } else {
            startCampaign()
        }
    }

    func restartLevel() {
        if phase == "done" || phase == "dead" { startCampaign() } else { loadWorld(world, keepStats: true) }
    }

    override func update(_ currentTime: TimeInterval) {
        let dt = lastUpdate == 0 ? 0 : min(currentTime - lastUpdate, 1 / 24)
        lastUpdate = currentTime
        guard phase == "play" else { centerCamera(); return }
        invincible = max(0, invincible - dt)
        fireCooldown = max(0, fireCooldown - dt)
        timeLeft -= dt
        if timeLeft <= 0 { loseLife("Time up") }
        movePlayer(dt)
        moveEnemies(dt, time: currentTime)
        moveBoss(dt)
        moveShots(dt)
        keepInWorld()
        updateHUD()
    }

    func didBegin(_ contact: SKPhysicsContact) {
        let a = contact.bodyA.categoryBitMask <= contact.bodyB.categoryBitMask ? contact.bodyA : contact.bodyB
        let b = a === contact.bodyA ? contact.bodyB : contact.bodyA
        if bulletHit(a, b) || bulletHit(b, a) { return }
        guard let playerBody = body(Cat.player, a, b) else { return }
        let other = playerBody === a ? b : a
        switch other.categoryBitMask {
        case Cat.solid, Cat.gate:
            if (player.physicsBody?.velocity.dy ?? 0) <= 100 { grounded = true }
        case Cat.gem:
            other.node?.removeFromParent(); gems += 1; score += 50
        case Cat.berry:
            other.node?.removeFromParent(); powered = true; score += 200; spawnPlayer(at: player.position); say("Ember power")
        case Cat.enemy:
            stompOrHurt(other.node, bounce: 520, points: 100)
        case Cat.boss:
            if (player.physicsBody?.velocity.dy ?? 0) < -90 && player.position.y > (other.node?.position.y ?? 0) + 34 {
                damageBoss(3); player.physicsBody?.velocity.dy = 620
            } else { hurtPlayer() }
        case Cat.hazard, Cat.projectile:
            hurtPlayer()
        case Cat.flag:
            finishWorld()
        default:
            break
        }
    }

    private func startCampaign() {
        world = 0; score = 0; gems = 0; lives = 3; powered = false
        loadWorld(0, keepStats: false)
    }

    private func loadWorld(_ index: Int, keepStats: Bool) {
        removeAllChildren(); removeAllActions(); isPaused = false; phase = "play"
        world = min(max(index, 0), worlds.count - 1)
        let theme = worlds[world]
        timeLeft = 420; checkpointX = 120; invincible = 1.2; fireCooldown = 0; bossCooldown = 2
        grounded = false; lastUpdate = 0; if !keepStats { powered = false }
        enemies.removeAll(); bullets.removeAll(); projectiles.removeAll(); gates.removeAll(); bossNode = nil
        left = false; right = false; jump = false; fire = false; tapFire = false
        backgroundColor = theme.sky
        drawBackdrop(theme); setupCamera(); drawLevel(theme); drawPickups(); drawEnemies(theme); drawBoss(theme); drawFlag(); spawnPlayer(at: CGPoint(x: 120, y: 130))
        updateHUD(); say("World \(world + 1)-1  \(theme.name)", duration: 1.2)
    }

    private func setupCamera() {
        camera = cameraNode; addChild(cameraNode); cameraNode.zPosition = 2_000
        [scoreLabel, gemLabel, livesLabel, worldLabel, timeLabel, bossLabel, messageLabel].forEach {
            $0.removeFromParent(); $0.zPosition = 2_001; $0.verticalAlignmentMode = .center; cameraNode.addChild($0)
        }
        scoreLabel.horizontalAlignmentMode = .left; gemLabel.horizontalAlignmentMode = .left; livesLabel.horizontalAlignmentMode = .left
        worldLabel.horizontalAlignmentMode = .right; timeLabel.horizontalAlignmentMode = .right; bossLabel.horizontalAlignmentMode = .center; messageLabel.horizontalAlignmentMode = .center
        [scoreLabel, gemLabel, livesLabel, worldLabel, timeLabel, bossLabel].forEach { $0.fontSize = 18; $0.fontColor = .white }
        scoreLabel.fontSize = 20; messageLabel.fontSize = 31; messageLabel.fontColor = .white; gemLabel.fontColor = worlds[world].accent
        bossLabel.fontColor = SKColor(red: 1, green: 0.35, blue: 0.25, alpha: 1)
        layoutHUD()
    }

    private func layoutHUD() {
        let top = size.height / 2 - 34, l = -size.width / 2 + 22, r = size.width / 2 - 22
        scoreLabel.position = CGPoint(x: l, y: top); gemLabel.position = CGPoint(x: l, y: top - 28); livesLabel.position = CGPoint(x: l, y: top - 56)
        worldLabel.position = CGPoint(x: r, y: top); timeLabel.position = CGPoint(x: r, y: top - 28); bossLabel.position = CGPoint(x: 0, y: top - 56)
        messageLabel.position = CGPoint(x: 0, y: size.height / 2 - 112)
    }

    private func drawBackdrop(_ theme: World) {
        sprite(theme.sky, CGSize(width: worldWidth + 900, height: 520), CGPoint(x: worldWidth / 2, y: 260), -100)
        let orb = SKShapeNode(circleOfRadius: world == 2 ? 28 : 42); orb.fillColor = theme.accent; orb.strokeColor = .white.withAlphaComponent(0.35); orb.lineWidth = 4; orb.position = CGPoint(x: 470 + CGFloat(world) * 140, y: 410); orb.zPosition = -80; addChild(orb)
        for i in 0..<18 {
            let hill = SKShapeNode(ellipseOf: CGSize(width: 500, height: 165)); hill.fillColor = theme.grass.withAlphaComponent(0.35); hill.strokeColor = .clear
            hill.position = CGPoint(x: CGFloat(i) * 430 + CGFloat((i * 57) % 130), y: 105); hill.zPosition = -70; addChild(hill)
        }
    }

    private func drawLevel(_ theme: World) {
        let pits = [24...25, 46...48, 64...65, 92...95, 112...113, 128...130]
        var start: Int?
        for c in 0..<180 {
            let pit = pits.contains { $0.contains(c) }
            if pit, let s = start { solid(s...(c - 1), y: groundTop / 2, h: groundTop, theme: theme); start = nil }
            if !pit && start == nil { start = c }
        }
        if let s = start { solid(s...179, y: groundTop / 2, h: groundTop, theme: theme) }
        [(8,12,138),(16,18,210),(28,32,168),(36,41,236),(53,58,156),(69,75,206),(83,86,280),(100,105,172),(117,123,232),(137,142,172),(149,153,238)].forEach { solid($0.0...$0.1, y: CGFloat($0.2), h: 24, theme: theme) }
        [14,43,56,58,60,115,117,139,141].forEach { block($0, y: groundTop + 142, color: SKColor(red: 0.93, green: 0.50, blue: 0.12, alpha: 1), label: "?") }
        [21,50,51,83,84,133,134].forEach { block($0, y: groundTop + CGFloat($0.isMultiple(of: 2) ? 35 : 23), color: SKColor(red: 0.45, green: 0.27, blue: 0.14, alpha: 1), label: nil, height: $0.isMultiple(of: 2) ? 70 : 46) }
        [88,89,106,126,127,145].forEach { spike($0) }
    }

    private func solid(_ range: ClosedRange<Int>, y: CGFloat, h: CGFloat, theme: World) {
        let width = CGFloat(range.count) * tile, x = CGFloat(range.lowerBound) * tile + width / 2
        let node = box(theme.dirt, CGSize(width: width, height: h), CGPoint(x: x, y: y), Cat.solid, Cat.player, Cat.player | Cat.bullet, -5)
        let top = SKSpriteNode(color: theme.grass, size: CGSize(width: width, height: 8)); top.position = CGPoint(x: 0, y: h / 2 - 4); node.addChild(top)
    }

    private func block(_ column: Int, y: CGFloat, color: SKColor, label: String?, height: CGFloat = 36) {
        let node = box(color, CGSize(width: 36, height: height), CGPoint(x: CGFloat(column) * tile + tile / 2, y: y), Cat.solid, Cat.player, Cat.player | Cat.bullet, 8)
        if let label {
            let mark = SKLabelNode(fontNamed: "AvenirNext-Heavy"); mark.text = label; mark.fontSize = 23; mark.fontColor = .white; mark.verticalAlignmentMode = .center; node.addChild(mark)
        }
    }

    private func spike(_ column: Int) {
        let path = CGMutablePath(); path.move(to: CGPoint(x: -18, y: -16)); path.addLine(to: CGPoint(x: 0, y: 18)); path.addLine(to: CGPoint(x: 18, y: -16)); path.closeSubpath()
        let node = SKShapeNode(path: path); node.fillColor = SKColor(red: 0.14, green: 0.13, blue: 0.16, alpha: 1); node.strokeColor = .red; node.lineWidth = 3
        node.position = CGPoint(x: CGFloat(column) * tile + tile / 2, y: groundTop + 18); node.zPosition = 10
        node.physicsBody = SKPhysicsBody(rectangleOf: CGSize(width: 34, height: 28)); node.physicsBody?.isDynamic = false; node.physicsBody?.categoryBitMask = Cat.hazard; node.physicsBody?.contactTestBitMask = Cat.player; addChild(node)
    }

    private func drawPickups() {
        [(10,194),(12,194),(17,264),(30,220),(32,220),(38,292),(55,212),(57,212),(71,260),(73,260),(85,332),(102,226),(119,286),(121,286),(140,226),(151,292),(166,150),(171,150)].forEach {
            pickup(Cat.gem, x: CGFloat($0.0) * tile + tile / 2, y: CGFloat($0.1), color: worlds[world].accent)
        }
        [58,116,142].forEach { pickup(Cat.berry, x: CGFloat($0) * tile + tile / 2, y: groundTop + 52, color: .red) }
    }

    private func pickup(_ cat: UInt32, x: CGFloat, y: CGFloat, color: SKColor) {
        let node = SKShapeNode(circleOfRadius: 16); node.fillColor = color; node.strokeColor = .white.withAlphaComponent(0.65); node.lineWidth = 3; node.position = CGPoint(x: x, y: y); node.zPosition = 24
        node.physicsBody = SKPhysicsBody(circleOfRadius: 16); node.physicsBody?.isDynamic = false; node.physicsBody?.categoryBitMask = cat; node.physicsBody?.contactTestBitMask = Cat.player; addChild(node)
    }

    private func drawEnemies(_ theme: World) {
        let base = [18,33,44,61,77,90,108,124,137,146] + (world >= 1 ? [25,68,101,156] : []) + (world == 2 ? [39,82,132,161] : [])
        for (i, col) in base.enumerated() { enemy("zombie", col, y: groundTop + 22, size: CGSize(width: 34, height: 44), color: theme.enemy, vx: CGFloat(i.isMultiple(of: 2) ? -66 : 70) * theme.speed, range: 130) }
        for (i, col) in [35,74,98,118,152].enumerated() where !(world == 0 && i > 2) { enemy("bat", col, y: groundTop + 170 + CGFloat(col % 4) * 22, size: CGSize(width: 46, height: 28), color: SKColor(red: 0.24, green: 0.16, blue: 0.32, alpha: 1), vx: CGFloat(i.isMultiple(of: 2) ? -82 : 78) * theme.speed, range: 180) }
    }

    private func enemy(_ kind: String, _ column: Int, y: CGFloat, size: CGSize, color: SKColor, vx: CGFloat, range: CGFloat) {
        let node = box(color, size, CGPoint(x: CGFloat(column) * tile + tile / 2, y: y), Cat.enemy, 0, Cat.player | Cat.bullet, 35)
        node.name = kind; node.userData = ["kind": kind, "left": node.position.x - range, "right": node.position.x + range, "vx": vx, "baseY": y, "phase": CGFloat(column)]
        face(node)
        enemies.append(node)
    }

    private func drawBoss(_ theme: World) {
        let boss = box(theme.enemy.withAlphaComponent(0.95), CGSize(width: 92, height: 96), CGPoint(x: 158 * tile, y: groundTop + 48), Cat.boss, 0, Cat.player | Cat.bullet, 40)
        boss.name = "boss"; boss.userData = ["hp": 12 + world * 6, "max": 12 + world * 6, "left": 153 * tile, "right": 169 * tile, "vx": -70 * theme.speed]
        face(boss); bossNode = boss
        for r in 0..<4 {
            let gate = box(SKColor(red: 0.21, green: 0.27, blue: 0.32, alpha: 1), CGSize(width: 38, height: 38), CGPoint(x: 173 * tile, y: groundTop + 19 + CGFloat(r) * 38), Cat.gate, Cat.player, Cat.player | Cat.bullet, 20)
            gates.append(gate)
        }
    }

    private func drawFlag() {
        sprite(.white, CGSize(width: 8, height: 196), CGPoint(x: 181 * tile, y: groundTop + 98), 10)
        let flag = box(SKColor(red: 0.96, green: 0.23, blue: 0.15, alpha: 1), CGSize(width: 92, height: 56), CGPoint(x: 181 * tile + 46, y: groundTop + 162), Cat.flag, 0, Cat.player, 12)
        flag.physicsBody = SKPhysicsBody(rectangleOf: CGSize(width: 110, height: 210), center: CGPoint(x: -50, y: -78)); flag.physicsBody?.isDynamic = false; flag.physicsBody?.categoryBitMask = Cat.flag; flag.physicsBody?.contactTestBitMask = Cat.player
    }

    private func spawnPlayer(at point: CGPoint) {
        player.removeFromParent()
        player = SKSpriteNode(color: .clear, size: powered ? CGSize(width: 34, height: 56) : CGSize(width: 30, height: 42))
        player.position = point; player.zPosition = 60; player.name = "ember"
        player.physicsBody = SKPhysicsBody(rectangleOf: player.size); player.physicsBody?.allowsRotation = false; player.physicsBody?.mass = 0.12; player.physicsBody?.friction = 0.08
        player.physicsBody?.categoryBitMask = Cat.player; player.physicsBody?.contactTestBitMask = Cat.solid | Cat.gem | Cat.berry | Cat.hazard | Cat.enemy | Cat.boss | Cat.projectile | Cat.flag | Cat.gate; player.physicsBody?.collisionBitMask = Cat.solid | Cat.gate
        drawSoldier(); addChild(player)
    }

    private func drawSoldier() {
        player.removeAllChildren()
        let suit = powered ? SKColor(red: 0.94, green: 0.24, blue: 0.14, alpha: 1) : SKColor(red: 0.72, green: 0.28, blue: 0.16, alpha: 1)
        sprite(suit, CGSize(width: player.size.width * 0.82, height: player.size.height * 0.52), CGPoint(x: 0, y: -player.size.height * 0.08), 1, parent: player)
        let head = SKShapeNode(circleOfRadius: player.size.width * 0.33); head.fillColor = SKColor(red: 0.98, green: 0.58, blue: 0.31, alpha: 1); head.strokeColor = .black.withAlphaComponent(0.6); head.lineWidth = 2; head.position = CGPoint(x: 0, y: player.size.height * 0.32); player.addChild(head)
        sprite(SKColor(red: 0.18, green: 0.26, blue: 0.22, alpha: 1), CGSize(width: player.size.width * 0.86, height: player.size.height * 0.18), CGPoint(x: 0, y: player.size.height * 0.44), 2, parent: player)
        sprite(worlds[world].accent, CGSize(width: 10, height: 5), CGPoint(x: 6, y: player.size.height * 0.35), 3, parent: player)
        sprite(SKColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1), CGSize(width: 28, height: 7), CGPoint(x: player.size.width * 0.58, y: player.size.height * 0.03), 3, parent: player)
    }

    private func movePlayer(_ dt: TimeInterval) {
        guard let body = player.physicsBody else { return }
        let desired: CGFloat = left == right ? 0 : (left ? -270 : 270)
        if desired != 0 { facing = desired < 0 ? -1 : 1 }
        player.xScale = facing
        body.velocity.dx = body.velocity.dx + min(max(desired - body.velocity.dx, -3_200 * CGFloat(dt)), 3_200 * CGFloat(dt))
        if abs(body.velocity.dy) > 110 { grounded = false }
        if jump && grounded { body.velocity.dy = powered ? 780 : 730; grounded = false }
        if !jump && body.velocity.dy > 340 { body.velocity.dy *= 0.9 }
        if (fire || tapFire) && fireCooldown <= 0 { shoot(); tapFire = false }
    }

    private func shoot() {
        fireCooldown = powered ? 0.13 : 0.26
        let b = box(worlds[world].accent, CGSize(width: 18, height: 6), CGPoint(x: player.position.x + facing * 30, y: player.position.y + player.size.height * 0.1), Cat.bullet, 0, Cat.enemy | Cat.boss | Cat.solid | Cat.gate, 50)
        b.userData = ["vx": 860 * facing, "age": CGFloat(0)]; b.physicsBody?.affectedByGravity = false; bullets.append(b)
    }

    private func moveEnemies(_ dt: TimeInterval, time: TimeInterval) {
        for e in enemies where e.parent != nil { movePatrol(e, dt: dt); if (e.userData?["kind"] as? String) == "bat" { e.position.y = num(e.userData?["baseY"]) + sin(CGFloat(time) * 3 + num(e.userData?["phase"])) * 24 } }
        enemies.removeAll { $0.parent == nil }
    }

    private func moveBoss(_ dt: TimeInterval) {
        guard let boss = bossNode, boss.parent != nil else { bossLabel.text = ""; return }
        movePatrol(boss, dt: dt); bossCooldown -= dt
        if bossCooldown <= 0 { bossCooldown = world == 0 ? 2.1 : 1.45; bossShot(from: boss) }
    }

    private func movePatrol(_ node: SKSpriteNode, dt: TimeInterval) {
        guard let data = node.userData else { return }
        var vx = num(data["vx"]); let l = num(data["left"]), r = num(data["right"])
        node.position.x += vx * CGFloat(dt)
        if node.position.x < l || node.position.x > r { vx *= -1; node.position.x = min(max(node.position.x, l), r); data["vx"] = vx }
        node.xScale = vx < 0 ? -1 : 1
    }

    private func bossShot(from boss: SKSpriteNode) {
        let dir: CGFloat = player.position.x < boss.position.x ? -1 : 1
        let p = box(SKColor(red: 0.56, green: 0.91, blue: 0.27, alpha: 1), CGSize(width: 18, height: 18), CGPoint(x: boss.position.x + dir * 48, y: boss.position.y + 20), Cat.projectile, 0, Cat.player | Cat.solid, 45)
        p.userData = ["vx": dir * (260 + CGFloat(world) * 55), "vy": CGFloat(165), "age": CGFloat(0)]; p.physicsBody?.affectedByGravity = false; projectiles.append(p)
    }

    private func moveShots(_ dt: TimeInterval) {
        for b in bullets where b.parent != nil { let age = num(b.userData?["age"]) + CGFloat(dt); b.userData?["age"] = age; b.position.x += num(b.userData?["vx"]) * CGFloat(dt); if age > 1.6 || abs(b.position.x - player.position.x) > size.width * 1.2 { b.removeFromParent() } }
        bullets.removeAll { $0.parent == nil }
        for p in projectiles where p.parent != nil { let age = num(p.userData?["age"]) + CGFloat(dt); let vy = num(p.userData?["vy"]) - 420 * CGFloat(dt); p.userData?["age"] = age; p.userData?["vy"] = vy; p.position.x += num(p.userData?["vx"]) * CGFloat(dt); p.position.y += vy * CGFloat(dt); if age > 4 || p.position.y < 20 { p.removeFromParent() } }
        projectiles.removeAll { $0.parent == nil }
    }

    private func keepInWorld() {
        player.position.x = min(max(player.position.x, 26), worldWidth - 34)
        if player.position.x > 70 * tile { checkpointX = max(checkpointX, 70 * tile) }
        if player.position.x > 150 * tile { checkpointX = max(checkpointX, 150 * tile) }
        if player.position.y < -110 { loseLife("Try again") }
        centerCamera()
    }

    private func bulletHit(_ bulletBody: SKPhysicsBody, _ other: SKPhysicsBody) -> Bool {
        guard bulletBody.categoryBitMask == Cat.bullet, let bullet = bulletBody.node else { return false }
        switch other.categoryBitMask {
        case Cat.enemy: bullet.removeFromParent(); other.node?.removeFromParent(); score += 100; return true
        case Cat.boss: bullet.removeFromParent(); damageBoss(1); return true
        case Cat.solid, Cat.gate: bullet.removeFromParent(); return true
        default: return false
        }
    }

    private func stompOrHurt(_ node: SKNode?, bounce: CGFloat, points: Int) {
        guard let node, node.parent != nil else { return }
        if (player.physicsBody?.velocity.dy ?? 0) < -70 && player.position.y > node.position.y + 18 {
            node.removeFromParent(); score += points; player.physicsBody?.velocity.dy = bounce
        } else { hurtPlayer() }
    }

    private func damageBoss(_ amount: Int) {
        guard let boss = bossNode, let data = boss.userData else { return }
        let hp = int(data["hp"]) - amount; data["hp"] = hp
        if hp <= 0 { score += 1_000; boss.removeFromParent(); bossNode = nil; gates.forEach { $0.removeFromParent() }; gates.removeAll(); say("Gate open") }
    }

    private func hurtPlayer() {
        guard invincible <= 0, phase == "play" else { return }
        if powered { powered = false; invincible = 1.6; spawnPlayer(at: player.position); say("Armor cracked"); return }
        loseLife("Ouch")
    }

    private func loseLife(_ text: String) {
        guard phase == "play" else { return }
        lives -= 1
        if lives <= 0 { phase = "dead"; player.physicsBody?.velocity = .zero; say("Game over", duration: 10) }
        else { powered = false; invincible = 1.6; spawnPlayer(at: CGPoint(x: checkpointX, y: groundTop + 64)); say(text) }
    }

    private func finishWorld() {
        guard phase == "play" else { return }
        score += Int(max(0, timeLeft.rounded())) * 2
        if world < worlds.count - 1 { phase = "pause"; say("World clear"); run(.sequence([.wait(forDuration: 1.1), .run { [weak self] in self?.loadWorld((self?.world ?? 0) + 1, keepStats: true) }])) }
        else { phase = "done"; say("You saved Ember", duration: 10) }
    }

    private func centerCamera() {
        guard camera != nil else { return }
        let hw = max(size.width / 2, 1), hh = max(size.height / 2, 1)
        cameraNode.position = CGPoint(x: min(max(player.position.x, hw), max(hw, worldWidth - hw)), y: min(max(player.position.y + 44, hh), max(hh, 560 - hh)))
    }

    private func updateHUD() {
        scoreLabel.text = "SCORE \(score)"; gemLabel.text = "GEMS \(gems)"; livesLabel.text = "LIVES \(lives)"
        worldLabel.text = "WORLD \(world + 1)-1"; timeLabel.text = "TIME \(max(0, Int(timeLeft.rounded())))"
        if let boss = bossNode, let data = boss.userData, boss.parent != nil { bossLabel.text = "\(worlds[world].boss) \(max(0, int(data[\"hp\"])))/\(int(data[\"max\"]))" } else { bossLabel.text = "" }
    }

    private func say(_ text: String, duration: TimeInterval = 1.2) {
        messageLabel.removeAllActions(); messageLabel.text = text; messageLabel.alpha = 1; messageLabel.setScale(1)
        messageLabel.run(.sequence([.scale(to: 1.06, duration: 0.12), .wait(forDuration: duration), .fadeOut(withDuration: 0.25), .run { [weak self] in self?.messageLabel.text = "" }]))
    }

    private func box(_ color: SKColor, _ size: CGSize, _ point: CGPoint, _ cat: UInt32, _ collide: UInt32, _ contact: UInt32, _ z: CGFloat) -> SKSpriteNode {
        let node = sprite(color, size, point, z)
        node.physicsBody = SKPhysicsBody(rectangleOf: size); node.physicsBody?.isDynamic = false; node.physicsBody?.categoryBitMask = cat; node.physicsBody?.collisionBitMask = collide; node.physicsBody?.contactTestBitMask = contact
        return node
    }

    @discardableResult private func sprite(_ color: SKColor, _ size: CGSize, _ point: CGPoint, _ z: CGFloat, parent: SKNode? = nil) -> SKSpriteNode {
        let node = SKSpriteNode(color: color, size: size); node.position = point; node.zPosition = z; (parent ?? self).addChild(node); return node
    }

    private func face(_ node: SKSpriteNode) {
        for x in [-7, 7] { let eye = SKShapeNode(circleOfRadius: node.size.width > 60 ? 5 : 3); eye.fillColor = .red; eye.strokeColor = .clear; eye.position = CGPoint(x: CGFloat(x), y: node.size.height * 0.22); node.addChild(eye) }
    }

    private func body(_ cat: UInt32, _ a: SKPhysicsBody, _ b: SKPhysicsBody) -> SKPhysicsBody? {
        a.categoryBitMask == cat ? a : (b.categoryBitMask == cat ? b : nil)
    }

    private func num(_ value: Any?) -> CGFloat {
        if let v = value as? CGFloat { return v }
        if let v = value as? Double { return CGFloat(v) }
        if let v = value as? Int { return CGFloat(v) }
        if let v = value as? NSNumber { return CGFloat(truncating: v) }
        return 0
    }

    private func int(_ value: Any?) -> Int {
        if let v = value as? Int { return v }
        if let v = value as? NSNumber { return v.intValue }
        if let v = value as? CGFloat { return Int(v) }
        return 0
    }
}
