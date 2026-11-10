import { CONFIG, DIRECTIONS, DIRECTION_NAMES } from '../config.js';

export const sameCell = (a, b) => a.x === b.x && a.z === b.z;
export const cellKey = (cell) => cell.z * CONFIG.board.size + cell.x;

export class SnakeLogic {
  constructor() { this.reset(); }
  reset() {
    const center = Math.floor(CONFIG.board.size / 2);
    this.body = Array.from({ length: CONFIG.board.initialLength }, (_, index) => ({ x: center - index, z: center }));
    this.previousBody = this.body.map((cell) => ({ ...cell }));
    this.direction = 'right';
    this.queue = [];
    this.teleported = false;
  }
  enqueue(direction) {
    if (!DIRECTIONS[direction] || this.queue.length >= CONFIG.simulation.inputBuffer) return false;
    const previous = this.queue.at(-1) ?? this.direction;
    const a = DIRECTIONS[previous]; const b = DIRECTIONS[direction];
    if (previous === direction || (a.x + b.x === 0 && a.z + b.z === 0)) return false;
    this.queue.push(direction);
    return true;
  }
  turn(relative) {
    const index = DIRECTION_NAMES.indexOf(this.queue.at(-1) ?? this.direction);
    return this.enqueue(DIRECTION_NAMES[(index + relative + DIRECTION_NAMES.length) % DIRECTION_NAMES.length]);
  }
  nextHead(wrap) {
    if (this.queue.length) this.direction = this.queue.shift();
    const vector = DIRECTIONS[this.direction];
    let x = this.body[0].x + vector.x;
    let z = this.body[0].z + vector.z;
    this.teleported = false;
    if (wrap) {
      this.teleported = x < 0 || z < 0 || x >= CONFIG.board.size || z >= CONFIG.board.size;
      x = (x + CONFIG.board.size) % CONFIG.board.size;
      z = (z + CONFIG.board.size) % CONFIG.board.size;
    }
    return { x, z };
  }
  collides(head, grows, obstacles) {
    if (head.x < 0 || head.z < 0 || head.x >= CONFIG.board.size || head.z >= CONFIG.board.size) return 'wall';
    if (obstacles.some((cell) => sameCell(cell, head))) return 'obstacle';
    const occupiedLength = this.body.length - (grows ? 0 : 1);
    for (let index = 0; index < occupiedLength; index++) if (sameCell(this.body[index], head)) return 'self';
    return null;
  }
  move(head, grows) {
    this.previousBody = this.body;
    this.body = [head, ...this.body.slice(0, grows ? this.body.length : -1)];
  }
}
