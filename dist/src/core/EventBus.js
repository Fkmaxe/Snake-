export class EventBus {
  #listeners = new Map();
  on(type, callback) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.#listeners.set(type, listeners);
    return () => listeners.delete(callback);
  }
  emit(type, payload) {
    this.#listeners.get(type)?.forEach((callback) => callback(payload));
  }
  dispose() { this.#listeners.clear(); }
}
