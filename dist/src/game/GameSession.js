import { CONFIG } from '../config.js';
import { Random } from '../core/Random.js';
import { SnakeLogic, sameCell, cellKey } from './SnakeLogic.js';

export class GameSession {
  constructor(events, random = new Random()) {
    this.events = events;
    this.random = random;
    this.snake = new SnakeLogic();
    this.reset('classic');
  }
  reset(mode) {
    if (!CONFIG.modes[mode]) throw new Error(`Mode inconnu : ${mode}`);
    this.mode = mode;
    this.snake.reset();
    this.score = 0; this.foods = 0; this.elapsed = 0; this.tickTime = 0;
    this.energy = 1; this.boostRequested = false; this.boosting = false;
    this.combo = 1; this.lastFoodTime = -Infinity; this.dead = false; this.won = false;
    this.obstacles = []; this.warnings = []; this.portals = [];
    this.nextObstacle = CONFIG.gameplay.obstaclePeriod;
    this.countdown = CONFIG.gameplay.countdown;
    this.fluxActive = false;
    this.food = this.freeCell();
  }
  get interval() {
    return Math.max(CONFIG.gameplay.minimumInterval, CONFIG.gameplay.initialInterval - this.foods * CONFIG.gameplay.acceleration)
      * CONFIG.modes[this.mode].speed * (this.boosting ? CONFIG.gameplay.boostFactor : 1)
      * (this.fluxActive ? CONFIG.gameplay.fluxSpeedFactor : 1);
  }
  get interpolation() { return Math.min(this.tickTime / this.interval, 1); }
  freeCell(extra = [], minimumDistance = 0) {
    const occupied = new Set([...this.snake.body, ...this.obstacles, ...this.warnings, ...this.portals, ...extra].map(cellKey));
    const candidates = [];
    for (let z = 0; z < CONFIG.board.size; z++) for (let x = 0; x < CONFIG.board.size; x++) {
      if (!occupied.has(cellKey({ x, z })) && Math.abs(x - this.snake.body[0].x) + Math.abs(z - this.snake.body[0].z) >= minimumDistance) candidates.push({ x, z });
    }
    return candidates.length ? candidates[this.random.integer(candidates.length)] : null;
  }
  update(dt) {
    if (this.dead) return;
    if (this.countdown > 0) { this.countdown = Math.max(0, this.countdown - dt); return; }
    this.elapsed += dt;
    this.boosting = this.boostRequested && this.energy > (this.boosting ? 0 : CONFIG.gameplay.minimumBoost);
    this.energy = Math.max(0, Math.min(1, this.energy + dt * (this.boosting ? -CONFIG.gameplay.boostDrain : CONFIG.gameplay.boostRecovery)));
    if (this.elapsed - this.lastFoodTime > CONFIG.gameplay.comboWindow) this.combo = 1;
    if (this.mode === 'flux') {
      const active = this.elapsed >= CONFIG.gameplay.fluxPeriod && this.elapsed % CONFIG.gameplay.fluxPeriod < CONFIG.gameplay.fluxDuration;
      if (active !== this.fluxActive) {
        this.fluxActive = active;
        this.events.emit('mutator', { active, text: active ? 'SURCHARGE TEMPORELLE' : 'FLUX STABILISÉ' });
      }
    }
    if (this.mode === 'survival') this.updateObstacles();
    this.tickTime += dt;
    while (this.tickTime >= this.interval && !this.dead) {
      this.tickTime -= this.interval;
      this.tick();
    }
  }
  tick() {
    let head = this.snake.nextHead(CONFIG.modes[this.mode].wrap);
    const portalIndex = this.portals.findIndex((portal) => sameCell(portal, head));
    if (portalIndex !== -1 && this.portals.length === 2) {
      head = { ...this.portals[1 - portalIndex] };
      this.snake.teleported = true;
      this.events.emit('portal', head);
    }
    const grows = this.food && sameCell(head, this.food);
    const collision = this.snake.collides(head, grows, this.obstacles);
    if (collision) { this.end(collision); return; }
    this.snake.move(head, grows);
    if (grows) this.collect(head);
    this.events.emit('tick', { head, grows });
  }
  collect(head) {
    this.combo = this.elapsed - this.lastFoodTime <= CONFIG.gameplay.comboWindow ? Math.min(CONFIG.gameplay.maxCombo, this.combo + 1) : 1;
    this.lastFoodTime = this.elapsed;
    this.foods++;
    const points = Math.round(CONFIG.board.pointsPerFood * CONFIG.modes[this.mode].multiplier * this.combo * (this.boosting ? 2 : 1));
    this.score += points;
    this.energy = Math.min(1, this.energy + CONFIG.gameplay.foodEnergy);
    this.events.emit('food', { ...head, points, combo: this.combo });
    this.food = this.freeCell();
    if (!this.food) { this.won = true; this.end('complete'); return; }
    if (this.mode === 'flux' && this.foods % CONFIG.gameplay.portalPeriod === 0) {
      this.portals = [];
      const first = this.freeCell([this.food], CONFIG.gameplay.portalMinimumDistance);
      if (first) {
        const second = this.freeCell([this.food, first], CONFIG.gameplay.portalMinimumDistance);
        if (second) this.portals = [first, second];
      }
      this.events.emit('mutator', { active: true, text: 'PORTAILS CONNECTÉS' });
    }
  }
  updateObstacles() {
    if (this.elapsed >= this.nextObstacle && this.obstacles.length + this.warnings.length < CONFIG.gameplay.obstacleLimit) {
      this.nextObstacle += CONFIG.gameplay.obstaclePeriod;
      const count = Math.min(CONFIG.gameplay.obstacleBatch, CONFIG.gameplay.obstacleLimit - this.obstacles.length - this.warnings.length);
      for (let index = 0; index < count; index++) {
        const cell = this.freeCell(this.food ? [this.food] : [], CONFIG.gameplay.obstacleSafetyDistance);
        if (cell) this.warnings.push({ ...cell, activateAt: this.elapsed + CONFIG.gameplay.obstacleWarning });
      }
      this.events.emit('mutator', { active: true, text: 'OBSTACLES EN APPROCHE' });
    }
    this.warnings = this.warnings.filter((warning) => {
      if (this.elapsed < warning.activateAt) return true;
      // Never spawn a solid obstacle through a living segment; defer it visibly.
      if (this.snake.body.some((cell) => sameCell(cell, warning))) return true;
      this.obstacles.push({ x: warning.x, z: warning.z });
      this.events.emit('obstacle', warning);
      return false;
    });
  }
  end(reason) {
    if (this.dead) return;
    this.dead = true; this.boosting = false; this.boostRequested = false;
    this.events.emit('death', { reason, score: this.score, head: this.snake.body[0], won: this.won });
  }
}
