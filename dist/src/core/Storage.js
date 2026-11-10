import { CONFIG } from '../config.js';

export class Storage {
  constructor(backend) {
    if (backend === undefined) { try { backend = globalThis.localStorage; } catch { backend = null; } }
    this.backend = backend;
    this.data = { version: CONFIG.storage.version, records: {}, settings: { volume: CONFIG.audio.master, music: true, effects: true, quality: 'high', reducedMotion: false, camera: 'isometric' }, runs: 0 };
    try {
      const saved = JSON.parse(backend?.getItem(CONFIG.storage.key) ?? 'null');
      if (saved?.version === CONFIG.storage.version) {
        for (const mode of Object.keys(CONFIG.modes)) {
          const record = saved.records?.[mode];
          if (Number.isFinite(record) && record >= 0) this.data.records[mode] = record;
        }
        for (const key of ['music', 'effects', 'reducedMotion']) {
          if (typeof saved.settings?.[key] === 'boolean') this.data.settings[key] = saved.settings[key];
        }
        if (Number.isFinite(saved.settings?.volume)) this.data.settings.volume = Math.min(1, Math.max(0, saved.settings.volume));
        if (['high', 'balanced'].includes(saved.settings?.quality)) this.data.settings.quality = saved.settings.quality;
        if (CONFIG.cameras.some((camera) => camera.id === saved.settings?.camera)) this.data.settings.camera = saved.settings.camera;
        if (Number.isInteger(saved.runs) && saved.runs >= 0) this.data.runs = saved.runs;
      }
    } catch { /* Storage can be disabled in private contexts; the session remains playable. */ }
  }
  best(mode) { return this.data.records[mode] ?? 0; }
  record(mode, score) {
    const previous = this.best(mode);
    this.data.records[mode] = Math.max(previous, score);
    this.data.runs += 1;
    this.save();
    return score > previous;
  }
  settings(patch) { Object.assign(this.data.settings, patch); this.save(); }
  save() { try { this.backend?.setItem(CONFIG.storage.key, JSON.stringify(this.data)); } catch { /* In-memory persistence is the fallback. */ } }
}
