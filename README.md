# Cube Match

A 3D match-3 puzzle on a twistable 4×4×4 cube. Swipe a row or column to twist it (like a Rubik's cube); line up 3+ of the same shape on one face to clear them. Neon Glass art style.

**Download the latest APK:** [Releases → latest](../../releases/latest)

## Stack
- Three.js (rendering), Vite (build)
- Capacitor 8 (Android wrapper)
- GitHub Actions builds and publishes the APK on every push to `main`

## Develop
```bash
npm install
npm run dev     # play in the browser
npm test        # game-logic tests
```

## Structure
- `src/logic.js` — pure game rules: cube model, twists, matches, cascades, levels
- `src/main.js` — renderer, swipe input, screens
- `src/audio.js` — synthesized sound effects
- `tests/` — Vitest tests for the logic

## Signing
`android/app/cubematch-test.keystore` is a **test-only** key for sideloaded builds. Create a private upload key before publishing to Google Play.
