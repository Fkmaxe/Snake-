const TRANSITIONS = Object.freeze({
  Boot: ['Menu'], Menu: ['Playing'], Playing: ['Paused', 'GameOver', 'Menu'],
  Paused: ['Playing', 'Menu'], GameOver: ['Playing', 'Menu'],
});

export class GameStateManager {
  #state = 'Boot';
  constructor(events) { this.events = events; }
  get current() { return this.#state; }
  is(state) { return this.#state === state; }
  transition(next) {
    if (next === this.#state) return false;
    if (!TRANSITIONS[this.#state]?.includes(next)) throw new Error(`Transition interdite : ${this.#state} → ${next}`);
    const previous = this.#state;
    this.#state = next;
    this.events.emit('state', { previous, current: next });
    return true;
  }
}
