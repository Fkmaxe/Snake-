import { CONFIG } from '../config.js';

const $ = (selector) => document.querySelector(selector);
const scoreText = (value) => String(value).padStart(4, '0');
const durationText = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const DEATH_MESSAGES = Object.freeze({ wall: 'La frontière a eu le dernier mot.', self: 'Votre trace vous a rattrapé.', obstacle: 'L’arène a changé. Revenez plus fort.', complete: 'Chaque case est à vous. Protocole accompli.' });

export class UserInterface {
  constructor(events, state, session, storage) {
    this.events = events; this.state = state; this.session = session; this.storage = storage;
    this.abort = new AbortController(); this.lastValues = new Map(); this.previousVolume = CONFIG.audio.master; this.lastCountdown = '';
    this.elements = {};
    this.miniMap = $('#mini-map canvas').getContext('2d');
    for (const id of ['score', 'foods', 'elapsed', 'combo', 'energy-value', 'energy-fill', 'countdown', 'live-info', 'fps', 'toast', 'score-popup']) this.elements[id] = document.getElementById(id);
    const options = { signal: this.abort.signal };
    document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
      events.emit('unlockaudio'); const action = button.dataset.action;
      if (action === 'settings' || action === 'help') this.openDialog(action);
      else if (action === 'sound') events.emit('mute');
      else if (action === 'fullscreen') this.fullscreen();
      else events.emit(action);
      events.emit('uisound');
    }, options));
    document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => events.emit('mode', button.dataset.mode), options));
    document.querySelectorAll('[data-camera]').forEach((button) => button.addEventListener('click', () => events.emit('camera', button.dataset.camera), options));
    document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close(), options));
    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        const bounds = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
      }, options);
    });
    for (const key of ['volume', 'music', 'effects', 'quality', 'reducedMotion']) {
      const input = document.getElementById(key);
      input.addEventListener(key === 'volume' ? 'input' : 'change', () => {
        const value = key === 'volume' ? Number(input.value) / 100 : input.type === 'checkbox' ? input.checked : input.value;
        storage.settings({ [key]: value }); this.syncSettings(); events.emit('settings', { key, value });
      }, options);
    }
    this.unsubscribers = [
      events.on('state', () => this.syncState()),
      events.on('food', (event) => {
        const popup = this.elements['score-popup']; popup.textContent = `+${event.points}`; popup.classList.remove('pop');
        // A forced style flush restarts the one-shot reward animation without a timer.
        void popup.offsetWidth; popup.classList.add('pop'); this.update();
      }),
      events.on('mutator', ({ text }) => this.toast(text)),
      events.on('death', ({ reason }) => { this.deathReason = reason; }),
    ];
    this.syncSettings(); this.syncMode(); this.syncCamera(storage.data.settings.camera);
  }
  text(id, value) {
    if (this.lastValues.get(id) === value) return;
    this.lastValues.set(id, value); (this.elements[id] ?? document.getElementById(id)).textContent = value;
  }
  syncState() {
    const state = this.state.current;
    document.body.dataset.state = state;
    const menu = state === 'Menu' || state === 'Boot';
    $('#menu-content').hidden = !menu; $('#session-content').hidden = menu;
    $('#arena-caption').hidden = !menu;
    $('#state-overlay').hidden = state !== 'Paused' && state !== 'GameOver';
    $('#arena-status').textContent = menu ? 'DÉMO EN TEMPS RÉEL' : state === 'Paused' ? 'SIGNAL EN PAUSE' : state === 'GameOver' ? 'SESSION TERMINÉE' : 'CONNEXION ACTIVE';
    if (state === 'Paused' || state === 'GameOver') {
      const over = state === 'GameOver';
      $('#overlay-eyebrow').textContent = over ? this.session.won ? 'PROTOCOLE ACCOMPLI' : 'SIGNAL PERDU' : 'SIGNAL SUSPENDU';
      $('#overlay-title').textContent = over ? this.session.won ? 'Arène maîtrisée.' : 'Encore une fois.' : 'On reprend ?';
      $('#overlay-message').textContent = over ? DEATH_MESSAGES[this.deathReason] ?? 'Une nouvelle trajectoire vous attend.' : 'Votre progression est conservée. Prenez votre temps.';
      $('#result-stats').hidden = !over; $('#new-record').hidden = !over || !this.session.newRecord;
      $('#final-score').textContent = scoreText(this.session.score); $('#final-best').textContent = scoreText(this.storage.best(this.session.mode));
      const button = $('#overlay-primary'); button.dataset.action = over ? 'start' : 'resume';
      button.innerHTML = `${over ? 'Rejouer' : 'Reprendre'} <svg><use href="#i-arrow"/></svg>`;
      button.focus({ preventScroll: true });
    }
    if (state === 'Playing') $('#game-canvas').focus({ preventScroll: true });
    if (state === 'Menu') {
      this.elements.toast.hidden = true; this.elements['score-popup'].classList.remove('pop');
      this.syncMode();
    }
    this.syncCamera(this.storage.data.settings.camera);
    this.update();
  }
  syncMode() {
    const mode = CONFIG.modes[this.session.mode];
    document.querySelectorAll('[data-mode]').forEach((button) => {
      const selected = button.dataset.mode === this.session.mode; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
    $('#menu-best').textContent = scoreText(this.storage.best(this.session.mode));
    $('#session-best').textContent = scoreText(this.storage.best(this.session.mode));
    $('#session-mode').textContent = mode.name; $('#session-code').textContent = mode.code;
    $('#session-description').textContent = mode.description;
  }
  syncCamera(camera) {
    $('#mini-map').hidden = camera !== 'chase' || this.state.is('Menu') || this.state.is('Boot');
    document.querySelectorAll('[data-camera]').forEach((button) => { const active = button.dataset.camera === camera; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    $('#direction-hint').textContent = camera === 'chase' ? '← → TOURNER' : 'SE DIRIGER';
  }
  syncSettings() {
    const settings = this.storage.data.settings;
    for (const key of ['music', 'effects', 'reducedMotion']) document.getElementById(key).checked = settings[key];
    $('#volume').value = String(Math.round(settings.volume * 100)); $('#volume-output').value = `${Math.round(settings.volume * 100)}%`;
    $('#quality').value = settings.quality;
    const muteButton = $('[data-action=sound]'); muteButton.setAttribute('aria-pressed', String(settings.volume === 0));
    muteButton.setAttribute('aria-label', settings.volume === 0 ? 'Activer le son' : 'Couper le son');
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
  }
  toggleMute() {
    const volume = this.storage.data.settings.volume;
    if (volume > 0) this.previousVolume = volume;
    this.storage.settings({ volume: volume > 0 ? 0 : this.previousVolume }); this.syncSettings();
  }
  openDialog(type) {
    if (this.state.is('Playing')) this.events.emit('pause');
    document.getElementById(`${type}-dialog`).showModal();
  }
  async fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('.arena').requestFullscreen) await $('.arena').requestFullscreen();
      else this.toast('PLEIN ÉCRAN NON DISPONIBLE SUR CE NAVIGATEUR');
    } catch { this.toast('LE NAVIGATEUR A REFUSÉ LE PLEIN ÉCRAN'); }
  }
  toast(message) {
    this.elements.toast.textContent = message; this.elements.toast.hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { this.elements.toast.hidden = true; }, CONFIG.ui.toastDuration);
  }
  update() {
    const session = this.session;
    this.text('score', scoreText(session.score)); this.text('foods', String(session.foods).padStart(2, '0')); this.text('elapsed', durationText(session.elapsed));
    this.text('combo', `MULTIPLICATEUR ×${session.combo}${session.boosting ? ' · BOOST ×2' : ''}`);
    const energy = Math.round(session.energy * 100); this.text('energy-value', `${energy}%`);
    this.elements['energy-fill'].style.transform = `scaleX(${session.energy})`;
    this.elements['energy-fill'].style.background = energy < 20 ? '#ffc278' : '#81ffd1';
    this.text('live-info', session.fluxActive ? 'SURCHARGE TEMPORELLE' : session.boosting ? 'BOOST ACTIF' : session.warnings.length ? 'OBSTACLES EN APPROCHE' : 'PROTOCOLE STABLE');
    const counting = this.state.is('Playing') && session.countdown > 0;
    this.elements.countdown.hidden = !counting;
    const count = String(Math.ceil(session.countdown / (CONFIG.gameplay.countdown / 3)));
    if (counting && this.lastCountdown !== count) { this.elements.countdown.querySelector('strong').textContent = count; this.lastCountdown = count; }
    if (!$('#mini-map').hidden) this.drawMiniMap();
  }
  drawMiniMap() {
    const ctx = this.miniMap, size = CONFIG.ui.miniMapSize, cell = size / CONFIG.board.size;
    ctx.clearRect(0, 0, size, size); ctx.fillStyle = '#0b1712'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#243d2e'; ctx.lineWidth = 0.5;
    for (let index = 0; index <= CONFIG.board.size; index += 4) {
      ctx.beginPath(); ctx.moveTo(index * cell, 0); ctx.lineTo(index * cell, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, index * cell); ctx.lineTo(size, index * cell); ctx.stroke();
    }
    const draw = (position, color, inset = 0.4) => { ctx.fillStyle = color; ctx.fillRect(position.x * cell + inset, position.z * cell + inset, cell - inset * 2, cell - inset * 2); };
    this.session.obstacles.forEach((position) => draw(position, '#ff5664'));
    this.session.warnings.forEach((position) => draw(position, '#873c49'));
    this.session.portals.forEach((position) => draw(position, '#b9a0ff', 0));
    this.session.snake.body.forEach((position, index) => draw(position, index ? '#4eaa87' : '#dcffee'));
    if (this.session.food) draw(this.session.food, '#ffca80', 0);
  }
  dispose() { this.abort.abort(); clearTimeout(this.toastTimer); this.unsubscribers.forEach((unsubscribe) => unsubscribe()); }
}
