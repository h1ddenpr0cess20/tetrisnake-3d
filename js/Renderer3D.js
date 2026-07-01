import * as THREE from 'three';
import { screenUV, mix, color, pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { config } from './config.js';

/**
 * @typedef {import('./Snake.js').Snake} Snake
 * @typedef {import('./Grid.js').Grid} Grid
 * @typedef {import('./Snake.js').Vec3} Vec3
 */

const GW = config.GRID_W, GD = config.GRID_D, GH = config.GRID_H;
const CELL = config.CELL;
const HX = (GW * CELL) / 2;
const HY = (GH * CELL) / 2;
const HZ = (GD * CELL) / 2;
const SNAKE_CAP = 512;
const BLOCK_CAP = Math.min(6000, GW * GD * GH);
const PARTICLE_CAP = 640;

/**
 * WebGPU renderer (three.js r185) for the cubic arena, the free-flying snake,
 * and the food. A chase camera follows the snake with optional drag-to-orbit,
 * and emissive neon materials feed a bloom post-processing pass. Motion is
 * smoothly interpolated, with particle bursts and camera shake for feedback.
 */
export class Renderer3D {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.time = 0;
    this.shakeAmt = 0;
    /** @type {THREE.Vector3[]} Interpolated world positions, head first. */
    this.segRender = [];
    this.foodPos = new THREE.Vector3();
    this.foodTarget = new THREE.Vector3();
    this._m = new THREE.Object3D();
    this._c = new THREE.Color();
    /** @type {Array<{life:number,maxLife:number,pos:THREE.Vector3,vel:THREE.Vector3,col:THREE.Color,size:number}>} */
    this.particles = [];

    this.camForward = new THREE.Vector3(1, 0, 0);
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.manualYaw = 0;
    this.manualPitch = 0;
    this.dragging = false;
    this.snakeVisible = true;
  }

  /**
   * @param {boolean} v Whether the snake meshes should be drawn.
   */
  setSnakeVisible(v) {
    this.snakeVisible = v;
    if (this.head) this.head.visible = v;
  }

  /**
   * Converts a grid cell to its centered world position.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {THREE.Vector3} [out] Target vector to write into.
   * @returns {THREE.Vector3}
   */
  cellToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(
      (x - (GW - 1) / 2) * CELL,
      (y - (GH - 1) / 2) * CELL,
      (z - (GD - 1) / 2) * CELL
    );
  }

  /**
   * Attaches a dynamic per-instance color buffer to an instanced mesh.
   * @param {THREE.InstancedMesh} mesh
   * @param {number} cap Instance count.
   */
  initInstanceColor(mesh, cap) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  /**
   * Collapses an instance to zero scale and parks it off-screen so it renders
   * nothing.
   * @param {THREE.InstancedMesh} mesh
   * @param {number} i Instance index.
   */
  hideInstance(mesh, i) {
    this._m.position.set(0, -99999, 0);
    this._m.rotation.set(0, 0, 0);
    this._m.scale.setScalar(0);
    this._m.updateMatrix();
    mesh.setMatrixAt(i, this._m.matrix);
  }

  /**
   * Creates the WebGPU renderer (falling back to WebGL2), builds the scene, and
   * sizes the viewport. Appending `?webgl=1` forces the WebGL2 backend.
   * @returns {Promise<this>}
   */
  async init() {
    const forceWebGL = /[?&]webgl=1/.test(location.search);
    const make = (webgl) => {
      const r = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, alpha: false, forceWebGL: webgl });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      return r;
    };
    try {
      this.renderer = make(forceWebGL);
      await this.renderer.init();
    } catch (err) {
      if (forceWebGL) throw err;
      console.warn('WebGPU unavailable, falling back to WebGL2:', err);
      this.renderer = make(true);
      await this.renderer.init();
    }

    this.scene = new THREE.Scene();
    this.scene.backgroundNode = mix(
      color(config.COLORS.BG_BOTTOM), color(config.COLORS.BG_TOP), screenUV.y.mul(0.9).add(0.1)
    );

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 500);

    this.buildLights();
    this.buildArena();
    this.buildBlocks();
    this.buildSnake();
    this.buildFood();
    this.buildParticles();
    this.buildPostFX();
    this.setupCameraControls();

    this.resize();
    return this;
  }

  /** Adds hemisphere, key, rim, and food-tracking point lights. */
  buildLights() {
    const S = Math.max(HX, HY, HZ);
    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x20203a, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(S * 1.6, S * 2, S * 1.6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4466ff, 0.5);
    rim.position.set(-S * 1.6, -S, -S * 1.6);
    this.scene.add(rim);
    this.foodLight = new THREE.PointLight(config.COLORS.FOOD, 6, 12, 2);
    this.scene.add(this.foodLight);
  }

  /**
   * Builds the well: a glowing edge frame, faint grid lines on all six walls,
   * lightly tinted glass panels (top left open), and the look-ahead target quad.
   */
  buildArena() {
    const box = new THREE.BoxGeometry(GW * CELL, GH * CELL, GD * CELL);
    this.scene.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: config.COLORS.FRAME })
    ));

    const pts = [];
    const px = (i) => -HX + i * CELL;
    const py = (i) => -HY + i * CELL;
    const pz = (i) => -HZ + i * CELL;

    for (const xf of [-HX, HX]) {
      for (let i = 0; i <= GH; i++) pts.push(xf, py(i), -HZ, xf, py(i), HZ);
      for (let j = 0; j <= GD; j++) pts.push(xf, -HY, pz(j), xf, HY, pz(j));
    }
    for (const zf of [-HZ, HZ]) {
      for (let i = 0; i <= GH; i++) pts.push(-HX, py(i), zf, HX, py(i), zf);
      for (let j = 0; j <= GW; j++) pts.push(px(j), -HY, zf, px(j), HY, zf);
    }
    for (const yf of [-HY, HY]) {
      for (let i = 0; i <= GW; i++) pts.push(px(i), yf, -HZ, px(i), yf, HZ);
      for (let j = 0; j <= GD; j++) pts.push(-HX, yf, pz(j), HX, yf, pz(j));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(
      geo, new THREE.LineBasicMaterial({ color: config.COLORS.GRID, transparent: true, opacity: 0.22 })
    ));

    const glass = () => new THREE.MeshBasicNodeMaterial({
      color: 0x88b6ff, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false
    });
    const wall = (w, h, pos, rotY = 0, rotX = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass());
      m.position.copy(pos);
      m.rotation.set(rotX, rotY, 0);
      this.scene.add(m);
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    wall(GD * CELL, GH * CELL, V(HX, 0, 0), -Math.PI / 2);
    wall(GD * CELL, GH * CELL, V(-HX, 0, 0), Math.PI / 2);
    wall(GW * CELL, GH * CELL, V(0, 0, HZ), Math.PI);
    wall(GW * CELL, GH * CELL, V(0, 0, -HZ));
    wall(GW * CELL, GD * CELL, V(0, -HY, 0), 0, -Math.PI / 2);

    this.targetCell = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL, CELL),
      new THREE.MeshBasicNodeMaterial({
        color: config.COLORS.HEAD, transparent: true, opacity: 0.14,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
      })
    );
    this.targetCell.visible = false;
    this.scene.add(this.targetCell);
  }

  /** Builds the instanced mesh for locked blocks, initially all hidden. */
  buildBlocks() {
    const geo = new RoundedBoxGeometry(CELL * 0.92, CELL * 0.92, CELL * 0.92, 2, CELL * 0.12);
    const mat = new THREE.MeshStandardNodeMaterial({
      color: 0xffffff, roughness: 0.45, metalness: 0.25,
      emissive: new THREE.Color(config.COLORS.BLOCK).multiplyScalar(0.45)
    });
    this.blocks = new THREE.InstancedMesh(geo, mat, BLOCK_CAP);
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.initInstanceColor(this.blocks, BLOCK_CAP);
    this.blocks.frustumCulled = false;
    this.blocks.count = BLOCK_CAP;
    for (let i = 0; i < BLOCK_CAP; i++) this.hideInstance(this.blocks, i);
    this.scene.add(this.blocks);
  }

  /** Builds the instanced snake body and the eyed head group. */
  buildSnake() {
    const geo = new RoundedBoxGeometry(CELL * 0.84, CELL * 0.84, CELL * 0.84, 3, CELL * 0.22);
    const mat = new THREE.MeshStandardNodeMaterial({
      color: 0xffffff, roughness: 0.3, metalness: 0.1,
      emissive: new THREE.Color(config.COLORS.SNAKE).multiplyScalar(0.35)
    });
    this.snakeBody = new THREE.InstancedMesh(geo, mat, SNAKE_CAP);
    this.snakeBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.initInstanceColor(this.snakeBody, SNAKE_CAP);
    this.snakeBody.frustumCulled = false;
    this.snakeBody.count = SNAKE_CAP;
    for (let i = 0; i < SNAKE_CAP; i++) this.hideInstance(this.snakeBody, i);
    this.scene.add(this.snakeBody);

    this.head = new THREE.Group();
    const headMat = new THREE.MeshStandardNodeMaterial({
      color: config.COLORS.HEAD, roughness: 0.25, metalness: 0.1,
      emissive: new THREE.Color(config.COLORS.HEAD).multiplyScalar(0.28)
    });
    const headMesh = new THREE.Mesh(new RoundedBoxGeometry(CELL * 0.98, CELL * 0.98, CELL * 0.98, 4, CELL * 0.3), headMat);
    this.head.add(headMesh);

    const eyeWhite = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, emissive: 0x333333, roughness: 0.2 });
    const pupil = new THREE.MeshStandardNodeMaterial({ color: 0x0a0a0a, roughness: 0.4 });
    const eyeGeo = new THREE.SphereGeometry(CELL * 0.15, 12, 12);
    const pupilGeo = new THREE.SphereGeometry(CELL * 0.08, 10, 10);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeWhite);
      e.position.set(sx * CELL * 0.24, CELL * 0.16, CELL * 0.42);
      const p = new THREE.Mesh(pupilGeo, pupil);
      p.position.set(0, 0, CELL * 0.12);
      e.add(p);
      this.head.add(e);
    }
    this.scene.add(this.head);
  }

  /** Builds the food icosahedron and its wireframe halo. */
  buildFood() {
    const mat = new THREE.MeshStandardNodeMaterial({
      color: config.COLORS.FOOD, roughness: 0.15, metalness: 0.2,
      emissive: new THREE.Color(config.COLORS.FOOD).multiplyScalar(0.7)
    });
    this.food = new THREE.Mesh(new THREE.IcosahedronGeometry(CELL * 0.42, 0), mat);
    this.scene.add(this.food);
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(CELL * 0.62, 0),
      new THREE.MeshBasicNodeMaterial({ color: config.COLORS.FOOD, wireframe: true, transparent: true, opacity: 0.4 })
    );
    this.food.add(halo);
    this.foodHalo = halo;
  }

  /** Builds the instanced particle mesh and its free-list particle pool. */
  buildParticles() {
    const geo = new THREE.BoxGeometry(CELL * 0.14, CELL * 0.14, CELL * 0.14);
    const mat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, PARTICLE_CAP);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.initInstanceColor(this.particleMesh, PARTICLE_CAP);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = PARTICLE_CAP;
    for (let i = 0; i < PARTICLE_CAP; i++) this.hideInstance(this.particleMesh, i);
    this.scene.add(this.particleMesh);
    for (let i = 0; i < PARTICLE_CAP; i++) {
      this.particles.push({ life: 0, maxLife: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), col: new THREE.Color(), size: 1 });
    }
  }

  /** Sets up the scene pass and bloom post-processing pipeline. */
  buildPostFX() {
    const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
    this.postProcessing = new Pipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    this.postProcessing.outputNode = scenePass.add(bloom(scenePass, 0.7, 0.5, 0.2));
  }

  /**
   * Wires mouse drag and two-finger touch drag to the manual orbit offsets
   * (single-finger swipe is reserved for steering).
   */
  setupCameraControls() {
    const el = this.canvas;
    let lastX = 0, lastY = 0;
    const start = (x, y) => { this.dragging = true; lastX = x; lastY = y; };
    const move = (x, y) => {
      if (!this.dragging) return;
      this.manualYaw -= (x - lastX) * 0.006;
      this.manualPitch = Math.max(-1.25, Math.min(1.25, this.manualPitch - (y - lastY) * 0.006));
      lastX = x; lastY = y;
    };
    const end = () => { this.dragging = false; };

    el.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', end);

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) start((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) move((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
    }, { passive: true });
    el.addEventListener('touchend', () => { if (this.dragging) end(); });
  }

  /**
   * Resets all interpolated render state to match a fresh game and snaps the
   * camera behind the snake.
   * @param {Snake} snake
   * @param {Grid} grid
   */
  reset(snake, grid) {
    this.segRender = snake.body.map((s) => this.cellToWorld(s.x, s.y, s.z));
    this.cellToWorld(grid.food.x, grid.food.y, grid.food.z, this.foodTarget);
    this.foodPos.copy(this.foodTarget);
    for (const p of this.particles) p.life = 0;
    this.syncBlocks(grid);
    this.snapCameraBehind(snake);
  }

  /**
   * Reframes the camera directly behind a (re)spawned snake with no easing.
   * @param {Snake} snake
   */
  snapCameraBehind(snake) {
    this.camForward.set(snake.forward.x, snake.forward.y, snake.forward.z);
    this.camUp.set(snake.up.x, snake.up.y, snake.up.z);
    this.manualYaw = this.manualPitch = 0;
    const head = this.segRender[0] || new THREE.Vector3();
    const rel = this.camForward.clone().multiplyScalar(-config.CAMERA.DISTANCE)
      .add(this.camUp.clone().multiplyScalar(config.CAMERA.HEIGHT));
    this.camera.position.copy(head).add(rel);
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(head);
  }

  /**
   * Repositions the snake instantly on respawn and lets the camera position
   * glide in, while snapping the camera orientation frame to the new snake.
   *
   * The orientation is snapped rather than eased: the spawn frame always points
   * straight down, and easing from a previous upward heading would lerp through
   * the antipodal vector, collapse near zero at the midpoint, and normalize into
   * an arbitrary direction — the random "flip" seen at spawn.
   * @param {Snake} snake
   */
  onSnakeRespawned(snake) {
    this.segRender = snake.body.map((s) => this.cellToWorld(s.x, s.y, s.z));
    this.camForward.set(snake.forward.x, snake.forward.y, snake.forward.z);
    this.camUp.set(snake.up.x, snake.up.y, snake.up.z);
    this.manualYaw = this.manualPitch = 0;
  }

  /**
   * Rebuilds the locked-block instances from the grid.
   * @param {Grid} grid
   */
  syncBlocks(grid) {
    let i = 0;
    for (const [posKey, col] of grid.staticBlocks) {
      if (i >= BLOCK_CAP) break;
      const [x, y, z] = posKey.split(',').map(Number);
      this.cellToWorld(x, y, z, this._m.position);
      this._m.rotation.set(0, 0, 0);
      this._m.scale.setScalar(1);
      this._m.updateMatrix();
      this.blocks.setMatrixAt(i, this._m.matrix);
      this.blocks.setColorAt(i, this._c.set(col));
      i++;
    }
    for (let j = i; j < BLOCK_CAP; j++) this.hideInstance(this.blocks, j);
    this.blocks.instanceMatrix.needsUpdate = true;
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
  }

  /**
   * Emits a small particle burst at each cleared line cell.
   * @param {Vec3[]} cells
   */
  onLinesCleared(cells) {
    for (const c of cells) this.burst(c, config.COLORS.FRAME, 2);
  }

  /**
   * Extends the interpolated segment trail to match the snake after a step.
   * @param {Snake} snake
   */
  onSnakeMoved(snake) {
    const prevHead = this.segRender[0] ? this.segRender[0].clone() : this.cellToWorld(snake.body[0].x, snake.body[0].y, snake.body[0].z);
    this.segRender.unshift(prevHead);
    while (this.segRender.length > snake.body.length) this.segRender.pop();
  }

  /**
   * Retargets the food interpolation to a new cell.
   * @param {Vec3} food
   */
  onFoodMoved(food) {
    this.cellToWorld(food.x, food.y, food.z, this.foodTarget);
  }

  /**
   * Adds camera shake, capped so repeated hits don't blow up.
   * @param {number} amount
   */
  shake(amount) { this.shakeAmt = Math.min(1.4, this.shakeAmt + amount); }

  /**
   * Spawns a burst of particles from a grid cell, drawing from the free pool.
   * @param {Vec3} cell Origin cell.
   * @param {number} colHex Particle color.
   * @param {number} count Particles requested (limited by the pool).
   */
  burst(cell, colHex, count) {
    const origin = this.cellToWorld(cell.x, cell.y, cell.z);
    for (let n = 0; n < count; n++) {
      const p = this.particles.find((pp) => pp.life <= 0);
      if (!p) break;
      p.life = p.maxLife = 0.5 + Math.random() * 0.5;
      p.pos.copy(origin);
      p.vel.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
      p.col.set(colHex);
      p.size = 0.6 + Math.random() * 0.9;
    }
  }

  /**
   * Renders one frame: advances animation clocks, updates the snake, food,
   * particles, and camera, then runs the post-processing pipeline.
   * @param {Snake} snake
   * @param {Grid} grid
   * @param {number} dt Milliseconds since the last frame.
   * @param {{running: boolean, paused: boolean}} state
   * @returns {Promise<void>}
   */
  async render(snake, grid, dt, state) {
    const dts = Math.min(dt, 100) / 1000;
    this.time += dts;
    this.updateSnake(snake, dts, state, grid);
    this.updateFood(dts);
    this.updateParticles(dts);
    this.updateCamera(snake, dts);
    const p = this.postProcessing.render();
    if (p && typeof p.then === 'function') await p;
  }

  /**
   * Eases the interpolated body toward the snake's cells, draws the tapered
   * body and head (when visible), and positions the look-ahead target quad on
   * the first block or wall straight ahead of the heading.
   * @param {Snake} snake
   * @param {number} dts Delta time in seconds.
   * @param {{running: boolean, paused: boolean}} state
   * @param {Grid} grid
   */
  updateSnake(snake, dts, state, grid) {
    const body = snake.body;
    const k = state && state.running ? 18 : 10;
    const a = 1 - Math.exp(-dts * k);

    while (this.segRender.length < body.length) {
      const ref = body[this.segRender.length];
      this.segRender.push(this.cellToWorld(ref.x, ref.y, ref.z));
    }
    while (this.segRender.length > body.length) this.segRender.pop();

    const target = new THREE.Vector3();
    for (let i = 0; i < body.length; i++) {
      this.cellToWorld(body[i].x, body[i].y, body[i].z, target);
      this.segRender[i].lerp(target, a);
    }

    if (!this.snakeVisible) {
      for (let j = 0; j < SNAKE_CAP; j++) this.hideInstance(this.snakeBody, j);
      this.snakeBody.instanceMatrix.needsUpdate = true;
      this.head.visible = false;
      this.targetCell.visible = false;
      return;
    }
    this.head.visible = true;

    if (snake.peekForward) {
      const f = snake.peekForward();
      let cur = snake.getHead(), block = null;
      while (true) {
        const nxt = { x: cur.x + f.x, y: cur.y + f.y, z: cur.z + f.z };
        if (nxt.x < 0 || nxt.x >= GW || nxt.y < 0 || nxt.y >= GH || nxt.z < 0 || nxt.z >= GD) break;
        if (grid && grid.staticBlocks.has(`${nxt.x},${nxt.y},${nxt.z}`)) { block = nxt; break; }
        cur = nxt;
      }
      const eps = CELL * 0.03;
      const tc = this.targetCell;
      tc.rotation.set(0, 0, 0);
      if (f.x) tc.rotation.y = Math.PI / 2;
      else if (f.y) tc.rotation.x = Math.PI / 2;
      if (block) {
        tc.position.set((block.x - (GW - 1) / 2) * CELL, (block.y - (GH - 1) / 2) * CELL, (block.z - (GD - 1) / 2) * CELL);
        tc.position.x -= f.x * (CELL / 2 + eps);
        tc.position.y -= f.y * (CELL / 2 + eps);
        tc.position.z -= f.z * (CELL / 2 + eps);
      } else {
        const h = snake.getHead();
        tc.position.set((h.x - (GW - 1) / 2) * CELL, (h.y - (GH - 1) / 2) * CELL, (h.z - (GD - 1) / 2) * CELL);
        if (f.x) tc.position.x = f.x > 0 ? HX - eps : -HX + eps;
        else if (f.y) tc.position.y = f.y > 0 ? HY - eps : -HY + eps;
        else tc.position.z = f.z > 0 ? HZ - eps : -HZ + eps;
      }
      tc.material.opacity = 0.12 + 0.05 * Math.sin(this.time * 6);
      tc.visible = true;
    }

    let count = 0;
    const dark = new THREE.Color(0x0a3d16);
    for (let i = 1; i < this.segRender.length && count < SNAKE_CAP; i++) {
      const t = i / Math.max(1, this.segRender.length - 1);
      const scale = (0.96 - 0.3 * t);
      this._m.position.copy(this.segRender[i]);
      this._m.rotation.set(0, 0, 0);
      this._m.scale.setScalar(scale);
      this._m.updateMatrix();
      this.snakeBody.setMatrixAt(count, this._m.matrix);
      this._c.set(config.COLORS.SNAKE).lerp(dark, t * 0.6);
      this.snakeBody.setColorAt(count, this._c);
      count++;
    }
    for (let j = count; j < SNAKE_CAP; j++) this.hideInstance(this.snakeBody, j);
    this.snakeBody.instanceMatrix.needsUpdate = true;
    if (this.snakeBody.instanceColor) this.snakeBody.instanceColor.needsUpdate = true;

    if (this.segRender.length > 0) {
      this.head.position.copy(this.segRender[0]);
      const f = snake.forward, u = snake.up;
      this.head.up.set(u.x, u.y, u.z);
      this.head.lookAt(this.head.position.x + f.x, this.head.position.y + f.y, this.head.position.z + f.z);
    }
  }

  /**
   * Eases the food toward its target cell and animates its pulse, spin, halo,
   * and light.
   * @param {number} dts Delta time in seconds.
   */
  updateFood(dts) {
    this.foodPos.lerp(this.foodTarget, 1 - Math.exp(-dts * 10));
    const pulse = 1 + 0.12 * Math.sin(this.time * 4);
    this.food.position.copy(this.foodPos);
    this.food.scale.setScalar(pulse);
    this.food.rotation.y += dts * 1.2;
    this.food.rotation.x += dts * 0.7;
    this.foodHalo.rotation.y -= dts * 1.6;
    this.foodHalo.scale.setScalar(1 + 0.08 * Math.sin(this.time * 4 + 1));
    this.foodLight.position.copy(this.foodPos);
    this.foodLight.intensity = 4 + 2 * Math.sin(this.time * 4);
  }

  /**
   * Advances live particles (drag, motion, fade) and hides the rest.
   * @param {number} dts Delta time in seconds.
   */
  updateParticles(dts) {
    let count = 0;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dts;
      if (p.life <= 0) continue;
      p.vel.multiplyScalar(1 - 1.1 * dts);
      p.pos.addScaledVector(p.vel, dts);
      const l = p.life / p.maxLife;
      this._m.position.copy(p.pos);
      this._m.rotation.set(p.pos.x, p.pos.y, p.pos.z);
      this._m.scale.setScalar(Math.max(0.001, l * p.size));
      this._m.updateMatrix();
      this.particleMesh.setMatrixAt(count, this._m.matrix);
      this.particleMesh.setColorAt(count, this._c.copy(p.col).multiplyScalar(0.6 + l));
      count++;
    }
    for (let j = count; j < PARTICLE_CAP; j++) this.hideInstance(this.particleMesh, j);
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  /**
   * Eases the chase camera toward the snake's orientation, applies the manual
   * orbit offset, aims ahead of the head, and applies decaying shake.
   * @param {Snake} snake
   * @param {number} dts Delta time in seconds.
   */
  updateCamera(snake, dts) {
    const cam = config.CAMERA;
    const head = this.segRender[0] || new THREE.Vector3();

    const a = 1 - Math.exp(-dts * cam.TURN_SMOOTH);
    this.camForward.lerp(new THREE.Vector3(snake.forward.x, snake.forward.y, snake.forward.z), a);
    if (this.camForward.lengthSq() > 1e-6) this.camForward.normalize();
    this.camUp.lerp(new THREE.Vector3(snake.up.x, snake.up.y, snake.up.z), a);
    if (this.camUp.lengthSq() > 1e-6) this.camUp.normalize();

    const right = new THREE.Vector3().crossVectors(this.camForward, this.camUp).normalize();

    const rel = this.camForward.clone().multiplyScalar(-cam.DISTANCE)
      .add(this.camUp.clone().multiplyScalar(cam.HEIGHT));
    const q = new THREE.Quaternion()
      .setFromAxisAngle(this.camUp, this.manualYaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, this.manualPitch));
    rel.applyQuaternion(q);
    const upVec = this.camUp.clone().applyQuaternion(q);

    const desired = head.clone().add(rel);
    this.camera.position.lerp(desired, 1 - Math.exp(-dts * cam.SMOOTH));
    this.camera.up.copy(upVec);

    const look = head.clone().add(this.camForward.clone().multiplyScalar(cam.LOOK_AHEAD));
    this.camera.lookAt(look);

    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.max(0, 1 - dts * 6);
    }

    if (!this.dragging) {
      const decay = Math.exp(-dts * 1.1);
      this.manualYaw *= decay;
      this.manualPitch *= decay;
    }
  }

  /** Resizes the renderer and camera to the current canvas dimensions. */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
