import { CONFIG, DIRECTIONS } from '../config.js';
import { perspective, orthographic, lookAt, multiply, lerp } from './math.js';
import { roundedBox, torus } from './geometry.js';
import { ParticleSystem } from './ParticleSystem.js';
import * as shaders from './shaders.js';

const INSTANCE_STRIDE = 11;
const MAX_INSTANCES = CONFIG.board.size ** 2 * 3 + 256;
const HALF = CONFIG.board.size / 2;
const world = (value) => value - HALF + 0.5;
const TAIL = CONFIG.render.teal;
const DEMO_PATH = [];
const WAYPOINTS = [[6, 5], [18, 5], [18, 10], [11, 10], [11, 15], [18, 15], [18, 19], [6, 19]];
for (let index = 0; index < WAYPOINTS.length; index++) {
  let [x, z] = WAYPOINTS[index];
  const [endX, endZ] = WAYPOINTS[(index + 1) % WAYPOINTS.length];
  while (x !== endX || z !== endZ) { DEMO_PATH.push({ x, z }); x += Math.sign(endX - x); z += Math.sign(endZ - z); }
}

export class RenderPipeline {
  constructor(canvas, events, settings) {
    this.canvas = canvas; this.events = events; this.settings = settings;
    this.abort = new AbortController(); this.resources = [];
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance', depth: true, preserveDrawingBuffer: false });
    if (!this.gl) throw new Error('WebGL 2 est indisponible. Activez l’accélération graphique de votre navigateur puis rechargez.');
    this.particles = new ParticleSystem();
    this.camera = settings.camera;
    this.eye = new Float32Array(CONFIG.camera.isometric); this.target = new Float32Array([0, 0, 0]);
    this.view = new Float32Array(16); this.projection = new Float32Array(16); this.viewProjection = new Float32Array(16);
    this.head = new Float32Array(3); this.foodPosition = new Float32Array(3);
    this.instances = new Float32Array(MAX_INSTANCES * INSTANCE_STRIDE);
    this.ringInstances = new Float32Array(32 * INSTANCE_STRIDE);
    this.ambientRingInstances = new Float32Array(2 * INSTANCE_STRIDE);
    this.shake = 0; this.impact = 0; this.time = 0; this.lost = false;
    try { this.initialize(); } catch (error) {
      this.disposeTargets();
      for (const [kind, resource] of this.resources) this.gl[`delete${kind}`](resource);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw error;
    }
    canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.lost = true; events.emit('graphicslost'); }, { signal: this.abort.signal });
    canvas.addEventListener('webglcontextrestored', () => {
      this.resources = []; this.targets = null; this.initialize(); this.lost = false; events.emit('graphicsrestored');
    }, { signal: this.abort.signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.unsubscribers = [
      events.on('food', (event) => { this.particles.burst(world(event.x), world(event.z), CONFIG.render.amber, 48); this.shake = 0.15; this.impact = 0.6; }),
      events.on('death', (event) => { this.particles.burst(world(event.head.x), world(event.head.z), event.won ? CONFIG.render.mint : CONFIG.render.danger, 140, 1.7); this.shake = 0.65; this.impact = 1; }),
      events.on('portal', (event) => { this.particles.burst(world(event.x), world(event.z), [0.6, 0.45, 1], 48); this.impact = 0.7; }),
      events.on('obstacle', (event) => this.particles.burst(world(event.x), world(event.z), CONFIG.render.danger, 18, 0.5)),
    ];
  }
  track(kind, resource) { this.resources.push([kind, resource]); return resource; }
  program(vertexSource, fragmentSource) {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`Compilation GLSL : ${error}`); }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = this.track('Program', gl.createProgram()); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Programme GLSL : ${gl.getProgramInfoLog(program)}`);
    const uniforms = {};
    for (let index = 0; index < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); index++) {
      const name = gl.getActiveUniform(program, index).name; uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }
  mesh(vertices, capacity) {
    const gl = this.gl;
    const vao = this.track('VertexArray', gl.createVertexArray()); gl.bindVertexArray(vao);
    const buffer = this.track('Buffer', gl.createBuffer()); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    for (let attribute = 0; attribute < 2; attribute++) { gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 24, attribute * 12); }
    const instanceBuffer = this.track('Buffer', gl.createBuffer()); gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer); gl.bufferData(gl.ARRAY_BUFFER, capacity * INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW);
    for (const [attribute, size, offset] of [[2, 3, 0], [3, 3, 3], [4, 3, 6], [5, 2, 9]]) {
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, INSTANCE_STRIDE * 4, offset * 4); gl.vertexAttribDivisor(attribute, 1);
    }
    gl.bindVertexArray(null); return { vao, instanceBuffer, count: vertices.length / 6 };
  }
  initialize() {
    const gl = this.gl;
    this.hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this.meshProgram = this.program(shaders.meshVertex, shaders.meshFragment);
    this.depthProgram = this.program(shaders.meshVertex, shaders.depthFragment);
    this.floorProgram = this.program(shaders.floorVertex, shaders.floorFragment);
    this.bloomProgram = this.program(shaders.screenVertex, shaders.bloomFragment);
    this.compositeProgram = this.program(shaders.screenVertex, shaders.compositeFragment);
    this.particleProgram = this.program(shaders.particleVertex, shaders.particleFragment);
    this.boxMesh = this.mesh(roundedBox(4), MAX_INSTANCES);
    this.ringMesh = this.mesh(torus(), 32);
    this.ambientRingMesh = this.mesh(torus(96, 4, 0.001), 2);
    this.emptyVao = this.track('VertexArray', gl.createVertexArray());
    this.particleVao = this.track('VertexArray', gl.createVertexArray()); gl.bindVertexArray(this.particleVao);
    this.particleBuffer = this.track('Buffer', gl.createBuffer()); gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particles.vertices.byteLength, gl.DYNAMIC_DRAW);
    for (const [attribute, size, offset] of [[0, 3, 0], [1, 4, 3], [2, 1, 7]]) {
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 32, offset * 4);
    }
    gl.bindVertexArray(null); gl.disable(gl.CULL_FACE);
    this.initializeShadows();
    this.resize(true);
  }
  initializeShadows() {
    const gl = this.gl, size = CONFIG.render.shadowSize;
    this.shadowTexture = this.track('Texture', gl.createTexture()); gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFramebuffer = this.track('Framebuffer', gl.createFramebuffer()); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTexture, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Impossible d’initialiser les ombres.');
    const lightView = lookAt(new Float32Array(16), [-18, 36, 25], [0, 0, 0]);
    const lightProjection = orthographic(new Float32Array(16), CONFIG.render.shadowExtent, 1, 85);
    this.lightViewProjection = multiply(new Float32Array(16), lightProjection, lightView);
  }
  bindShadowUniforms(uniforms) {
    const gl = this.gl;
    gl.uniformMatrix4fv(uniforms.uLightViewProjection, false, this.lightViewProjection);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture); gl.uniform1i(uniforms.uShadow, 3);
    gl.uniform1f(uniforms.uShadowTexel, 1 / CONFIG.render.shadowSize);
  }
  createTarget(width, height, depth) {
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.hdr ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    let depthTexture = null;
    if (depth) {
      depthTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
    }
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('La mémoire graphique ne permet pas de créer le rendu.');
    return { framebuffer, texture, depthTexture, width, height };
  }
  disposeTargets() {
    if (!this.targets) return;
    for (const target of this.targets) {
      this.gl.deleteFramebuffer(target.framebuffer); this.gl.deleteTexture(target.texture);
      if (target.depthTexture) this.gl.deleteTexture(target.depthTexture);
    }
    this.targets = null;
  }
  resize(force = false) {
    if (this.lost) return;
    const ratioLimit = this.settings.quality === 'high' ? CONFIG.render.maxPixelRatio : CONFIG.render.balancedPixelRatio;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, ratioLimit);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * this.pixelRatio)), height = Math.max(1, Math.round(this.canvas.clientHeight * this.pixelRatio));
    if (!force && this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width; this.canvas.height = height;
    this.disposeTargets();
    const bloomWidth = Math.max(1, Math.floor(width * CONFIG.render.bloomScale)), bloomHeight = Math.max(1, Math.floor(height * CONFIG.render.bloomScale));
    this.targets = [this.createTarget(width, height, true), this.createTarget(bloomWidth, bloomHeight, false), this.createTarget(bloomWidth, bloomHeight, false)];
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }
  setCamera(camera) { this.camera = camera; }
  addBox(x, y, z, sx, sy, sz, color, emission = 0, angle = 0) {
    if (this.boxCount >= MAX_INSTANCES) return;
    this.instances.set([x, y, z, sx, sy, sz, color[0], color[1], color[2], emission, angle], this.boxCount++ * INSTANCE_STRIDE);
  }
  addRing(x, y, z, size, color, emission = 1) {
    this.ringInstances.set([x, y, z, size, size, size, ...color, emission, 0], this.ringCount++ * INSTANCE_STRIDE);
  }
  buildScene(session, state) {
    this.boxCount = 0; this.ringCount = 0;
    const demo = state === 'Menu' || state === 'Boot';
    const t = this.settings.reducedMotion ? 0 : this.time;
    const tint = session.mode === 'flux' ? [0.54, 0.46, 1] : CONFIG.render.mint;
    this.tint = tint;
    this.addBox(0, -0.44, 0, CONFIG.board.size + 0.4, 0.85, CONFIG.board.size + 0.4, [0.025, 0.065, 0.071]);
    const railColor = session.mode === 'survival' ? CONFIG.render.amber : tint;
    for (const sign of [-1, 1]) {
      this.addBox(sign * (HALF + 0.1), -0.04, 0, 0.055, 0.07, CONFIG.board.size + 0.1, railColor, 0.6);
      this.addBox(0, -0.04, sign * (HALF + 0.1), CONFIG.board.size + 0.1, 0.07, 0.055, railColor, 0.6);
      this.addBox(sign * (HALF + 0.05), -0.58, 0, 0.045, 0.045, CONFIG.board.size - 0.4, tint, 0.45);
      this.addBox(0, -0.58, sign * (HALF + 0.05), CONFIG.board.size - 0.4, 0.045, 0.045, tint, 0.45);
      for (let tick = -HALF + 2; tick < HALF; tick += 2) {
        this.addBox(tick, 0.02, sign * (HALF + 0.55), 0.035, 0.025, 0.22, tint, 0.15);
        this.addBox(sign * (HALF + 0.55), 0.02, tick, 0.22, 0.025, 0.035, tint, 0.15);
      }
    }
    // An underlit suspension ring and four corner beacons frame the playable grid.
    for (let index = 0; index < 2; index++) {
      const size = CONFIG.board.size * (1.28 + index * 0.13);
      this.ambientRingInstances.set([0, -1.5 - index * 0.6, 0, size, size, size, ...tint.map((value) => value * 0.22), 0.12, 0], index * INSTANCE_STRIDE);
    }
    for (const xSign of [-1, 1]) for (const zSign of [-1, 1]) {
      const x = xSign * (HALF + 0.55), z = zSign * (HALF + 0.55);
      this.addBox(x, -0.3, z, 0.35, 1.1, 0.35, [0.04, 0.12, 0.1]);
      this.addBox(x, 0.26, z, 0.29, 0.055, 0.29, tint, 0.8);
    }
    const food = demo ? { x: 15, z: 13 } : session.food;
    if (food) {
      const x = world(food.x), z = world(food.z), y = CONFIG.render.foodHeight + Math.sin(t * 2.8) * 0.13;
      this.foodPosition.set([x, y, z]);
      this.addBox(x, y, z, 0.47, 0.62, 0.47, CONFIG.render.amber, 1.15, t * 0.8);
      this.addBox(x, y, z, 0.2, 0.83, 0.2, [1, 0.87, 0.45], 1.3, -t);
      this.addRing(x, 0.09, z, 1.4, CONFIG.render.amber, 0.65);
      this.addRing(x, 0.12, z, 1.8 + Math.sin(t * 2) * 0.12, CONFIG.render.amber, 0.18);
    } else this.foodPosition.set([100, 0, 100]);
    const length = demo ? 34 : session.snake.body.length;
    const fraction = demo ? (t * 4) % 1 : session.interpolation;
    const demoIndex = Math.floor(t * 4) + 29;
    let headDirection = DIRECTIONS[session.snake.direction];
    for (let index = length - 1; index >= 0; index--) {
      let current, previous;
      if (demo) {
        current = DEMO_PATH[((demoIndex - index) % DEMO_PATH.length + DEMO_PATH.length) % DEMO_PATH.length];
        previous = DEMO_PATH[((demoIndex - index - 1) % DEMO_PATH.length + DEMO_PATH.length) % DEMO_PATH.length];
        if (index === 0) headDirection = { x: current.x - previous.x, z: current.z - previous.z };
      } else {
        current = session.snake.body[index]; previous = session.snake.previousBody[index] ?? current;
      }
      const discontinuity = Math.abs(current.x - previous.x) + Math.abs(current.z - previous.z) > 1;
      const x = world(discontinuity ? current.x : lerp(previous.x, current.x, fraction));
      const z = world(discontinuity ? current.z : lerp(previous.z, current.z, fraction));
      const head = index === 0;
      const progress = 1 - index / length;
      const color = session.dead && !demo ? CONFIG.render.danger : [lerp(TAIL[0], tint[0], progress), lerp(TAIL[1], tint[1], progress), lerp(TAIL[2], tint[2], progress)];
      const size = head ? 0.91 : lerp(0.59, 0.87, Math.min(1, progress * 3));
      const height = head ? 0.7 : 0.57 + Math.sin(t * 3 - index * 0.55) * (this.settings.reducedMotion ? 0 : 0.035);
      // Ground projections give contact and a luminous reflection without a texture asset.
      this.addBox(x, 0.036, z, size * 1.2, 0.012, size * 1.2, color.map((c) => c * 0.1), 0.12);
      this.addBox(x, height / 2 + 0.07, z, size, height, size, color, head ? 0.68 : 0.18 + progress * 0.18);
      this.addBox(x, height + 0.075, z, size * 0.66, 0.012, size * 0.66, color, head ? 0.6 : 0.28);
      if (head) {
        this.head.set([x, 0.5, z]);
        const dx = headDirection.x, dz = headDirection.z;
        for (const sign of [-1, 1]) {
          this.addBox(x + dx * 0.32 + dz * sign * 0.23, height + 0.09, z + dz * 0.32 - dx * sign * 0.23, 0.14, 0.025, 0.14, [0.01, 0.08, 0.07]);
          this.addBox(x + dx * 0.35 + dz * sign * 0.23, height + 0.11, z + dz * 0.35 - dx * sign * 0.23, 0.065, 0.025, 0.065, [0.9, 1, 0.88], 1.3);
        }
      }
    }
    this.headDirection = headDirection;
    if (!demo) {
      for (const obstacle of session.obstacles) {
        const x = world(obstacle.x), z = world(obstacle.z);
        this.addBox(x, 0.65, z, 0.86, 1.3, 0.86, [0.15, 0.07, 0.085]);
        this.addBox(x, 1.31, z, 0.7, 0.03, 0.7, CONFIG.render.danger, 0.65);
      }
      for (const warning of session.warnings) {
        this.addBox(world(warning.x), 0.04, world(warning.z), 0.9, 0.025, 0.9, CONFIG.render.danger, 0.2 + (Math.sin(t * 13) * 0.5 + 0.5) * 0.8);
      }
      for (let index = 0; index < session.portals.length; index++) {
        const portal = session.portals[index], color = index ? [1, 0.4, 0.75] : [0.5, 0.4, 1];
        for (let ring = 0; ring < 3; ring++) this.addRing(world(portal.x), 0.15 + ring * 0.27, world(portal.z), 0.9 + Math.sin(t * 3 + ring) * 0.12, color, 0.8);
      }
    }
  }
  updateCamera(dt, session, state) {
    const aspect = this.canvas.width / this.canvas.height;
    const scale = Math.max(1, CONFIG.camera.portraitFit / aspect);
    const demo = state === 'Menu' || state === 'Boot';
    let eye, target = [0, -0.5, 0];
    const mode = this.camera;
    if (mode === 'top') eye = [0, CONFIG.camera.topHeight * scale, 0.02];
    else if (mode === 'chase') {
      const direction = this.headDirection ?? DIRECTIONS[session.snake.direction];
      eye = [this.head[0] - direction.x * CONFIG.camera.chaseDistance, CONFIG.camera.chaseHeight, this.head[2] - direction.z * CONFIG.camera.chaseDistance];
      target = [this.head[0] + direction.x * CONFIG.camera.lookAhead, 0, this.head[2] + direction.z * CONFIG.camera.lookAhead];
    } else {
      const orbit = demo && !this.settings.reducedMotion ? Math.sin(this.time * 0.08) * 0.05 : 0;
      eye = [(CONFIG.camera.isometric[0] + orbit * 25) * scale, CONFIG.camera.isometric[1] * scale, (CONFIG.camera.isometric[2] - orbit * 25) * scale];
    }
    const smoothing = 1 - Math.exp(-dt * CONFIG.render.cameraSmoothing);
    for (let axis = 0; axis < 3; axis++) { this.eye[axis] = lerp(this.eye[axis], eye[axis], smoothing); this.target[axis] = lerp(this.target[axis], target[axis], smoothing); }
    this.shake *= Math.exp(-dt * CONFIG.render.shakeDecay); this.impact *= Math.exp(-dt * CONFIG.render.shakeDecay);
    const shake = this.settings.reducedMotion ? 0 : this.shake;
    const shakenEye = [this.eye[0] + Math.sin(this.time * 93) * shake, this.eye[1] + Math.cos(this.time * 111) * shake, this.eye[2]];
    lookAt(this.view, shakenEye, this.target);
    perspective(this.projection, CONFIG.render.fieldOfView, aspect, CONFIG.render.near, CONFIG.render.far);
    multiply(this.viewProjection, this.projection, this.view);
  }
  use(program) { this.gl.useProgram(program.program); return program.uniforms; }
  drawInstances(mesh, instances, count) {
    const gl = this.gl; gl.bindVertexArray(mesh.vao); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instances, 0, count * INSTANCE_STRIDE); gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.count, count);
  }
  render(dt, session, state) {
    if (this.lost || !this.targets) return;
    this.time += dt;
    this.buildScene(session, state); this.updateCamera(dt, session, state);
    this.particles.update(dt, this.time, this.settings.reducedMotion);
    const gl = this.gl, [scene, bloomA, bloomB] = this.targets;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer); gl.viewport(0, 0, CONFIG.render.shadowSize, CONFIG.render.shadowSize);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.clear(gl.DEPTH_BUFFER_BIT);
    let uniforms = this.use(this.depthProgram); gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.lightViewProjection);
    this.drawInstances(this.boxMesh, this.instances, this.boxCount);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer); gl.viewport(0, 0, scene.width, scene.height);
    gl.clearColor(...CONFIG.render.background, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    uniforms = this.use(this.meshProgram); this.bindShadowUniforms(uniforms);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection); gl.uniform3fv(uniforms.uEye, this.eye);
    gl.uniform3fv(uniforms.uFood, this.foodPosition); gl.uniform3fv(uniforms.uHead, this.head);
    this.drawInstances(this.boxMesh, this.instances, this.boxCount);
    this.drawInstances(this.ringMesh, this.ringInstances, this.ringCount);
    this.drawInstances(this.ambientRingMesh, this.ambientRingInstances, 2);
    uniforms = this.use(this.floorProgram); gl.bindVertexArray(this.emptyVao);
    this.bindShadowUniforms(uniforms);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection); gl.uniform1f(uniforms.uHalf, HALF);
    gl.uniform1f(uniforms.uTime, this.settings.reducedMotion ? 0 : this.time); gl.uniform3fv(uniforms.uFood, this.foodPosition);
    gl.uniform3fv(uniforms.uHead, this.head); gl.uniform3fv(uniforms.uTint, this.tint); gl.drawArrays(gl.TRIANGLES, 0, 6);
    uniforms = this.use(this.particleProgram); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection); gl.uniform1f(uniforms.uPixelRatio, this.pixelRatio);
    gl.bindVertexArray(this.particleVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particles.vertices, 0, this.particles.count * 8); gl.drawArrays(gl.POINTS, 0, this.particles.count);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(this.emptyVao);
    uniforms = this.use(this.bloomProgram); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(uniforms.uTexture, 0);
    const passes = this.settings.quality === 'high' ? 4 : 2;
    let source = scene, destination;
    for (let pass = 0; pass < passes; pass++) {
      destination = pass % 2 === 0 ? bloomA : bloomB;
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer); gl.viewport(0, 0, destination.width, destination.height);
      gl.bindTexture(gl.TEXTURE_2D, source.texture); gl.uniform1i(uniforms.uExtract, pass === 0 ? 1 : 0);
      gl.uniform2f(uniforms.uDirection, pass % 2 === 0 ? 1.6 / source.width : 0, pass % 2 ? 1.6 / source.height : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3); source = destination;
    }
    uniforms = this.use(this.compositeProgram); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, scene.width, scene.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.texture); gl.uniform1i(uniforms.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, source.texture); gl.uniform1i(uniforms.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, scene.depthTexture); gl.uniform1i(uniforms.uDepth, 2);
    gl.uniform2f(uniforms.uResolution, scene.width, scene.height); gl.uniform2f(uniforms.uClip, CONFIG.render.near, CONFIG.render.far);
    gl.uniform1f(uniforms.uFocus, Math.hypot(this.eye[0] - this.target[0], this.eye[1] - this.target[1], this.eye[2] - this.target[2]));
    gl.uniform1f(uniforms.uDof, this.settings.quality === 'high' && this.camera !== 'top' ? CONFIG.render.depthOfField : 0);
    gl.uniform1f(uniforms.uSpeed, !this.settings.reducedMotion && session.boosting && state === 'Playing' ? CONFIG.render.radialBlur : 0);
    gl.uniform1f(uniforms.uBloomStrength, CONFIG.render.bloomStrength); gl.uniform1f(uniforms.uTime, this.time);
    gl.uniform1f(uniforms.uImpact, this.settings.reducedMotion ? 0 : this.impact); gl.uniform1f(uniforms.uExposure, CONFIG.render.exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  }
  dispose() {
    this.abort.abort(); this.resizeObserver.disconnect(); this.unsubscribers.forEach((unsubscribe) => unsubscribe()); this.particles.clear();
    this.disposeTargets();
    for (const [kind, resource] of this.resources) this.gl[`delete${kind}`](resource);
    this.resources.length = 0; this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
