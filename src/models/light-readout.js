// Presentation of existing incident-light results. No transport or PPF changes.
// The fixed log scale resolves weak side light without normalising each scene.
import { plantModel } from "./plants.js";
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
// Both legends and surface colours use these fixed scales. DLI is the lamp's
// daily contribution, with a 0.1 mol softening scale so zero remains defined.
export const lightMapScales = {
  ppfd: {
    label: "PPFD",
    max: PPFD_MAP_MAX,
    units: "мкмоль/(м²·с)",
    stops: ppfdMapStops,
    position: ppfdMapPosition,
    color: ppfdMapColor,
  },
  dli: {
    label: "DLI",
    max: 30,
    units: "моль/(м²·сутки)",
    stops: ppfdMapStops.map(([v, color]) => [v / 10, color]),
    position: (value) => ppfdMapPosition(value * 10),
    color: (value) => ppfdMapColor(value * 10),
  },
};
export function continuousLightColor(ppfd, metric, hours) {
  return metric === "dli"
    ? lightMapScales.dli.color(plantModel.dli(ppfd, hours))
    : lightMapScales.ppfd.color(ppfd);
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
// The selected map controls the displayed quantity, not just the colours.
// Readouts stay linear physical values; only the colour scale is logarithmic.
export function surfaceMetricCards(result, { colorMetric, hours }) {
  const daily = colorMetric === "dli" || colorMetric === "dli-guide";
  const { label, units } = lightMapScales[daily ? "dli" : "ppfd"];
  const readout = surfaceReadout(result),
    best = readout.brightest;
  const leafMode = result.receiver === "leaves";
  const rangeText = (values, asDaily = daily) => {
    const formatted = values.map((value) =>
      (asDaily ? plantModel.dli(value, hours) : value).toLocaleString("ru-RU", {
        maximumFractionDigits: asDaily ? 2 : 1,
      }),
    );
    return formatted[0] === formatted[1] ? formatted[0] : formatted.join("–");
  };
  const unitNote = units + (daily ? ` · ${hours} ч/день` : "");
  const captured = !readout.emitting
    ? "—"
    : Math.abs(readout.captureRange[1] - readout.captureRange[0]) > 0.0005
      ? readout.captureRange.map(percentText).join("–")
      : percentText(result.metrics[result.middle].budget.target);
  return [
    [
      `${label} · среднее по ${leafMode ? "листьям" : "оболочке"}`,
      rangeText(readout.meanRange),
      `${leafMode ? "обе стороны" : "вся оболочка"} · ${unitNote}`,
    ],
    leafMode
      ? [
          `${label} · самая освещённая сторона`,
          rangeText(best.range),
          `лист ${best.leaf + 1}, сторона ${best.side === 0 ? "A" : "B"} · ${unitNote}`,
        ]
      : daily
        ? ["Досветка в день", String(hours), "ч · вклад лампы"]
        : [
            `DLI от лампы · ${hours} ч`,
            rangeText(readout.meanRange, true),
            `${lightMapScales.dli.units} · вся оболочка`,
          ],
    [
      leafMode ? "На листья" : "На крону",
      captured,
      readout.emitting ? "доля исходного PPF" : "лампа выключена",
    ],
  ];
}
export function percentText(fraction) {
  const p = fraction * 100;
  if (p > 0 && p < 0.01) return "<0,01%";
  return (
    p.toLocaleString("ru-RU", { maximumFractionDigits: p < 1 ? 2 : 1 }) + "%"
  );
}
