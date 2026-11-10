import { CONFIG } from '../config.js';

/** Fixed simulation clock. Rendering receives an independent interpolation fraction. */
export class PhysicsEngine {
  constructor(step) { this.step = step; this.accumulator = 0; }
  advance(deltaTime) {
    this.accumulator += Math.min(Math.max(deltaTime, 0), CONFIG.simulation.maxFrameDelta);
    let iterations = 0;
    while (this.accumulator + CONFIG.simulation.clockEpsilon >= CONFIG.simulation.fixedStep && iterations < CONFIG.simulation.maxCatchupSteps) {
      this.accumulator = Math.max(0, this.accumulator - CONFIG.simulation.fixedStep);
      this.step(CONFIG.simulation.fixedStep);
      iterations++;
    }
    return this.accumulator / CONFIG.simulation.fixedStep;
  }
  reset() { this.accumulator = 0; }
}
