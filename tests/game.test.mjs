import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../dist/src/config.js';
import { EventBus } from '../dist/src/core/EventBus.js';
import { GameStateManager } from '../dist/src/core/GameStateManager.js';
import { Random } from '../dist/src/core/Random.js';
import { Storage } from '../dist/src/core/Storage.js';
import { SnakeLogic, sameCell } from '../dist/src/game/SnakeLogic.js';
import { GameSession } from '../dist/src/game/GameSession.js';
import { PhysicsEngine } from '../dist/src/game/PhysicsEngine.js';

function session(mode = 'classic') {
  const events = new EventBus();
  const game = new GameSession(events, new Random(42)); game.reset(mode); game.countdown = 0;
  return { game, events };
}

test('configuration is deeply immutable', () => {
  assert.throws(() => { CONFIG.gameplay.initialInterval = 0; }, TypeError);
  assert.ok(Object.isFrozen(CONFIG.cameras[0]));
});
test('state machine rejects illegal transitions and reports valid transitions', () => {
  const events = new EventBus(), state = new GameStateManager(events), history = [];
  events.on('state', (event) => history.push(event));
  assert.throws(() => state.transition('GameOver'));
  state.transition('Menu'); state.transition('Playing'); state.transition('Paused'); state.transition('Playing'); state.transition('GameOver'); state.transition('Menu');
  assert.equal(history.length, 6); assert.equal(state.current, 'Menu'); assert.equal(state.transition('Menu'), false);
});
test('event subscriptions release cleanly', () => {
  const events = new EventBus(); let count = 0;
  const unsubscribe = events.on('test', () => count++); events.emit('test'); unsubscribe(); events.emit('test');
  events.on('test', () => count++); events.dispose(); events.emit('test'); assert.equal(count, 1);
});
test('reverse input is rejected, queued corners are preserved, buffer is bounded', () => {
  const snake = new SnakeLogic();
  assert.equal(snake.enqueue('left'), false); assert.equal(snake.enqueue('up'), true);
  assert.equal(snake.enqueue('down'), false); assert.equal(snake.enqueue('left'), true); assert.equal(snake.enqueue('down'), false);
  assert.deepEqual(snake.nextHead(false), { x: 12, z: 11 }); assert.equal(snake.direction, 'up');
  snake.move({ x: 12, z: 11 }, false); assert.deepEqual(snake.nextHead(false), { x: 11, z: 11 });
});
test('relative turns are based on the last queued heading', () => {
  const snake = new SnakeLogic(); snake.turn(-1); snake.turn(-1); assert.deepEqual(snake.queue, ['up', 'left']);
});
test('a vacating tail is traversable only when the snake does not grow', () => {
  const snake = new SnakeLogic(); snake.body = [{ x: 1, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }];
  assert.equal(snake.collides({ x: 2, z: 1 }, false, []), null);
  assert.equal(snake.collides({ x: 2, z: 1 }, true, []), 'self');
  assert.equal(snake.collides({ x: 1, z: 2 }, false, []), 'self');
});
test('classic walls and obstacles cause one terminal death event', () => {
  const { game, events } = session(); let deaths = 0; events.on('death', () => deaths++);
  game.snake.body = [{ x: CONFIG.board.size - 1, z: 5 }]; game.tick(); game.update(3); game.end('wall');
  assert.equal(game.dead, true); assert.equal(deaths, 1);
  const other = session().game; other.obstacles = [{ x: 13, z: 12 }]; other.tick(); assert.equal(other.dead, true);
});
test('Flux wraps both boundaries without losing body segments', () => {
  const snake = new SnakeLogic(); snake.body = [{ x: 23, z: 3 }];
  assert.deepEqual(snake.nextHead(true), { x: 0, z: 3 }); assert.equal(snake.teleported, true);
  snake.direction = 'up'; snake.body = [{ x: 3, z: 0 }]; assert.deepEqual(snake.nextHead(true), { x: 3, z: 23 });
});
test('collecting grows, scores, emits feedback, and spawns a free food', () => {
  const { game, events } = session(); const rewards = []; events.on('food', (event) => rewards.push(event));
  game.food = { x: 13, z: 12 }; game.tick();
  assert.equal(game.snake.body.length, CONFIG.board.initialLength + 1); assert.equal(game.foods, 1);
  assert.equal(game.score, 100); assert.equal(rewards.length, 1);
  assert.ok(!game.snake.body.some((cell) => sameCell(cell, game.food)));
});
test('combo windows and boost scoring use the current run state', () => {
  const { game } = session(); game.collect(game.snake.body[0]); game.elapsed = 2; game.boosting = true;
  game.collect(game.snake.body[0]); assert.equal(game.combo, 2); assert.equal(game.score, 500);
  game.elapsed = 12; game.boosting = false; game.collect(game.snake.body[0]); assert.equal(game.combo, 1); assert.equal(game.score, 600);
});
test('boost drains, stops at depletion, and refills when released', () => {
  const { game } = session('flux'); game.boostRequested = true;
  game.update(0.1); assert.equal(game.boosting, true); assert.ok(game.energy < 1);
  game.energy = 0; game.update(0.01); assert.equal(game.boosting, false);
  game.boostRequested = false; const before = game.energy; game.update(0.1); assert.ok(game.energy > before);
});
test('countdown does not advance the world', () => {
  const { game } = session(); game.countdown = 2; const initial = JSON.stringify(game.snake.body);
  game.update(1); assert.equal(game.elapsed, 0); assert.equal(JSON.stringify(game.snake.body), initial); assert.equal(game.countdown, 1);
});
test('paired portals teleport once and validate the exit for collisions', () => {
  const { game, events } = session('flux'); let jumps = 0; events.on('portal', () => jumps++);
  game.portals = [{ x: 13, z: 12 }, { x: 2, z: 3 }]; game.food = { x: 1, z: 1 }; game.tick();
  assert.deepEqual(game.snake.body[0], { x: 2, z: 3 }); assert.equal(jumps, 1); assert.equal(game.dead, false);
  const blocked = session('flux').game; blocked.portals = [{ x: 13, z: 12 }, { x: 11, z: 12 }]; blocked.tick(); assert.equal(blocked.dead, true);
});
test('Flux spawns distinct unoccupied portals every three foods', () => {
  const { game } = session('flux');
  for (let index = 0; index < 3; index++) game.collect(game.snake.body[0]);
  assert.equal(game.portals.length, 2); assert.ok(!sameCell(...game.portals));
  for (const portal of game.portals) { assert.ok(!sameCell(portal, game.food)); assert.ok(!game.snake.body.some((cell) => sameCell(cell, portal))); }
});
test('Flux temporal mutator is periodic and reversible', () => {
  const { game } = session('flux'); game.elapsed = 18; game.update(0.01); assert.equal(game.fluxActive, true);
  game.elapsed = 25; game.update(0.01); assert.equal(game.fluxActive, false);
});
test('Survival announces obstacles before solidifying them and never spawns through the body', () => {
  const { game } = session('survival'); game.elapsed = CONFIG.gameplay.obstaclePeriod; game.updateObstacles();
  assert.equal(game.warnings.length, 3); assert.equal(game.obstacles.length, 0);
  const blocked = game.warnings[0]; game.snake.body.unshift({ x: blocked.x, z: blocked.z });
  game.elapsed += CONFIG.gameplay.obstacleWarning + 0.1; game.updateObstacles();
  assert.equal(game.warnings.length, 1); assert.equal(game.obstacles.length, 2);
  game.snake.body.shift(); game.updateObstacles(); assert.equal(game.warnings.length, 0); assert.equal(game.obstacles.length, 3);
});
test('a completely filled board produces a victory, not an infinite food spawn', () => {
  const { game } = session(); game.snake.body = [];
  for (let z = 0; z < CONFIG.board.size; z++) for (let x = 0; x < CONFIG.board.size; x++) game.snake.body.push({ x, z });
  game.collect(game.snake.body[0]); assert.equal(game.won, true); assert.equal(game.dead, true); assert.equal(game.food, null);
});
test('fixed simulation yields identical outcomes at 30, 60, and 144 render FPS', () => {
  const outcomes = [];
  for (const fps of [30, 60, 144]) {
    const { game } = session('flux'); game.food = { x: 0, z: 0 };
    const engine = new PhysicsEngine((dt) => game.update(dt));
    for (let frame = 0; frame < fps * 8; frame++) engine.advance(1 / fps);
    outcomes.push({ body: game.snake.body, score: game.score, elapsed: Math.round(game.elapsed * 1000) });
  }
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});
test('a stalled render frame cannot trigger unbounded catch-up work', () => {
  let steps = 0; const engine = new PhysicsEngine(() => steps++); engine.advance(50);
  assert.ok(steps <= CONFIG.simulation.maxCatchupSteps); assert.ok(engine.accumulator < CONFIG.simulation.fixedStep);
});
test('resetting the fixed clock inside a state transition never makes it negative', () => {
  const engine = new PhysicsEngine(() => engine.reset()); engine.advance(1 / 60); assert.equal(engine.accumulator, 0);
});
test('records and preferences survive reload; corrupt or inaccessible storage is harmless', () => {
  const memory = new Map(); const backend = { getItem: (key) => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const store = new Storage(backend); assert.equal(store.record('classic', 500), true); assert.equal(store.record('classic', 200), false);
  store.settings({ volume: 0.7, camera: 'top' }); const restored = new Storage(backend);
  assert.equal(restored.best('classic'), 500); assert.equal(restored.data.settings.volume, 0.7); assert.equal(restored.data.settings.camera, 'top');
  const inaccessible = new Storage({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.doesNotThrow(() => inaccessible.record('flux', 300)); assert.equal(inaccessible.best('flux'), 300);
  const corrupt = new Storage({ getItem: () => '{broken' }); assert.equal(corrupt.best('classic'), 0);
});
test('restart clears every run-specific modifier', () => {
  const { game } = session('survival'); game.score = 900; game.obstacles = [{ x: 2, z: 2 }]; game.dead = true; game.energy = 0;
  game.reset('flux'); assert.equal(game.score, 0); assert.equal(game.energy, 1); assert.equal(game.dead, false); assert.equal(game.mode, 'flux');
  assert.equal(game.obstacles.length, 0); assert.equal(game.snake.body.length, CONFIG.board.initialLength); assert.ok(game.countdown > 0);
});
