import { CONFIG } from './config.js';
import { EventBus } from './core/EventBus.js';
import { GameStateManager } from './core/GameStateManager.js';
import { Storage } from './core/Storage.js';
import { GameSession } from './game/GameSession.js';
import { PhysicsEngine } from './game/PhysicsEngine.js';
import { RenderPipeline } from './render/RenderPipeline.js';
import { AudioSynthesizer } from './audio/AudioSynthesizer.js';
import { InputEngine } from './input/InputEngine.js';
import { UserInterface } from './ui/UserInterface.js';

export class SerpentApplication {
  constructor() {
    this.events = new EventBus(); this.storage = new Storage(); this.state = new GameStateManager(this.events);
    if (!this.storage.data.runs && window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.storage.settings({ reducedMotion: true });
    this.session = new GameSession(this.events);
    this.audio = new AudioSynthesizer(this.storage.data.settings);
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new RenderPipeline(this.canvas, this.events, this.storage.data.settings);
    this.input = new InputEngine(this.canvas, this.events, this.state);
    this.ui = new UserInterface(this.events, this.state, this.session, this.storage);
    this.physics = new PhysicsEngine((dt) => { if (this.state.is('Playing')) this.session.update(dt); });
    this.abort = new AbortController(); this.disposed = false;
    this.lastTime = 0; this.uiClock = 0; this.frameClock = 0; this.frameCount = 0;
    this.connectEvents(); this.state.transition('Menu');
    window.addEventListener('pagehide', (event) => { if (event.persisted) this.pause(); else this.dispose(); }, { signal: this.abort.signal });
    window.addEventListener('pageshow', () => { this.lastTime = 0; }, { signal: this.abort.signal });
    this.frame = this.frame.bind(this); this.animationId = requestAnimationFrame(this.frame);
  }
  connectEvents() {
    const on = (name, callback) => this.events.on(name, callback);
    on('start', () => this.start()); on('resume', () => this.resume()); on('pause', () => this.togglePause()); on('autopause', () => this.pause());
    on('menu', () => {
      this.input.release(); this.physics.reset();
      if (!this.state.is('Menu')) this.state.transition('Menu');
    });
    on('mode', (mode) => { if (this.state.is('Menu')) { this.session.reset(mode); this.ui.syncMode(); this.audio.effect('ui'); } });
    on('direction', (direction) => {
      if (!this.state.is('Playing')) return;
      if (this.renderer.camera === 'chase') {
        if (direction === 'left') this.session.snake.turn(-1);
        else if (direction === 'right') this.session.snake.turn(1);
      } else this.session.snake.enqueue(direction);
    });
    on('boost', (enabled) => { this.session.boostRequested = enabled && this.state.is('Playing'); });
    on('camera', (camera) => {
      const current = CONFIG.cameras.findIndex((item) => item.id === this.renderer.camera);
      const next = camera ?? CONFIG.cameras[(current + 1) % CONFIG.cameras.length].id;
      if (!CONFIG.cameras.some((item) => item.id === next)) return;
      this.renderer.setCamera(next); this.storage.settings({ camera: next }); this.ui.syncCamera(next);
      this.session.snake.queue.length = 0;
      if (next === 'chase') this.ui.toast('POURSUITE · ← / → POUR TOURNER');
    });
    on('mute', () => { this.ui.toggleMute(); this.audio.updateSettings(); });
    on('unlockaudio', () => { void this.audio.unlock(); }); on('uisound', () => this.audio.effect('ui'));
    on('settings', ({ key }) => { this.audio.updateSettings(); if (key === 'quality') this.renderer.resize(true); });
    on('food', (event) => this.audio.effect('food', event));
    on('portal', () => this.audio.effect('portal')); on('mutator', () => this.audio.effect('mutator'));
    on('death', (event) => {
      this.session.newRecord = this.storage.record(this.session.mode, event.score);
      this.audio.effect(event.won ? 'start' : 'death'); this.input.release(); this.state.transition('GameOver');
    });
    on('state', ({ current }) => { this.audio.setRunning(current === 'Playing'); this.physics.reset(); });
    on('graphicslost', () => { this.pause(); this.ui.toast('CONNEXION GRAPHIQUE INTERROMPUE'); });
    on('graphicsrestored', () => this.ui.toast('RENDU RESTAURÉ · VOUS POUVEZ REPRENDRE'));
  }
  start() {
    if (!this.state.is('Menu') && !this.state.is('GameOver')) return;
    this.session.reset(this.session.mode); this.session.newRecord = false;
    this.renderer.particles.clear(); this.input.release(); this.ui.syncMode();
    this.state.transition('Playing'); this.lastTime = 0;
    void this.audio.unlock().then(() => { this.audio.setRunning(this.state.is('Playing')); if (this.state.is('Playing')) this.audio.effect('start'); });
  }
  pause() { if (this.state.is('Playing')) { this.input.release(); this.state.transition('Paused'); } }
  resume() { if (this.state.is('Paused') && !this.renderer.lost) { this.input.release(); this.lastTime = 0; this.state.transition('Playing'); } }
  togglePause() { if (this.state.is('Playing')) this.pause(); else if (this.state.is('Paused')) this.resume(); }
  frame(timestamp) {
    if (this.disposed) return;
    const dt = this.lastTime ? Math.min((timestamp - this.lastTime) / 1000, CONFIG.simulation.maxFrameDelta) : 0;
    this.lastTime = timestamp;
    if (!document.hidden) {
      this.input.pollGamepad();
      if (this.state.is('Playing')) this.physics.advance(dt);
      this.renderer.render(dt, this.session, this.state.current);
      this.uiClock += dt; this.frameClock += dt; this.frameCount++;
      if (this.uiClock >= CONFIG.ui.refreshInterval) { this.ui.update(); this.uiClock = 0; }
      if (this.frameClock >= CONFIG.render.frameSample) {
        this.ui.text('fps', String(Math.round(this.frameCount / this.frameClock))); this.frameClock = 0; this.frameCount = 0;
      }
    }
    this.animationId = requestAnimationFrame(this.frame);
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.animationId); this.abort.abort();
    this.input.dispose(); this.ui.dispose(); this.renderer.dispose(); this.events.dispose(); await this.audio.dispose();
  }
}

export let app;
try { app = new SerpentApplication(); }
catch (error) {
  const panel = document.getElementById('fatal-error'); panel.hidden = false; panel.querySelector('p').textContent = error.message;
  console.error(error);
}
