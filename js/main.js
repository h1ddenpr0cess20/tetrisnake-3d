/**
 * Application entry point.
 * Boots the 3D WebGPU game once the DOM is ready and reports fatal errors
 * (e.g. no WebGPU/WebGL2 support) to the user instead of failing silently.
 */
import { Game } from './Game.js';

async function boot() {
  const loading = document.getElementById('loading');
  try {
    const game = new Game('gameCanvas');
    window.__game = game;
    await game.init();
    if (loading) loading.classList.add('hidden');
  } catch (err) {
    console.error('Failed to start Tetrisnake:', err);
    if (loading) {
      loading.innerHTML =
        '<h1>Unable to start</h1>' +
        '<p>This game needs a browser with WebGPU or WebGL2 and hardware acceleration enabled.</p>' +
        `<p style="opacity:.6;font-size:.8rem">${(err && err.message) || err}</p>`;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
