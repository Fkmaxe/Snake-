import { CONFIG } from '../config.js';

const MIDI_FREQUENCY = (note) => 440 * 2 ** ((note - 69) / 12);
const SEQUENCE = [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 7, 14, 19, 10];

/** All sound is synthesized locally. No media requests, samples, or audio files. */
export class AudioSynthesizer {
  constructor(settings) { this.settings = settings; this.voices = new Set(); this.running = false; this.step = 0; this.disposed = false; }
  async unlock() {
    if (this.disposed) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!this.context) {
      this.context = new AudioContextClass();
      this.master = this.context.createGain(); this.master.gain.value = this.settings.volume;
      this.compressor = this.context.createDynamicsCompressor(); this.compressor.threshold.value = -16; this.compressor.ratio.value = 5;
      this.master.connect(this.compressor); this.compressor.connect(this.context.destination);
      this.musicBus = this.context.createGain(); this.musicBus.gain.value = this.settings.music ? CONFIG.audio.music : 0; this.musicBus.connect(this.master);
      this.effectsBus = this.context.createGain(); this.effectsBus.gain.value = this.settings.effects ? CONFIG.audio.effects : 0; this.effectsBus.connect(this.master);
      this.delay = this.context.createDelay(1); this.delay.delayTime.value = 60 / CONFIG.audio.tempo * 0.75;
      this.feedback = this.context.createGain(); this.feedback.gain.value = 0.25;
      this.wet = this.context.createGain(); this.wet.gain.value = 0.23;
      this.delay.connect(this.feedback); this.feedback.connect(this.delay); this.delay.connect(this.wet); this.wet.connect(this.musicBus);
      this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
      this.nextNote = this.context.currentTime;
      this.timer = window.setInterval(() => this.schedule(), CONFIG.audio.pollMs);
    }
    if (this.context.state === 'suspended') await this.context.resume().catch(() => {});
  }
  updateSettings() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.volume, now, 0.04);
    this.musicBus.gain.setTargetAtTime(this.settings.music && this.running ? CONFIG.audio.music : 0, now, 0.12);
    this.effectsBus.gain.setTargetAtTime(this.settings.effects ? CONFIG.audio.effects : 0, now, 0.04);
  }
  setRunning(running) {
    this.running = running;
    if (this.context) { this.nextNote = this.context.currentTime + 0.04; this.updateSettings(); }
  }
  tone(frequency, start, duration, volume, type = 'sine', bus = this.effectsBus, glide = 1) {
    if (!this.context || this.voices.size >= CONFIG.audio.maxVoices) return;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * glide), start + duration);
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(volume, start + Math.min(0.018, duration * 0.1));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope); envelope.connect(bus);
    if (bus === this.musicBus) envelope.connect(this.delay);
    this.voices.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.voices.delete(oscillator); };
    oscillator.start(start); oscillator.stop(start + duration + 0.02);
  }
  noise(start, duration, volume, cutoff = 4000) {
    if (!this.context || this.voices.size >= CONFIG.audio.maxVoices) return;
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), envelope = this.context.createGain();
    source.buffer = this.noiseBuffer; filter.type = 'highpass'; filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(volume, start); envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(this.effectsBus); this.voices.add(source);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); this.voices.delete(source); };
    source.start(start); source.stop(start + duration);
  }
  schedule() {
    if (!this.context || this.context.state !== 'running') return;
    if (!this.running || !this.settings.music) { this.nextNote = this.context.currentTime; return; }
    if (this.nextNote < this.context.currentTime - CONFIG.audio.lookahead) this.nextNote = this.context.currentTime;
    while (this.nextNote < this.context.currentTime + CONFIG.audio.lookahead) {
      const beat = this.step % SEQUENCE.length;
      this.tone(MIDI_FREQUENCY(48 + SEQUENCE[beat]), this.nextNote, 0.34, 0.1, 'triangle', this.musicBus);
      if (beat % 4 === 0) {
        this.tone(MIDI_FREQUENCY(36 + (beat < 8 ? 0 : 5)), this.nextNote, 0.5, 0.22, 'sine', this.musicBus);
        this.tone(110, this.nextNote, 0.16, 0.18, 'sine', this.musicBus, 0.3);
      }
      this.step++; this.nextNote += 60 / CONFIG.audio.tempo / 4;
    }
  }
  effect(name, detail = {}) {
    if (!this.context || this.context.state !== 'running' || !this.settings.effects) return;
    const time = this.context.currentTime;
    if (name === 'food') {
      for (let index = 0; index < 3; index++) this.tone(MIDI_FREQUENCY(69 + index * 5 + Math.min(detail.combo ?? 1, 5)), time + index * 0.045, 0.23, 0.15, 'sine');
    } else if (name === 'death') {
      this.tone(150, time, 0.7, 0.35, 'sawtooth', this.effectsBus, 0.18); this.noise(time, 0.45, 0.22, 700);
    } else if (name === 'start') {
      [48, 55, 60, 67].forEach((note, index) => this.tone(MIDI_FREQUENCY(note), time + index * 0.09, 0.35, 0.15, 'triangle'));
    } else if (name === 'portal') this.tone(240, time, 0.35, 0.2, 'sine', this.effectsBus, 4);
    else if (name === 'mutator') { this.tone(330, time, 0.16, 0.08, 'triangle'); this.tone(440, time + 0.18, 0.16, 0.08, 'triangle'); }
    else if (name === 'ui') this.tone(680, time, 0.055, 0.04, 'sine');
  }
  async dispose() {
    this.disposed = true; clearInterval(this.timer);
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already stopped. */ } voice.disconnect(); }
    this.voices.clear();
    for (const node of [this.master, this.compressor, this.musicBus, this.effectsBus, this.delay, this.feedback, this.wet]) node?.disconnect();
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}
