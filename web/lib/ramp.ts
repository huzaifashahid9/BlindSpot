// Perceptually uniform, colour-blind safe sequential ramp (after matplotlib "inferno").
const INFERNO = [
  [20, 11, 52],
  [87, 16, 110],
  [151, 38, 103],
  [208, 70, 72],
  [244, 132, 26],
  [252, 200, 46],
  [252, 255, 164],
];

/** t in [0,1] -> rgb string. */
export function inferno(t: number) {
  const x = Math.max(0, Math.min(1, t)) * (INFERNO.length - 1);
  const i = Math.min(INFERNO.length - 2, Math.floor(x));
  const f = x - i;
  const c = INFERNO[i].map((a, k) => Math.round(a + (INFERNO[i + 1][k] - a) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export const EMPTY = "#111827";

/** Value -> colour on a square-root scale (fire counts are very skewed). */
export function heat(v: number, max: number) {
  if (!(v > 0)) return EMPTY;
  return inferno(0.12 + 0.88 * Math.sqrt(v / Math.max(1e-9, max)));
}

/** Text colour that stays readable on a heat cell. */
export function inkOn(v: number, max: number) {
  return v > 0 && Math.sqrt(v / Math.max(1e-9, max)) > 0.55 ? "#111827" : "#e5e7eb";
}
