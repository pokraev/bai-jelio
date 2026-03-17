// ──────────────────────────────────────────────────────
// events.js — Simple pub/sub event bus
// ──────────────────────────────────────────────────────
// Usage:
//   import bus from './events.js';
//   bus.on('mic:muted', (data) => { ... });
//   bus.emit('mic:muted', { muted: true });
//   bus.off('mic:muted', handler);
// ──────────────────────────────────────────────────────

const bus = {
  /** @type {Object<string, Function[]>} */
  _listeners: {},

  /**
   * Subscribe to an event.
   * @param {string} event — event name (e.g. 'mic:started')
   * @param {Function} fn  — callback receiving (data)
   */
  on(event, fn) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(fn);
  },

  /**
   * Unsubscribe a specific handler from an event.
   * @param {string} event
   * @param {Function} fn — the exact reference passed to on()
   */
  off(event, fn) {
    const list = this._listeners[event];
    if (!list) return;
    this._listeners[event] = list.filter(f => f !== fn);
  },

  /**
   * Emit an event, calling all registered handlers with data.
   * @param {string} event
   * @param {*} data — arbitrary payload
   */
  emit(event, data) {
    const list = this._listeners[event];
    if (!list) return;
    for (const fn of list) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[bus] Error in handler for "${event}":`, err);
      }
    }
  },
};

export default bus;
