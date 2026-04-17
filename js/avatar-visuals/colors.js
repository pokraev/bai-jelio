/**
 * Convert [r, g, b] array to CSS rgb/rgba string.
 * @param {number[]} c - [r, g, b]
 * @param {number} [a] - optional alpha 0-1
 * @returns {string}
 */
export function rgb(c, a) {
  return a !== undefined
    ? `rgba(${c[0]},${c[1]},${c[2]},${a})`
    : `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Linearly interpolate between two [r,g,b] colors.
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} t - 0 to 1
 * @returns {number[]}
 */
export function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
