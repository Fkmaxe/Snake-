import { CONFIG } from '../config.js';

const STRIDE = 12;
export class ParticleSystem {
  constructor() {
    this.pool = new Float32Array(CONFIG.render.particles * STRIDE);
    this.vertices = new Float32Array((CONFIG.render.particles + CONFIG.render.stars) * 8);
    this.cursor = 0;
    this.stars = Array.from({ length: CONFIG.render.stars }, () => [
      (Math.random() - 0.5) * 55, Math.random() * 14 + 0.5, (Math.random() - 0.5) * 48, Math.random() * 6,
    ]);
  }
  burst(x, z, color, count = 36, power = 1) {
    for (let index = 0; index < count; index++) {
      const offset = this.cursor * STRIDE;
      const angle = Math.random() * Math.PI * 2, speed = (1 + Math.random() * 4) * power;
      this.pool.set([x, 0.6, z, Math.cos(angle) * speed, (1 + Math.random() * 5) * power, Math.sin(angle) * speed,
        color[0], color[1], color[2], 0.5 + Math.random() * 0.8, 1.3, 0.25 + Math.random() * 0.65], offset);
      this.cursor = (this.cursor + 1) % CONFIG.render.particles;
    }
  }
  update(dt, time, reducedMotion) {
    let count = 0;
    for (let offset = 0; offset < this.pool.length; offset += STRIDE) {
      if (this.pool[offset + 9] <= 0) continue;
      this.pool[offset + 9] -= dt;
      this.pool[offset] += this.pool[offset + 3] * dt;
      this.pool[offset + 1] += this.pool[offset + 4] * dt;
      this.pool[offset + 2] += this.pool[offset + 5] * dt;
      this.pool[offset + 4] -= CONFIG.render.particleGravity * dt;
      if (this.pool[offset + 1] < 0.06) { this.pool[offset + 1] = 0.06; this.pool[offset + 4] *= -0.35; }
      const vertex = count++ * 8;
      this.vertices.set([this.pool[offset], this.pool[offset + 1], this.pool[offset + 2], this.pool[offset + 6], this.pool[offset + 7], this.pool[offset + 8], Math.max(0, this.pool[offset + 9] / this.pool[offset + 10]), this.pool[offset + 11]], vertex);
    }
    if (!reducedMotion) for (const star of this.stars) {
      this.vertices.set([star[0], star[1] + Math.sin(time * 0.2 + star[3]) * 0.7, star[2], 0.25, 0.7, 0.59,
        0.16 + Math.sin(time * 0.7 + star[3]) * 0.1, 0.26], count++ * 8);
    }
    this.count = count;
  }
  clear() { this.pool.fill(0); this.count = 0; }
}
