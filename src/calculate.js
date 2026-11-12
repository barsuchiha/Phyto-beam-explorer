import { profiles } from "./data/profiles.js";
import { hardware } from "./models/hardware.js";
import { photometry } from "./models/photometry.js";
import { plantModel } from "./models/plants.js";
import { estimateModel } from "./models/minifermer.js";
import { mini36Model } from "./models/mini36.js";
import { layout } from "./models/layout.js";
import { eraModel } from "./models/era.js";

// A calculator instance keeps only the last optical result. Plant and duration
// changes reuse that result, while updating the DLI assessment immediately.
export function createCalculator() {
  let metricKey = "",
    metrics;
  return function calculate(state) {
    const p = profiles[state.source];
    const catalog = p.kind === "catalog",
      estimated = p.kind === "estimate";
    const mini36 = state.source === "mf36";
    const era = p.kind === "era",
      eraData = era ? eraModel.modules[state.source] : null;
    const ranged = estimated || (era && !eraData.ies);
    const engine = mini36 ? mini36Model : estimateModel;
    const dim = p.fixed ? 100 : state.dim;
    const op = catalog ? hardware.operate(state) : null;
    const estimate = estimated
      ? engine.output(state.source, state.count, dim)
      : null;
    const angle = era
      ? eraModel.angle(state.source)
      : catalog
        ? photometry.nativeAngle
        : estimated
          ? 120
          : state.angle;
    const base = catalog ? hardware.point(state.source, state.current) : null;
    const scene = {
      p,
      catalog,
      estimated,
      mini36,
      era,
      eraData,
      ranged,
      dim,
      op,
      estimate,
      angle,
      base,
    };
    if (catalog && !op.ok) return scene;

    const h = state.height / 100,
      b = (angle * Math.PI) / 360,
      t = (state.tilt * Math.PI) / 180;
    const g = layout(state);
    const flux = era
      ? eraData.ppf * state.count
      : estimated
        ? estimate.flux
        : catalog
          ? op.flux
          : (state.ppf * dim) / 100;
    if (catalog)
      g.forEach(
        (a, i) => (a.weight = flux > 0 ? op.fluxes[i] / flux : 1 / g.length),
      );
    const curve = catalog ? "lm301b" : angle;
    const key = JSON.stringify([
      state.source,
      state.height,
      curve,
      state.tilt,
      flux,
      g,
    ]);
    if (key !== metricKey) {
      metrics = era
        ? eraModel.summarize(state.source, g, h, t, flux)
        : estimated
          ? engine.summarize(g, h, t, estimate.fluxes)
          : photometry.summarize(g, h, t, curve, flux);
      metricKey = key;
    }
    const selected = plantModel.plants[state.plant],
      target = plantModel.groups[selected.group];
    const daily = plantModel.dli(metrics.mean, state.hours);
    const meanClass = plantModel.classify(daily, selected.group);
    const assessment = plantModel.evaluate(
      metrics.samples.map((s) => s.value),
      state.hours,
      selected.group,
    );
    const dailyRange = ranged
      ? metrics.range.mean.map((v) => plantModel.dli(v, state.hours))
      : null;
    return {
      ...scene,
      h,
      b,
      t,
      g,
      flux,
      metrics,
      selected,
      target,
      daily,
      meanClass,
      assessment,
      dailyRange,
    };
  };
}
