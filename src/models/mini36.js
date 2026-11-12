import { photometry } from "./photometry.js";

// Seoul is a substitute hypothesis, NOT a confirmed MiniFermer BOM.
const whiteCount = 24,
  whiteReferencePPF = 1.78,
  whiteCurrent = 150,
  redCurrent = 600;
const url = "https://minifermer.ru/product_3950.html";
const seoulURL =
  "https://www.neumueller.com/datenblatt/seoulsemiconductor/STD_Datasheet_STWSC12S-E1H10000_231025_R1_2.pdf";
const osramURL =
  "https://look.ams-osram.com/m/1c76048636e1819b/original/GH-CSSRM3-24.pdf";
// Approximate readings from Seoul E1 rev1.2 pp6,8 and Osram rev1.7 pp9,10.
// Current-factor brackets are chosen rounding sensitivity, not manufacturer tolerances.
// Transfer luminous/radiant relative factors to PPF assuming invariant spectral shape.
const scenarios = [
  {
    name: "нижний",
    tj: 85,
    whiteI: 0.5,
    whiteT: 0.87,
    redReference: 5.05,
    redI: 0.85,
    redT: 0.94,
  },
  {
    name: "базовый",
    tj: 55,
    whiteI: 0.51,
    whiteT: 0.94,
    redReference: 5.42,
    redI: 0.86,
    redT: 0.98,
  },
  {
    name: "верхний",
    tj: 25,
    whiteI: 0.52,
    whiteT: 1,
    redReference: 5.65,
    redI: 0.87,
    redT: 1,
  },
];
const components = scenarios.map((s) => ({
  white: whiteCount * whiteReferencePPF * s.whiteI * s.whiteT,
  red: s.redReference * s.redI * s.redT,
}));
// Approximate LED centres from the vendor's board illustration, in metres.
const whitePoints = [-0.045, -0.022, 0.022, 0.045].flatMap((y) =>
  [-0.05, -0.03, -0.01, 0.01, 0.03, 0.05].map((x) => [x, y]),
);
function output(_id = "mf36", count = 1, dim = 100) {
  const base = components.map((c) => c.white + c.red),
    full = base.map((f) => f * count),
    fluxes = full.map((f) => (f * dim) / 100);
  return { base, full, fluxes, flux: fluxes[1], components };
}
function layout(count) {
  return Array.from({ length: count }, (_, i) => ({
    x: 0,
    y: (i - (count - 1) / 2) * 0.16,
    w: 0.12,
    d: 0.12,
  }));
}
function weightedGroups(groups, level) {
  const c = components[level],
    total = c.white + c.red;
  return groups.map((g) => ({
    ...g,
    points: [
      ...whitePoints.map(([x, y]) => [x, y, c.white / whiteCount / total]),
      [0, 0, c.red / total],
    ],
  }));
}
function summarize(groups, h, t, fluxes, density = 1) {
  const results = fluxes.map((flux, i) =>
    photometry.summarize(weightedGroups(groups, i), h, t, 120, flux, density),
  );
  const span = (key) => [
    Math.min(...results.map((s) => s[key])),
    Math.max(...results.map((s) => s[key])),
  ];
  return {
    ...results[1],
    range: { mean: span("mean"), center: span("center") },
    scenarios: results,
  };
}
const measurements = [
  { height: 20, ppfd: 244 },
  { height: 30, ppfd: 120 },
  { height: 40, ppfd: 75 },
  { height: 50, ppfd: 50 },
];
let reference = null;
function comparison() {
  // Fixed reference: one board at 100%, no tilt/optics/reflections. Never fit to measurements.
  if (!reference)
    reference = measurements.map((m) => {
      const result = summarize(layout(1), m.height / 100, 0, output().fluxes);
      return {
        ...m,
        calculated: result.center,
        range: result.range.center,
        delta: 100 * (result.center / m.ppfd - 1),
        equivalentPPF: (output().flux * m.ppfd) / result.center,
      };
    });
  return reference;
}

export const mini36Model = {
  whiteCount,
  whiteReferencePPF,
  whiteCurrent,
  redCurrent,
  scenarios,
  components,
  whitePoints,
  url,
  seoulURL,
  osramURL,
  output,
  layout,
  weightedGroups,
  summarize,
  measurements,
  comparison,
};
