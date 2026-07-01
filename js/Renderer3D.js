import * as THREE from 'three';
import { screenUV, mix, color, pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { config } from './config.js';

const { GRID_W, GRID_D, GRID_H, CELL } = config;
const BLOCK_CAP = GRID_W * GRID_D * GRID_H;
const SNAKE_CAP = 256;
const PARTICLE_CAP = 640;

/**
 * Renderer3D
 * WebGPU (three.js r185) renderer for 3D Tetrisnake. Owns the scene, camera,
 * lighting, post-processing (bloom), and all animated meshes: the well frame,
 * the snake (smoothly interpolated), locked blocks, food, and a particle pool.
 */
export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = 0;
    this.shakeAmt = 0;
    this.segRender = [];    // interpolated world positions for snake segments
    this.foodPos = new THREE.Vector3();
    this.foodTarget = new THREE.Vector3();
    this._m = new THREE.Object3D(); // scratch for instance matrices
    this._c = new THREE.Color();
    this.particles = [];
    this.blockKeyToIndex = new Map();
  }

  cellToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(
      (x - (GRID_W - 1) / 2) * CELL,
      (y + 0.5) * CELL,
      (z - (GRID_D - 1) / 2) * CELL
    );
  }

  async init() {
    this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    await this.renderer.init();

    this.scene = new THREE.Scene();
    this.scene.backgroundNode = mix(
      color(config.COLORS.BG_BOTTOM),
      color(config.COLORS.BG_TOP),
      screenUV.y.mul(0.9).add(0.1)
    );

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    this.camTarget = new THREE.Vector3(0, GRID_H * CELL * 0.42, 0);

    this.buildLights();
    this.buildWell();
    this.buildBlocks();
    this.buildSnake();
    this.buildFood();
    this.buildParticles();
    this.buildPostFX();

    this.resize();
    return this;
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x8899ff, 0x0a0a18, 0.55));

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(GRID_W * CELL, GRID_H * CELL * 1.1, GRID_D * CELL * 1.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const s = Math.max(GRID_W, GRID_D) * CELL * 1.6;
    const cam = key.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = GRID_H * CELL; cam.bottom = -2;
    cam.near = 1; cam.far = GRID_H * CELL * 4;
    key.shadow.bias = -0.002;
    key.shadow.radius = 4;
    this.scene.add(key);
    this.scene.add(key.target);
    key.target.position.set(0, GRID_H * CELL * 0.4, 0);

    const rim = new THREE.DirectionalLight(0x4466ff, 0.5);
    rim.position.set(-GRID_W * CELL, GRID_H * CELL * 0.3, -GRID_D * CELL);
    this.scene.add(rim);

    this.foodLight = new THREE.PointLight(config.COLORS.FOOD, 6, 10, 2);
    this.scene.add(this.foodLight);
  }

  buildWell() {
    const w = GRID_W * CELL, d = GRID_D * CELL, h = GRID_H * CELL;

    // Floor
    const floorMat = new THREE.MeshStandardNodeMaterial({
      color: 0x0c0c1c, roughness: 0.85, metalness: 0.2
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Floor grid lines
    const gridPts = [];
    for (let i = 0; i <= GRID_W; i++) {
      const x = (i - GRID_W / 2) * CELL;
      gridPts.push(x, 0.01, -d / 2, x, 0.01, d / 2);
    }
    for (let j = 0; j <= GRID_D; j++) {
      const z = (j - GRID_D / 2) * CELL;
      gridPts.push(-w / 2, 0.01, z, w / 2, 0.01, z);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
    this.scene.add(new THREE.LineSegments(
      gridGeo, new THREE.LineBasicMaterial({ color: config.COLORS.GRID, transparent: true, opacity: 0.6 })
    ));

    // Glowing well frame (edges of the volume)
    const box = new THREE.BoxGeometry(w, h, d);
    box.translate(0, h / 2, 0);
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: config.COLORS.FRAME })
    );
    this.scene.add(frame);

    // Faint glass walls (back two sides only, so the front stays open)
    const wallMat = new THREE.MeshBasicNodeMaterial({
      color: config.COLORS.FRAME, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false
    });
    const backZ = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    backZ.position.set(0, h / 2, -d / 2);
    this.scene.add(backZ);
    const backX = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
    backX.rotation.y = Math.PI / 2;
    backX.position.set(-w / 2, h / 2, 0);
    this.scene.add(backX);

    // Floor cursor: shows the snake head's column for depth perception.
    const cursorMat = new THREE.MeshBasicNodeMaterial({
      color: config.COLORS.SNAKE, transparent: true, opacity: 0.35, depthWrite: false
    });
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9), cursorMat);
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.position.y = 0.02;
    this.scene.add(this.cursor);
  }

  buildBlocks() {
    const geo = new RoundedBoxGeometry(CELL * 0.92, CELL * 0.92, CELL * 0.92, 2, CELL * 0.12);
    const mat = new THREE.MeshStandardNodeMaterial({
      color: 0xffffff, roughness: 0.4, metalness: 0.35,
      emissive: new THREE.Color(config.COLORS.BLOCK).multiplyScalar(0.12)
    });
    this.blocks = new THREE.InstancedMesh(geo, mat, BLOCK_CAP);
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blocks.castShadow = true;
    this.blocks.receiveShadow = true;
    this.blocks.count = 0;
    this.scene.add(this.blocks);
  }

  buildSnake() {
    const geo = new RoundedBoxGeometry(CELL * 0.86, CELL * 0.86, CELL * 0.86, 3, CELL * 0.22);
    const mat = new THREE.MeshStandardNodeMaterial({
      color: 0xffffff, roughness: 0.3, metalness: 0.1,
      emissive: new THREE.Color(config.COLORS.SNAKE).multiplyScalar(0.35)
    });
    this.snakeBody = new THREE.InstancedMesh(geo, mat, SNAKE_CAP);
    this.snakeBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.snakeBody.castShadow = true;
    this.snakeBody.count = 0;
    this.scene.add(this.snakeBody);

    // Head
    this.head = new THREE.Group();
    const headMat = new THREE.MeshStandardNodeMaterial({
      color: config.COLORS.HEAD, roughness: 0.25, metalness: 0.1,
      emissive: new THREE.Color(config.COLORS.HEAD).multiplyScalar(0.5)
    });
    const headMesh = new THREE.Mesh(
      new RoundedBoxGeometry(CELL * 0.98, CELL * 0.98, CELL * 0.98, 4, CELL * 0.3), headMat
    );
    headMesh.castShadow = true;
    this.head.add(headMesh);

    const eyeWhite = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, emissive: 0x222222, roughness: 0.2 });
    const pupil = new THREE.MeshStandardNodeMaterial({ color: 0x0a0a0a, roughness: 0.4 });
    const eyeGeo = new THREE.SphereGeometry(CELL * 0.14, 12, 12);
    const pupilGeo = new THREE.SphereGeometry(CELL * 0.07, 10, 10);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeWhite);
      e.position.set(sx * CELL * 0.22, CELL * 0.12, CELL * 0.42);
      const p = new THREE.Mesh(pupilGeo, pupil);
      p.position.set(0, 0, CELL * 0.11);
      e.add(p);
      this.head.add(e);
    }
    this.scene.add(this.head);
  }

  buildFood() {
    const mat = new THREE.MeshStandardNodeMaterial({
      color: config.COLORS.FOOD, roughness: 0.15, metalness: 0.2,
      emissive: new THREE.Color(config.COLORS.FOOD).multiplyScalar(0.9)
    });
    this.food = new THREE.Mesh(new THREE.IcosahedronGeometry(CELL * 0.42, 0), mat);
    this.food.castShadow = true;
    this.scene.add(this.food);

    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(CELL * 0.6, 0),
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
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    for (let i = 0; i < PARTICLE_CAP; i++) {
      this.particles.push({ life: 0, maxLife: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), col: new THREE.Color(), size: 1 });
    }
  }

  buildPostFX() {
    this.postProcessing = new THREE.PostProcessing(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    const bloomPass = bloom(scenePass, 0.85, 0.5, 0.12);
    this.postProcessing.outputNode = scenePass.add(bloomPass);
  }

  /* ---------- state sync from the Game ---------- */

  reset(snake, grid) {
    this.segRender = snake.body.map((s) => this.cellToWorld(s.x, s.y, s.z));
    this.syncBlocks(grid);
    this.cellToWorld(grid.food.x, grid.food.y, grid.food.z, this.foodTarget);
    this.foodPos.copy(this.foodTarget);
    for (const p of this.particles) p.life = 0;
  }

  onSnakeRespawned(snake) {
    this.segRender = snake.body.map((s) => this.cellToWorld(s.x, s.y, s.z));
  }

  onSnakeMoved(snake) {
    // New head slides in from where the previous head was rendered.
    const prevHead = this.segRender[0] ? this.segRender[0].clone() : this.cellToWorld(snake.body[0].x, snake.body[0].y, snake.body[0].z);
    this.segRender.unshift(prevHead);
    while (this.segRender.length > snake.body.length) this.segRender.pop();
  }

  onFoodMoved(food) {
    this.cellToWorld(food.x, food.y, food.z, this.foodTarget);
  }

  addBlocks() { /* blocks are rebuilt via syncBlocks; kept for API symmetry */ }

  syncBlocks(grid) {
    let i = 0;
    this.blockKeyToIndex.clear();
    for (const [posKey, col] of grid.staticBlocks) {
      if (i >= BLOCK_CAP) break;
      const [x, y, z] = posKey.split(',').map(Number);
      this.cellToWorld(x, y, z, this._m.position);
      this._m.rotation.set(0, 0, 0);
      this._m.scale.setScalar(1);
      this._m.updateMatrix();
      this.blocks.setMatrixAt(i, this._m.matrix);
      this.blocks.setColorAt(i, this._c.set(col));
      this.blockKeyToIndex.set(posKey, i);
      i++;
    }
    this.blocks.count = i;
    this.blocks.instanceMatrix.needsUpdate = true;
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
  }

  onLayersCleared(layers) {
    for (const y of layers) {
      for (let x = 0; x < GRID_W; x++) {
        for (let z = 0; z < GRID_D; z++) {
          if ((x + z) % 2 === 0) this.burst({ x, y, z }, config.COLORS.FRAME, 2);
        }
      }
    }
  }

  /* ---------- effects ---------- */

  shake(amount) {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount);
  }

  burst(cell, colHex, count) {
    const origin = this.cellToWorld(cell.x, cell.y, cell.z);
    for (let n = 0; n < count; n++) {
      const p = this.particles.find((pp) => pp.life <= 0);
      if (!p) break;
      p.life = p.maxLife = 0.5 + Math.random() * 0.5;
      p.pos.copy(origin);
      p.vel.set(
        (Math.random() - 0.5) * 6,
        Math.random() * 6 + 1,
        (Math.random() - 0.5) * 6
      );
      p.col.set(colHex);
      p.size = 0.6 + Math.random() * 0.9;
    }
  }

  /* ---------- main draw ---------- */

  async render(snake, grid, dt, state) {
    const dts = Math.min(dt, 100) / 1000;
    this.time += dts;

    this.updateSnake(snake, dts, state);
    this.updateFood(dts);
    this.updateParticles(dts);
    this.updateCamera(dts, state);

    await this.postProcessing.renderAsync();
  }

  updateSnake(snake, dts, state) {
    const body = snake.body;
    const k = state && state.running ? 16 : 8; // smoothing rate
    const a = 1 - Math.exp(-dts * k);

    // Ensure render list matches body length (safety).
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

    // Body instances (skip head at index 0).
    let count = 0;
    for (let i = 1; i < this.segRender.length && count < SNAKE_CAP; i++) {
      const t = i / Math.max(1, this.segRender.length - 1);
      const scale = CELL * (0.98 - 0.28 * t); // taper toward the tail
      this._m.position.copy(this.segRender[i]);
      this._m.rotation.set(0, 0, 0);
      this._m.scale.setScalar(scale / (CELL * 0.86));
      this._m.updateMatrix();
      this.snakeBody.setMatrixAt(count, this._m.matrix);
      this._c.set(config.COLORS.SNAKE).lerp(this._c.clone().set(0x0a3d16), t * 0.6);
      this.snakeBody.setColorAt(count, this._c);
      count++;
    }
    this.snakeBody.count = count;
    this.snakeBody.instanceMatrix.needsUpdate = true;
    if (this.snakeBody.instanceColor) this.snakeBody.instanceColor.needsUpdate = true;

    // Head
    if (this.segRender.length > 0) {
      this.head.position.copy(this.segRender[0]);
      const dir = snake.direction;
      const look = this.head.position.clone().add(new THREE.Vector3(dir.x, dir.y, dir.z));
      // Falling straight down: use +Z as "up" to avoid a degenerate lookAt.
      const vertical = dir.x === 0 && dir.z === 0;
      this.head.up.set(0, vertical ? 0 : 1, vertical ? 1 : 0);
      this.head.lookAt(look);

      // Floor cursor under the head
      this.cursor.position.x = this.head.position.x;
      this.cursor.position.z = this.head.position.z;
      this.cursor.material.opacity = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(this.time * 5));
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
    this.foodLight.intensity = 5 + 2 * Math.sin(this.time * 4);
  }

  updateParticles(dts) {
    let count = 0;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dts;
      if (p.life <= 0) continue;
      p.vel.y -= 9 * dts;
      p.vel.multiplyScalar(1 - 1.2 * dts);
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
    this.particleMesh.count = count;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  updateCamera(dts) {
    const h = GRID_H * CELL;
    const sway = Math.sin(this.time * 0.25) * 0.12;
    const radius = h * 1.02;
    const baseX = Math.sin(sway) * radius * 0.5 + h * 0.14;
    const baseZ = Math.cos(sway) * radius;
    this.camera.position.set(baseX, h * 0.62, baseZ);

    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.max(0, 1 - dts * 6);
    }
    this.camera.lookAt(this.camTarget);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
