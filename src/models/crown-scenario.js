import {
  crownGeometry,
  createRig,
  summarizeCrown,
  photonBudget,
} from "./crown.js";
import { eraModel } from "./era.js";
import { mini36Model } from "./mini36.js";

export function crownScenario(state, groups, flux, estimate) {
  const crown = crownGeometry(state),
    rig = createRig(state, groups, crown);
  const spec = [];
  if (state.source === "mf36") {
    estimate.fluxes.forEach((f, i) =>
      spec.push({
        g: mini36Model.weightedGroups(groups, i),
        curve: 120,
        flux: f,
      }),
    );
  } else if (state.source === "mf193" || state.source === "mf194") {
    for (const angle of [110, 120, 130])
      for (const f of estimate.fluxes)
        spec.push({ g: groups, curve: angle, flux: f });
  } else if (eraModel.modules[state.source]) {
    for (const curve of state.source === "eraGreen18"
      ? [eraModel.curve]
      : [110, 120, 130])
      spec.push({ g: groups, curve, flux });
  } else
    spec.push({
      g: groups,
      curve: ["square50", "compact21", "linear98"].includes(state.source)
        ? "lm301b"
        : state.angle,
      flux,
    });
  const cache = new Map();
  const scenarios = spec.map((s) => {
    if (state.source === "mf193" || state.source === "mf194") {
      if (!cache.has(s.curve))
        cache.set(s.curve, summarizeCrown(crown, rig, s.g, s.curve, 1));
      const shape = cache.get(s.curve);
      return {
        ...shape,
        mean: shape.mean * s.flux,
        center: shape.center * s.flux,
        samples: shape.samples.map((p) => ({ ...p, value: p.value * s.flux })),
      };
    }
    return summarizeCrown(crown, rig, s.g, s.curve, s.flux);
  });
  const middle = Math.floor(spec.length / 2),
    base = spec[middle];
  const result = {
    ...scenarios[middle],
    crown,
    rig,
    curve: base.curve,
    groups: base.g,
  };
  if (spec.length > 1) {
    result.range = {};
    for (const key of ["mean", "center"])
      result.range[key] = [
        Math.min(...scenarios.map((s) => s[key])),
        Math.max(...scenarios.map((s) => s[key])),
      ];
  }
  if (state.source === "eraGreen18")
    result.pointAlternative = summarizeCrown(
      crown,
      rig,
      groups.map((g) => ({ ...g, points: [[0, 0, 1]] })),
      eraModel.curve,
      flux,
    );
  result.budget = photonBudget(crown, rig, base.g, base.curve, flux);
  return result;
}
