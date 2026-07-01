# Tetrisnake 3D

A fully 3D snake game set inside a cube, rendered with **three.js r185** and
**WebGPU** (with automatic WebGL2 fallback). Fly the snake through a `12³` cube
arena, eat food to grow, and don't crash into the walls or yourself — with a
chase camera that follows the snake and free drag‑to‑orbit.

It began as a sarcastic response to Elon Musk's AI game‑mashup ideas: originally
a Pygame app, then a 2D web game, and now a polished 3D WebGPU experience.

## How it plays

The arena is a true **cube** (`12 × 12 × 12`). The snake advances one cell per
step in the direction it faces, and you **turn it in 3D** — turns are relative
to the snake's own orientation, like a flight game, so "up" always curves toward
the top of the screen. The camera rides behind the snake.

- **Eat food** to grow longer and score points; every few foods raises the level
  and the snake speeds up.
- **Game over** if the head leaves the cube or runs into the snake's own body.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Pitch up / down | ↑ / ↓ or **W** / **S** | on‑screen buttons or swipe up/down |
| Yaw left / right | ← / → or **A** / **D** | on‑screen buttons or swipe left/right |
| Rotate the view (manual orbit) | click‑drag | two‑finger drag |
| Pause | **P** | ⏸ button |
| Quit to menu (while paused) | **Q** | — |

Holding a turn key accelerates the snake. The manual‑orbit view eases back
behind the snake when you let go. Mobile devices get touch controls, swipe
gestures, and haptic feedback where available.

## Features

- True 6‑direction 3D movement in a WebGPU‑rendered cube (three.js r185)
- Chase camera with smooth banking turns and manual drag‑to‑orbit
- Grid‑lined walls for depth perception; glowing neon frame and materials
- Bloom post‑processing, dynamic lighting, particle bursts, and camera shake
- Smoothly interpolated snake motion with a tapered, glowing‑eyed head
- Procedural sound effects and adaptive background music (Web Audio API)
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
