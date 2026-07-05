# mario-like-game-

This repo contains two separate, independent Mario-like games:

## 1. MarioLikeGame (iOS / SpriteKit)

Native iOS platform game project.

### Build

```sh
xcodebuild -project MarioLikeGame.xcodeproj -scheme MarioLikeGame -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' build
```

The app target is `MarioLikeGame`.

## 2. Ember's Quest (browser / HTML5 Canvas)

A run-n-gun platformer starring Ember, a soldier fighting a zombie horde across
3 themed worlds, each ending in a boss fight. Plain HTML/CSS/JS, no build step,
no dependencies.

### Run

Open `index.html` in a browser, or serve the repo root with any static file
server, e.g.:

```sh
python3 -m http.server 8000
```

then visit `http://localhost:8000/index.html`.

Source: `index.html`, `css/style.css`, `js/game.js`.