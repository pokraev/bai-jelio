/**
 * Create and manage a requestAnimationFrame loop.
 *
 * @param {(dt: number, time: number) => void} onFrame - called each frame with delta seconds and timestamp
 * @returns {{ start: () => void, stop: () => void, isRunning: () => boolean }}
 */
export function createAnimationLoop(onFrame) {
  let rafId = null;
  let lastTime = 0;

  function tick(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    onFrame(dt, time);
    rafId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (rafId !== null) return;
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    isRunning() {
      return rafId !== null;
    },
  };
}
