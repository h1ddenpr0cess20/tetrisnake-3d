# Tetrisnake 3D

A fully 3D mashup of Snake and Tetris, rendered with **three.js r185** and
**WebGPU** (with automatic WebGL2 fallback). A snake drops into a tall 3D well;
you steer it in all six directions to eat food, and choose where it lands.

It began as a sarcastic response to Elon Musk's AI game-mashup ideas: originally
a Pygame app, then a 2D web game, and now a polished 3D WebGPU experience.

## How it plays

The arena is a tall rectangular **well** (`12 × 12` footprint, `28` high). A
snake drops in from the top and advances one cell per step in the direction it
faces. You **turn it in 3D** — turns are relative to the snake's own
orientation, like a flight game, so "up" always curves toward the top of the
screen. A chase camera rides behind the snake, and you can drag to orbit the
view.

- **Eat food** to grow longer and score points. The snake speeds up as it grows.
- **The level rises** as locked blocks accumulate, speeding the snake up further.
- **Crashing** into a wall, a locked block, or the snake's own body **locks the
  snake into blocks** and drops a fresh one — it is not an instant loss.
- **Fill a complete line** of cells along any axis to clear it, Tetris-style,
  and score a bonus.
- **Game over** only when a new snake has no room to spawn at the top.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Pitch up / down | ↑ / ↓ or **W** / **S** | on-screen buttons or swipe up/down |
| Yaw left / right | ← / → or **A** / **D** | on-screen buttons or swipe left/right |
| Accelerate | hold **Shift** | — |
| Rotate the view (manual orbit) | click-drag | two-finger drag |
| Pause | **P** | ⏸ button |
| Quit to menu (while paused) | **Q** | — |

The manual-orbit view eases back behind the snake when you let go. Mobile devices
get touch controls, swipe gestures, and haptic feedback where available.

## Features

- True 6-direction 3D movement in a WebGPU-rendered well (three.js r185)
- Lock-on-crash and axis-aligned line clears — Snake rules meet Tetris rules
- Chase camera with smooth banking turns and manual drag-to-orbit
- Grid-lined walls for depth perception; glowing neon frame and materials
- Bloom post-processing, dynamic lighting, particle bursts, and camera shake
- Smoothly interpolated snake motion with a tapered, glowing-eyed head
- Procedural sound effects and a fully synthesized, multi-section soundtrack
  (Web Audio API)
- Responsive, full-viewport layout for desktop and mobile

## Running

It's a static site with no build step — serve the folder over HTTP and open
`index.html` (the ES-module imports need HTTP, not `file://`):

```bash
npm start          # serves the folder via `npx serve`
```

Any static file server works; `npm start` is just a convenience. A modern
browser with WebGPU (recent Chrome/Edge) gives the best experience; browsers
without WebGPU fall back to WebGL2 automatically. Append `?webgl=1` to the URL to
force the WebGL2 backend.

## Tests

The game logic has a unit-test suite that runs on Node's built-in test runner —
no dependencies, no build:

```bash
npm test
```

It covers the pure game modules (`Snake`, `Grid`, `config`) and the
browser-facing ones (`InputHandler`, `UI`, `AudioManager`) via a small DOM /
Web Audio stub in `test/helpers/`. `Renderer3D` and `Game` pull three.js from a
CDN and are exercised by manual play-testing rather than unit tests.

## Architecture

| Module | Responsibility |
| --- | --- |
| `js/main.js` | Entry point; boots the game and reports fatal errors |
| `js/Game.js` | Game state and the fixed-timestep simulation loop |
| `js/Snake.js` | The snake's orientation frame, turns, and movement |
| `js/Grid.js` | Food, locked blocks, and line clearing |
| `js/InputHandler.js` | Keyboard, on-screen buttons, and touch/swipe input |
| `js/UI.js` | Overlays, HUD, and audio-toggle buttons (plain DOM) |
| `js/AudioManager.js` | Procedural SFX and the synthesized soundtrack |
| `js/Renderer3D.js` | WebGPU scene, chase camera, and effects |
| `js/config.js` | Static tuning: arena size, colors, speeds, scoring |

three.js r185 (`WebGPURenderer`, TSL node materials, bloom) is loaded via an
ES-module import map from a CDN, so there is nothing to install to play.
