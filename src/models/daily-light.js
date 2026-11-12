import { plantModel } from "./plants.js";
import { surfaceReadout } from "./light-readout.js";

// A local comparison for one whole leaf face, never a whole-plant health score.
// Use one physical face across scenarios; don't choose a new winner per scenario.
export function dailyLeafLight(result, state, selectedLeaf = -1) {
  if (result.receiver !== "leaves" || !result.leaves?.length) return null;
  const readout = surfaceReadout(result);
  const leaf =
    result.leaves.find((l) => l.id === selectedLeaf) ??
    result.leaves.find((l) => l.id === readout.brightest.leaf);
  const side = leaf.sides[1].mean > leaf.sides[0].mean ? 1 : 0;
  const data = leaf.sides[side];
  const range = data.range.map((v) => plantModel.dli(v, state.hours));
  const value = plantModel.dli(data.mean, state.hours);
  const { L, U } = plantModel.groups[plantModel.plants[state.plant].group];
  const kind = !readout.emitting
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
    sparse: readout.emitting && data.hits < 100,
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
    .map((leaf) => ({
      area: leaf.area,
      side: leaf.sides[leaf.sides[1].mean > leaf.sides[0].mean ? 1 : 0],
    }));
  const area = leaves.reduce((sum, leaf) => sum + leaf.area, 0);
  if (!area) return null;
  const { L, U } = plantModel.groups[plantModel.plants[state.plant].group];
  const snap = (n) => (n > 1 - 1e-12 ? 1 : n < 1e-12 ? 0 : n);
  const scenarios = result.output.fluxes.map((_, k) => {
    let completion = 0,
      below = 0,
      above = 0,
      mean = 0;
    for (const leaf of leaves) {
      const dose = plantModel.dli(leaf.side.values[k], state.hours);
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
  });
  const range = (key) => [
    Math.min(...scenarios.map((s) => s[key])),
    Math.max(...scenarios.map((s) => s[key])),
  ];
  const emitting = result.output.fluxes.some((f) => f > 0);
  const kinds = new Set(scenarios.map((s) => s.kind));
  const middle = scenarios[result.middle];
  return {
    kind: !emitting ? "off" : kinds.size === 1 ? middle.kind : "uncertain",
    fill: middle.completion,
    ratioRange: range("completion"),
    reachedRange: range("reached"),
    aboveRange: range("above"),
    mean: middle.mean,
    meanRange: range("mean"),
    scenarios,
    area,
    lower: L,
    upper: U,
    sparse: emitting && leaves.some((l) => l.side.hits < 100),
  };
}
