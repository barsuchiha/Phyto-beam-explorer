import { cobSources, sourceSpecs, coolingScenarios } from "../data/source-specs.js";
import { hardware } from "./hardware.js";
import { mini36Model } from "./mini36.js";
import { estimateModel } from "./minifermer.js";
import { eraModules } from "../data/era.js";
import { bulbModel } from "./minifermer-bulbs.js";

export function sourcePoint(id, current = 350) {
  const spec = sourceSpecs[id];
  if (!spec) throw new RangeError(`Unknown source: ${id}`);
  let watts = spec.watts, fluxes;
  if (hardware.modules[id]) {
    const point = hardware.point(id, current);
    if (!point) throw new RangeError(`No source data at ${current} mA`);
    watts = current * point.voltage / 1000;
    fluxes = [point.ppf, point.ppf, point.ppf];
  } else if (cobSources[id]) fluxes = cobSources[id].ppfLevels;
  else if (id === "mf36") fluxes = mini36Model.output(id, 1, 100).fluxes;
  else if (estimateModel.modules[id]) fluxes = estimateModel.output(id).fluxes;
  else if (bulbModel.modules[id]) fluxes = bulbModel.output(id, 1).fluxes;
  else fluxes = Array(3).fill(eraModules[id].ppf);
  return { ...spec, watts, fluxes, ppf: fluxes[1], ready: spec.kind === "fixture" };
}

// Steady-state scenario, not a temperature prediction for the CAD enclosure.
// absorbedFraction is the fraction of emitted PAR absorbed by the fixture.
// null means the optical calculation is pending or unavailable.
export function sourceBudget(state, count, absorbedFraction = null) {
  const point = sourcePoint(state.source, state.sourceCurrent ?? 350);
  const factor = state.enabled === false ? 0 : point.ready ? 1 : state.dim / 100;
  const efficiency = point.ready ? 1 : (state.driverEfficiency ?? 90) / 100;
  const tariff = state.tariff ?? 8.9;
  const inputW = point.watts * count * factor;
  const wallW = inputW / efficiency;
  const sourcePPF = point.ppf * count * factor;
  const fluxes = point.fluxes.map((v) => v * count * factor);
  const dayKWh = wallW / 1000 * state.hours;
  const monthKWh = dayKWh * 30;
  const monthRubRange = (point.powerLevels ?? [point.watts, point.watts, point.watts])
    .filter((_, i) => i !== 1)
    .map((w) => w * count * factor / efficiency / 1000 * state.hours * 30 * tariff);
  const cooling = coolingScenarios[state.cooling ?? "shared-05"];
  const ambient = state.ambient ?? 25;
  const absorbed = absorbedFraction == null ? null : Math.max(0, Math.min(1, absorbedFraction));
  const thermalAvailable = !point.ready && (factor === 0 || absorbed !== null);
  const heatFor = (flux) => Math.max(0, inputW - flux * 0.22 * (1 - (absorbed ?? 0)));
  const fixtureHeatW = thermalAvailable ? heatFor(sourcePPF) : null;
  const temperatureFor = (heat) => ambient + heat * cooling.resistance / (cooling.separate ? count : 1);
  const sinkC = thermalAvailable ? temperatureFor(fixtureHeatW) : null;
  const sinkRange = thermalAvailable ? fluxes.map((f) => temperatureFor(heatFor(f))).sort((a, b) => a - b).filter((_, i, all) => i === 0 || i === all.length - 1) : null;
  return {
    point, count, inputW, wallW, sourcePPF, fluxes, fixtureHeatW,
    dayKWh, monthKWh, dayRub: dayKWh * tariff, monthRub: monthKWh * tariff,
    monthRubRange, sinkC, sinkRange, absorbedFraction: absorbed,
  };
}
