import * as THREE from 'three';
import { screenUV, mix, color, pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { config } from './config.js';

const N = config.GRID_N;
const CELL = config.CELL;
const H = (N * CELL) / 2;          // half-extent of the cube
const SNAKE_CAP = 512;
const PARTICLE_CAP = 640;

/**
 * Renderer3D — WebGPU (three.js r185)
 * Renders the cubic arena, the free-flying snake, and the food, with a chase
 * camera that follows the snake and supports manual drag-to-orbit. Emissive
 * neon materials + bloom, smoothly interpolated motion, particles, camera shake.
 */
export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = 0;
    this.shakeAmt = 0;
    this.segRender = [];
    this.foodPos = new THREE.Vector3();
    this.foodTarget = new THREE.Vector3();
    this._m = new THREE.Object3D();
    this._c = new THREE.Color();
    this.particles = [];

    // Camera orientation frame (smoothed toward the snake's) + manual orbit.
    this.camForward = new THREE.Vector3(1, 0, 0);
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.manualYaw = 0;
    this.manualPitch = 0;
    this.dragging = false;
  }

  cellToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(
      (x - (N - 1) / 2) * CELL,
      (y - (N - 1) / 2) * CELL,
      (z - (N - 1) / 2) * CELL
    );
  }

  initInstanceColor(mesh, cap) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  hideInstance(mesh, i) {
    this._m.position.set(0, -99999, 0);
    this._m.rotation.set(0, 0, 0);
    this._m.scale.setScalar(0);
    this._m.updateMatrix();
    mesh.setMatrixAt(i, this._m.matrix);
  }

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
    this.buildSnake();
    this.buildFood();
    this.buildParticles();
    this.buildPostFX();
    this.setupCameraControls();

    this.resize();
    return this;
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x20203a, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(H * 2, H * 2.5, H * 2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4466ff, 0.5);
    rim.position.set(-H * 2, -H, -H * 2);
    this.scene.add(rim);
    this.foodLight = new THREE.PointLight(config.COLORS.FOOD, 8, 28, 2);
    this.scene.add(this.foodLight);
  }

  buildArena() {
    // Glowing edge frame.
    const box = new THREE.BoxGeometry(N * CELL, N * CELL, N * CELL);
    this.scene.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: config.COLORS.FRAME })
    ));

    // Faint grid on all six walls (depth cues for free flight).
    const pts = [];
    const a = -H, b = H;
    const at = (i) => -H + i * CELL;
    for (let i = 0; i <= N; i++) {
      const p = at(i);
      // x = ±H faces (vary y or z)
      for (const xf of [a, b]) {
        pts.push(xf, p, a, xf, p, b);
        pts.push(xf, a, p, xf, b, p);
      }
      // y = ±H faces
      for (const yf of [a, b]) {
        pts.push(p, yf, a, p, yf, b);
        pts.push(a, yf, p, b, yf, p);
      }
      // z = ±H faces
      for (const zf of [a, b]) {
        pts.push(p, a, zf, p, b, zf);
        pts.push(a, p, zf, b, p, zf);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(
      geo, new THREE.LineBasicMaterial({ color: config.COLORS.GRID, transparent: true, opacity: 0.28 })
    ));
  }

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
    // lookAt aligns the group's -Z toward travel, so eyes sit on -Z (front).
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeWhite);
      e.position.set(sx * CELL * 0.24, CELL * 0.16, -CELL * 0.42);
      const p = new THREE.Mesh(pupilGeo, pupil);
      p.position.set(0, 0, -CELL * 0.12);
      e.add(p);
      this.head.add(e);
    }
    this.scene.add(this.head);
  }

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

  buildPostFX() {
    const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
    this.postProcessing = new Pipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    this.postProcessing.outputNode = scenePass.add(bloom(scenePass, 0.7, 0.5, 0.2));
  }

  /* ---------- manual camera rotation ---------- */

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

    // Two-finger drag rotates (single-finger swipe is reserved for turning).
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) start((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) move((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
    }, { passive: true });
    el.addEventListener('touchend', () => { if (this.dragging) end(); });
  }

  /* ---------- state sync ---------- */

  reset(snake, grid) {
    this.segRender = snake.body.map((s) => this.cellToWorld(s.x, s.y, s.z));
    this.cellToWorld(grid.food.x, grid.food.y, grid.food.z, this.foodTarget);
    this.foodPos.copy(this.foodTarget);
    for (const p of this.particles) p.life = 0;

    this.camForward.set(snake.forward.x, snake.forward.y, snake.forward.z);
    this.camUp.set(snake.up.x, snake.up.y, snake.up.z);
    this.manualYaw = this.manualPitch = 0;
    // Snap the camera behind the head so the first frame is framed correctly.
    const head = this.segRender[0];
    const rel = this.camForward.clone().multiplyScalar(-config.CAMERA.DISTANCE)
      .add(this.camUp.clone().multiplyScalar(config.CAMERA.HEIGHT));
    this.camera.position.copy(head).add(rel);
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(head);
  }

  onSnakeMoved(snake) {
    const prevHead = this.segRender[0] ? this.segRender[0].clone() : this.cellToWorld(snake.body[0].x, snake.body[0].y, snake.body[0].z);
    this.segRender.unshift(prevHead);
    while (this.segRender.length > snake.body.length) this.segRender.pop();
  }

  onFoodMoved(food) {
    this.cellToWorld(food.x, food.y, food.z, this.foodTarget);
  }

  shake(amount) { this.shakeAmt = Math.min(1.4, this.shakeAmt + amount); }

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

  /* ---------- draw ---------- */

  async render(snake, grid, dt, state) {
    const dts = Math.min(dt, 100) / 1000;
    this.time += dts;
    this.updateSnake(snake, dts, state);
    this.updateFood(dts);
    this.updateParticles(dts);
    this.updateCamera(snake, dts);
    const p = this.postProcessing.render();
    if (p && typeof p.then === 'function') await p;
  }

  updateSnake(snake, dts, state) {
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

  updateCamera(snake, dts) {
    const cam = config.CAMERA;
    const head = this.segRender[0] || new THREE.Vector3();

    // Ease the camera frame toward the snake's orientation.
    const a = 1 - Math.exp(-dts * cam.TURN_SMOOTH);
    this.camForward.lerp(new THREE.Vector3(snake.forward.x, snake.forward.y, snake.forward.z), a);
    if (this.camForward.lengthSq() > 1e-6) this.camForward.normalize();
    this.camUp.lerp(new THREE.Vector3(snake.up.x, snake.up.y, snake.up.z), a);
    if (this.camUp.lengthSq() > 1e-6) this.camUp.normalize();

    const right = new THREE.Vector3().crossVectors(this.camForward, this.camUp).normalize();

    // Base chase offset, then apply manual orbit (yaw about up, pitch about right).
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

    // Ease the manual orbit back toward "behind the snake" when not dragging.
    if (!this.dragging) {
      const decay = Math.exp(-dts * 1.1);
      this.manualYaw *= decay;
      this.manualPitch *= decay;
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
