import { plantModel } from "./plants.js";
import { windowDose, windowSettings } from "./window-light.js";

// Add both sources on the SAME physical face before choosing the brighter face.
// Never add the brightest lamp face to a different brightest daylight face.
export function dailyFaceLight(result, state, leaf, side) {
  const lamp = leaf.sides[side];
  const daylight = result.windowLight?.leaves.find((l) => l.id === leaf.id)
    ?.sides[side];
  const window = windowDose(daylight, state);
  const factors = windowSettings(state).factors;
  const value = plantModel.dli(lamp.mean, state.hours);
  return {
    lamp: value,
    window,
    value: value + window,
    range: [
      plantModel.dli(lamp.range[0], state.hours) + window * factors[0],
      plantModel.dli(lamp.range[1], state.hours) + window * factors.at(-1),
    ],
    sparse: result.output.fluxes.some((f) => f > 0) && lamp.hits < 100,
  };
}
function brighterFace(result, state, leaf) {
  return dailyFaceLight(result, state, leaf, 1).value >
    dailyFaceLight(result, state, leaf, 0).value
    ? 1
    : 0;
}

// A local comparison for one whole leaf face, never a whole-plant health score.
// Use one physical face across scenarios; don't choose a new winner per scenario.
export function dailyLeafLight(result, state, selectedLeaf = -1) {
  if (result.receiver !== "leaves" || !result.leaves?.length) return null;
  const leaf =
    result.leaves.find((l) => l.id === selectedLeaf) ??
    result.leaves.reduce((best, leaf) =>
      dailyFaceLight(result, state, leaf, brighterFace(result, state, leaf))
        .value >
      dailyFaceLight(result, state, best, brighterFace(result, state, best))
        .value
        ? leaf
        : best,
    );
  const side = brighterFace(result, state, leaf);
  const data = dailyFaceLight(result, state, leaf, side);
  const { range, value } = data;
  const emitting =
    result.output.fluxes.some((f) => f > 0) ||
    result.windowLight?.leaves.some((l) =>
      l.sides.some((s) => windowDose(s, state) > 0),
    );
  const { L, U } = plantModel.groups[plantModel.plants[state.plant].group];
  const kind = !emitting
    ? "off"
    : range[1] < L
      ? "low"
      : range[0] > U
        ? "high"
        : range[0] >= L && range[1] <= U
          ? "enough"
          : "uncertain";
  return {
    leaf: leaf.id,
    side,
    range,
    value,
    lower: L,
    upper: U,
    kind,
    fill: Math.max(0, Math.min(1, value / L)),
    ratioRange: range.map((v) => v / L),
    lamp: data.lamp,
    window: data.window,
    sparse: data.sparse,
  };
}

export function dailyPercent(ratio) {
  if (ratio > 0 && ratio < 0.01) return "<1%";
  // Don't display 100% before the lower reference is reached.
  return (
    (ratio < 1
      ? Math.min(99, Math.round(ratio * 100))
      : Math.round(ratio * 100)
    ).toLocaleString("ru-RU") + "%"
  );
}

// Design indicator, not a prediction of whole-plant growth. Weight by one-sided
// leaf area and cap each face at the lower reference BEFORE averaging, so excess
// on a bright leaf cannot pay for a shaded leaf. Preserve correlated scenarios.
export function dailyPlantLight(result, state) {
  if (result.receiver !== "leaves" || !result.leaves?.length) return null;
  const leaves = result.leaves
    .filter((leaf) => leaf.area > 0)
    .map((leaf) => {
      const side = brighterFace(result, state, leaf);
      return {
        area: leaf.area,
        side: leaf.sides[side],
        dose: dailyFaceLight(result, state, leaf, side),
      };
    });
  const area = leaves.reduce((sum, leaf) => sum + leaf.area, 0);
  if (!area) return null;
  const { L, U } = plantModel.groups[plantModel.plants[state.plant].group];
  const snap = (n) => (n > 1 - 1e-12 ? 1 : n < 1e-12 ? 0 : n);
  const factors = windowSettings(state).factors;
  const scenarios = result.output.fluxes.flatMap((_, k) =>
    factors.map((factor) => {
      let completion = 0,
        below = 0,
        above = 0,
        mean = 0;
      for (const leaf of leaves) {
        const dose =
          plantModel.dli(leaf.side.values[k], state.hours) +
          leaf.dose.window * factor;
        const weight = leaf.area / area;
        mean += weight * dose;
        completion += weight * Math.max(0, Math.min(1, dose / L));
        if (dose < L - 1e-9) below += weight;
        else if (dose > U + 1e-9) above += weight;
      }
      below = snap(below);
      above = snap(above);
      const kind =
        below === 1
          ? "low"
          : below > 0
            ? above > 0
              ? "mixed"
              : "partial"
            : above > 0
              ? "high"
              : "enough";
      return {
        completion: snap(completion),
        reached: snap(1 - below),
        below,
        above,
        mean,
        kind,
      };
    }),
  );
  const range = (key) => [
    Math.min(...scenarios.map((s) => s[key])),
    Math.max(...scenarios.map((s) => s[key])),
  ];
  const emitting =
    result.output.fluxes.some((f) => f > 0) ||
    leaves.some((l) => l.dose.window > 0);
  const kinds = new Set(scenarios.map((s) => s.kind));
  const middle =
    scenarios[result.middle * factors.length + Math.floor(factors.length / 2)];
  return {
    kind: !emitting ? "off" : kinds.size === 1 ? middle.kind : "uncertain",
    fill: middle.completion,
    ratioRange: range("completion"),
    reachedRange: range("reached"),
    aboveRange: range("above"),
    mean: middle.mean,
    lamp: leaves.reduce((sum, l) => sum + (l.area / area) * l.dose.lamp, 0),
    window: leaves.reduce((sum, l) => sum + (l.area / area) * l.dose.window, 0),
    meanRange: range("mean"),
    scenarios,
    area,
    lower: L,
    upper: U,
    sparse: emitting && leaves.some((l) => l.side.hits < 100),
  };
}
