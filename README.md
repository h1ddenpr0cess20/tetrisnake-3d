# Tetrisnake 3D

Tetrisnake is a blend of Tetris and Snake, rebuilt as a fully 3D game rendered
with **three.js r185** and **WebGPU** (with automatic WebGL2 fallback). Guide a
falling snake down a three‑dimensional well, eat food to grow, and fill a whole
floor layer to clear it — Tetris style, in 3D.

It began as a sarcastic response to Elon Musk's AI game‑mashup ideas: originally
a Pygame app, then a 2D web game, and now a polished 3D WebGPU experience.

## How it plays

The play field is a vertical **well** — a `5 × 5 × 14` cube. The snake always
falls straight down (`−Y`) on its own. You **steer it horizontally** through the
`X`/`Z` plane to reach food and to choose where it lands.

- **Eat food** to grow the snake and score points.
- When the snake **lands** on the floor or on top of the stack — or crashes into
  a block or itself — it **locks into place** as colored blocks.
- Fill an entire horizontal **layer** (all `5 × 5` cells) to **clear it**;
  everything above drops down. Clearing multiple layers at once scores big.
- The game ends when a new snake has no room to spawn at the top.

Not steering? The snake falls in a straight column — so line it up before it
lands.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Steer left / right (X) | ← / → | on‑screen buttons or swipe |
| Steer forward / back (Z) | ↑ / ↓ | on‑screen buttons or swipe |
| Pause | **P** | ⏸ button |
| Quit to menu (while paused) | **Q** | — |

Holding a steer key accelerates the snake. Mobile devices get touch controls,
swipe gestures, and haptic feedback where available.

## Features

- True 3D gameplay in a WebGPU‑rendered well (three.js r185)
- Emissive neon materials with bloom post‑processing, dynamic lighting and shadows
- Smoothly interpolated snake motion, particle bursts, and camera shake
- Procedural sound effects and adaptive background music (Web Audio API)
- Increasing speed and difficulty as you level up
- Responsive, full‑viewport layout for desktop and mobile

## Running

It's a static site — serve the folder over HTTP and open `index.html`:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

A modern browser with WebGPU (recent Chrome/Edge) gives the best experience;
browsers without WebGPU fall back to WebGL2 automatically. Append `?webgl=1` to
force the WebGL2 backend.

## Tech

- **three.js r185** (`WebGPURenderer`, TSL node materials, `RenderPipeline` bloom),
  loaded via an ES‑module import map from a CDN — no build step.
- Vanilla ES modules for game logic (`Snake`, `Grid`, `Game`, `InputHandler`,
  `UI`, `AudioManager`) and a dedicated `Renderer3D`.
