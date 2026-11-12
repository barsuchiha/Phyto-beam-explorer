// Presentation of existing incident-light results. No transport or PPF changes.
// The fixed log scale resolves weak side light without normalising each scene.
export const PPFD_MAP_MAX = 300;
export const ppfdMapStops = [
  [0, "#292038"],
  [1, "#43458d"],
  [5, "#2878ac"],
  [10, "#239795"],
  [30, "#62bc71"],
  [100, "#c8d955"],
  [300, "#fff0a6"],
];
export const ppfdMapPosition = (value) =>
  Math.log1p(Math.max(0, Math.min(PPFD_MAP_MAX, Number(value) || 0))) /
  Math.log1p(PPFD_MAP_MAX);
export function ppfdMapColor(value) {
  const x = ppfdMapPosition(value);
  const i = ppfdMapStops.findIndex(([v]) => ppfdMapPosition(v) >= x);
  if (i <= 0) return ppfdMapStops[0][1];
  const [a, ca] = ppfdMapStops[i - 1],
    [b, cb] = ppfdMapStops[i];
  const f =
    (x - ppfdMapPosition(a)) / (ppfdMapPosition(b) - ppfdMapPosition(a));
  const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const lo = rgb(ca),
    hi = rgb(cb);
  return (
    "#" +
    lo
      .map((v, k) =>
        Math.round(v + (hi[k] - v) * f)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function surfaceReadout(result) {
  let brightest = null;
  for (const leaf of result.leaves ?? [])
    for (const [side, data] of leaf.sides.entries()) {
      if (!brightest || data.mean > brightest.mean)
        brightest = { ...data, leaf: leaf.id, side };
    }
  return {
    meanRange: result.range,
    brightest,
    emitting: result.output.fluxes.some((f) => f > 0),
    captureRange: [
      Math.min(...result.metrics.map((m) => m.budget.target)),
      Math.max(...result.metrics.map((m) => m.budget.target)),
    ],
  };
}
export function percentText(fraction) {
  const p = fraction * 100;
  if (p > 0 && p < 0.01) return "<0,01%";
  return (
    p.toLocaleString("ru-RU", { maximumFractionDigits: p < 1 ? 2 : 1 }) + "%"
  );
}
