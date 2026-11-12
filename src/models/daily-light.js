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
