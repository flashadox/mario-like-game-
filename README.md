# mario-like-game-

Native iOS SpriteKit port of Claude's Ember's Quest game.

The app is a run-and-gun Mario-like platformer starring Ember, a soldier
fighting zombies across 3 themed worlds. The original Claude Canvas game logic
from `js/game.js` has been integrated into the SpriteKit scene: touch controls,
jump physics, shooting, gems, power berries, zombies, bats, boss gates, flags,
HUD, and campaign progression now live in the iOS app.

## Build

```sh
xcodebuild -project MarioLikeGame.xcodeproj -scheme MarioLikeGame -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' build
```

The app target is `MarioLikeGame`.
