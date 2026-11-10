const KEY_DIRECTIONS = Object.freeze({ ArrowUp: 'up', KeyW: 'up', KeyZ: 'up', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left' });

export class InputEngine {
  constructor(canvas, events, state) {
    this.events = events; this.state = state; this.abort = new AbortController();
    this.pointerStart = null; this.gamepadPrevious = {}; this.activeBoostSources = new Set();
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', (event) => this.keydown(event), options);
    window.addEventListener('keyup', (event) => { if (event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.boost('keyboard', false); }, options);
    window.addEventListener('blur', () => { this.release(); events.emit('autopause'); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.release(); events.emit('autopause'); } }, options);
    canvas.addEventListener('pointerdown', (event) => { canvas.setPointerCapture(event.pointerId); this.pointerStart = { x: event.clientX, y: event.clientY }; events.emit('unlockaudio'); }, options);
    canvas.addEventListener('pointermove', (event) => {
      if (!this.pointerStart || !this.state.is('Playing')) return;
      const x = event.clientX - this.pointerStart.x, y = event.clientY - this.pointerStart.y;
      if (Math.hypot(x, y) < 22) return;
      this.events.emit('direction', Math.abs(x) > Math.abs(y) ? x > 0 ? 'right' : 'left' : y > 0 ? 'down' : 'up');
      this.pointerStart = { x: event.clientX, y: event.clientY };
    }, options);
    const releasePointer = () => { this.pointerStart = null; };
    canvas.addEventListener('pointerup', releasePointer, options); canvas.addEventListener('pointercancel', releasePointer, options);
    document.querySelectorAll('[data-direction]').forEach((button) => button.addEventListener('pointerdown', (event) => { event.preventDefault(); events.emit('direction', button.dataset.direction); }, options));
    document.querySelectorAll('[data-boost]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); this.boost('touch', true); }, options);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => this.boost('touch', false), options);
    });
  }
  keydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (KEY_DIRECTIONS[event.code] && this.state.is('Playing')) {
      event.preventDefault(); if (!event.repeat) this.events.emit('direction', KEY_DIRECTIONS[event.code]); return;
    }
    if ((event.code === 'Space' || event.code.startsWith('Shift')) && this.state.is('Playing')) { event.preventDefault(); this.boost('keyboard', true); return; }
    if (event.repeat) return;
    if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); this.events.emit('pause'); }
    else if (event.code === 'KeyC') this.events.emit('camera');
    else if (event.code === 'KeyM') this.events.emit('mute');
    else if (event.code === 'KeyR' && this.state.is('GameOver')) this.events.emit('start');
    else if (event.code === 'Enter' && !event.target.closest('button') && (this.state.is('Menu') || this.state.is('GameOver'))) this.events.emit('start');
  }
  boost(source, enabled) {
    if (enabled) this.activeBoostSources.add(source); else this.activeBoostSources.delete(source);
    this.events.emit('boost', this.activeBoostSources.size > 0);
  }
  release() { this.activeBoostSources.clear(); this.pointerStart = null; this.events.emit('boost', false); }
  pollGamepad() {
    if (document.querySelector('dialog[open]')) return;
    const gamepad = navigator.getGamepads?.()?.[0];
    if (!gamepad) { if (this.activeBoostSources.has('gamepad')) this.boost('gamepad', false); this.gamepadPrevious = {}; return; }
    const pressed = {
      up: gamepad.buttons[12]?.pressed || gamepad.axes[1] < -0.55,
      down: gamepad.buttons[13]?.pressed || gamepad.axes[1] > 0.55,
      left: gamepad.buttons[14]?.pressed || gamepad.axes[0] < -0.55,
      right: gamepad.buttons[15]?.pressed || gamepad.axes[0] > 0.55,
      pause: gamepad.buttons[9]?.pressed, camera: gamepad.buttons[3]?.pressed, start: gamepad.buttons[0]?.pressed,
    };
    for (const direction of ['up', 'down', 'left', 'right']) if (pressed[direction] && !this.gamepadPrevious[direction] && this.state.is('Playing')) this.events.emit('direction', direction);
    if (pressed.pause && !this.gamepadPrevious.pause) this.events.emit('pause');
    if (pressed.camera && !this.gamepadPrevious.camera) this.events.emit('camera');
    if (pressed.start && !this.gamepadPrevious.start && (this.state.is('Menu') || this.state.is('GameOver'))) this.events.emit('start');
    this.boost('gamepad', Boolean(gamepad.buttons[0]?.pressed && this.state.is('Playing')));
    this.gamepadPrevious = pressed;
  }
  dispose() { this.abort.abort(); this.release(); }
}
