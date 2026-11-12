import { photometry } from "./photometry.js";

// conditional scenarios, not measured module PPF or statistical error bars.
const modules = {
  mf193: {
    name: "MiniFermer 1.9.3",
    cct: 3500,
    lumens: [34, 35.75, 37.5],
    url: "https://minifermer.ru/product_2511.html",
  },
  mf194: {
    name: "MiniFermer 1.9.4",
    cct: 4000,
    lumens: [35, 36.75, 38.5],
    url: "https://minifermer.ru/product_2510.html",
  },
};
// Catalog flux ranges span the selected CRI80 VK/VL variants at 65mA, 25C.
// lm→PPF and heat factors are project assumptions, NOT digitized Samsung spectral/thermal data.
const ledCount = 320,
  photonFactors = [0.013, 0.015, 0.017],
  heatFactors = [0.85, 0.925, 1],
  angles = [110, 120, 130];
function output(id, count = 1, dim = 100) {
  const m = modules[id],
    base = m.lumens.map(
      (lm, i) => ledCount * lm * photonFactors[i] * heatFactors[i],
    );
  const fluxes = base.map((f) => (f * count * dim) / 100);
  return { base, full: base.map((f) => f * count), fluxes, flux: fluxes[1] };
}
function layout(count) {
  // Parallel boards, 40 mm clear gap. This is a design layout, not a vendor kit.
  return Array.from({ length: count }, (_, i) => ({
    x: 0,
    y: (i - (count - 1) / 2) * 0.22,
    w: 0.39,
    d: 0.18,
  }));
}
function summarize(groups, h, t, fluxes, density = 1) {
  const shapes = angles.map((angle) =>
    photometry.summarize(groups, h, t, angle, 1, density),
  );
  const scaled = (shape, flux) => ({
    mean: shape.mean * flux,
    center: shape.center * flux,
  });
  const scenarios = shapes.flatMap((shape, j) =>
    fluxes.map((flux, i) => ({
      ...scaled(shape, flux),
      angle: angles[j],
      flux,
      level: i,
    })),
  );
  const span = (key) => [
    Math.min(...scenarios.map((s) => s[key])),
    Math.max(...scenarios.map((s) => s[key])),
  ];
  const nominal = shapes[1],
    flux = fluxes[1];
  return {
    ...nominal,
    ...scaled(nominal, flux),
    samples: nominal.samples.map((s) => ({ ...s, value: s.value * flux })),
    range: { mean: span("mean"), center: span("center") },
    scenarios,
  };
}

export const estimateModel = {
  modules,
  ledCount,
  photonFactors,
  heatFactors,
  angles,
  output,
  layout,
  summarize,
};
