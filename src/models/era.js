import { eraModules } from "../data/era.js";
import { greenLineIES } from "../data/era-ies.js";
import { createIESCurve } from "./ies.js";
import { photometry } from "./photometry.js";

const curve = createIESCurve(greenLineIES);
const assumedAngles = [110, 120, 130];
function layout(id, count) {
  const m = eraModules[id];
  return Array.from({ length: count }, (_, i) => ({
    x: m.ies || count === 1 ? 0 : i % 2 === 0 ? -0.18 : 0.18,
    y: m.ies
      ? (i - (count - 1) / 2) * 0.16
      : count === 4
        ? i < 2
          ? -0.18
          : 0.18
        : 0,
    w: m.w,
    d: m.d,
    disc: !!m.disc,
  }));
}
function summarize(id, groups, h, t, flux, density = 1) {
  if (eraModules[id].ies) {
    // Far-field IES applied to distributed emitter patches is an explicit
    // near-field assumption. The whole-fixture point model is a sensitivity check.
    const result = photometry.summarize(groups, h, t, curve, flux, density);
    const points = groups.map((g) => ({ ...g, points: [[0, 0, 1]] }));
    return {
      ...result,
      pointAlternative: photometry.summarize(
        points,
        h,
        t,
        curve,
        flux,
        density,
      ),
    };
  }
  const scenarios = assumedAngles.map((angle) =>
    photometry.summarize(groups, h, t, angle, flux, density),
  );
  const span = (key) => [
    Math.min(...scenarios.map((s) => s[key])),
    Math.max(...scenarios.map((s) => s[key])),
  ];
  return {
    ...scenarios[1],
    scenarios,
    range: { mean: span("mean"), center: span("center") },
  };
}
export const eraModel = {
  modules: eraModules,
  curve,
  assumedAngles,
  layout,
  summarize,
  angle: (id) =>
    eraModules[id].ies ? (curve.fwhm[0] + curve.fwhm[1]) / 2 : 120,
};
