import assert from "node:assert/strict";
import { test } from "node:test";
import { defaults, restoreState, updateState } from "../src/state.js";
import { layout } from "../src/models/layout.js";
import {
  crownGeometry,
  createRig,
  summarizeCrown,
} from "../src/models/crown.js";
import {
  bounceDirection,
  compareScreens,
  transport,
  reflectedMetrics,
} from "../src/models/reflections.js";
import { createCalculator } from "../src/calculate.js";

const near = (a, b, e = 1e-8) =>
  assert.ok(Math.abs(a - b) <= e, `${a} != ${b} ± ${e}`);
const sum = (b) => b.target + b.screen + b.room + b.housing + b.residual;
const state = {
  ...defaults,
  count: 1,
  screenSector: 270,
  screenMode: "mirror",
  reflectance: 90,
};
function setup(s = state) {
  const groups = layout(s),
    crown = crownGeometry(s),
    rig = createRig(s, groups, crown),
    direct = summarizeCrown(crown, rig, groups, "lm301b", 36.98);
  return { groups, crown, rig, direct };
}

test("mirror law preserves length and incidence angle; diffuse sampling follows cosine-weighted hemisphere", () => {
  const d = [0.6, 0, 0.8],
    n = [-1, 0, 0],
    r = bounceDirection(d, n, "mirror");
  near(r[0], -0.6);
  near(r[2], 0.8);
  near(Math.hypot(...r), 1);
  let meanCos = 0,
    meanZ = 0;
  for (let i = 0; i < 10000; i++) {
    const q = bounceDirection(
      d,
      n,
      "diffuse",
      (i + 0.5) / 10000,
      ((i + 0.5) * 0.61803398875) % 1,
    );
    near(Math.hypot(...q), 1);
    assert.ok(q[0] <= 0);
    meanCos -= q[0];
    meanZ += q[2];
  }
  near(meanCos / 10000, 2 / 3, 0.0001);
  near(meanZ / 10000, 0, 0.001);
});

test("all opaque materials conserve photons including lamp absorption and unresolved paths", () => {
  const { groups, crown, rig, direct } = setup();
  let previous = null;
  for (const rho of [0, 0.5, 0.9, 1]) {
    const variants = compareScreens(
      crown,
      rig,
      groups,
      "lm301b",
      36.98,
      direct,
      rho,
    );
    for (const [name, r] of Object.entries(variants)) {
      near(sum(r.budget), 1, 1e-9);
      assert.ok(r.mean >= direct.mean - 1e-10);
      near(r.budget.target, r.budget.direct + r.budget.returned, 1e-9);
      for (const k of ["target", "screen", "housing", "room", "residual"])
        assert.ok(r.budget[k] >= 0 && r.budget[k] <= 1);
      if (rho === 0) {
        near(r.mean, variants.absorb.mean);
        near(r.budget.target, variants.absorb.budget.target);
        near(r.budget.screen, variants.absorb.budget.screen);
      }
      if (rho === 1 && name !== "absorb") near(r.budget.screen, 0);
      if (previous && name !== "absorb")
        assert.ok(r.budget.target >= previous[name].budget.target - 1e-10);
    }
    near(variants.mirror.budget.housing, 0); // cylindrical mirror preserves forward axial direction
    if (rho > 0) assert.ok(variants.diffuse.budget.housing > 0);
    previous = variants;
  }
});

test("reflected photon map preserves deposited power and increases PPFD only where photons land", () => {
  const { groups, crown, rig, direct } = setup();
  const variants = compareScreens(
    crown,
    rig,
    groups,
    "lm301b",
    36.98,
    direct,
    0.9,
  );
  for (const name of ["mirror", "diffuse"]) {
    const r = variants[name],
      mapFlux = r.samples.reduce((sum, s) => sum + s.reflected * s.area, 0);
    assert.ok(mapFlux <= r.budget.returned * 36.98 + 1e-9);
    // Some splats may cross the displayed hemisphere boundary; the full budget doesn't discard them.
    assert.ok(mapFlux > r.budget.returned * 36.98 * 0.95);
    near(r.mean, direct.mean + mapFlux / direct.area);
    r.samples.forEach((s, i) => {
      near(s.direct, direct.samples[i].value);
      assert.ok(s.reflected >= 0);
    });
  }
});

test("doubling ray count keeps whole-crown gains and budgets stable", () => {
  for (const orbit of [0, 90]) {
    const { groups, crown, rig, direct } = setup({ ...state, orbit });
    const low = compareScreens(
      crown,
      rig,
      groups,
      "lm301b",
      36.98,
      direct,
      0.9,
      131072,
    );
    const high = compareScreens(
      crown,
      rig,
      groups,
      "lm301b",
      36.98,
      direct,
      0.9,
      262144,
    );
    for (const name of ["mirror", "diffuse"]) {
      near(low[name].budget.target, high[name].budget.target, 0.004);
      near(low[name].budget.room, high[name].budget.room, 0.004);
      near(low[name].reflectedMean / high[name].reflectedMean, 1, 0.035);
      near(low[name].center / high[name].center, 1, 0.2); // local reflected map is explicitly an area estimate
    }
  }
});

test("changes to source weights reuse geometry but change reflected illumination; zero flux adds nothing", () => {
  const s = { ...state, count: 2 },
    a = setup(s);
  const p = transport(a.crown, a.rig, a.groups);
  const shifted = a.groups.map((g, i) => ({ ...g, weight: i === 0 ? 1 : 0 }));
  const other = transport(a.crown, a.rig, shifted);
  assert.equal(p.modes, other.modes);
  assert.notDeepEqual(
    p.emitters.map((e) => e.weight),
    other.emitters.map((e) => e.weight),
  );
  const empty = {
    ...a.direct,
    mean: 0,
    center: 0,
    samples: a.direct.samples.map((s) => ({ ...s, value: 0 })),
  };
  const zero = reflectedMetrics(empty, p, "lm301b", 0, 0.9, "mirror");
  near(zero.mean, 0);
  near(zero.center, 0);
  near(sum(zero.budget), 0);
});

test("v8 material controls migrate old settings, clamp reflectance and persist string modes", () => {
  const old = restoreState({ schema: "phyto-beams-v7", ...defaults });
  assert.equal(old.screenMode, "absorb");
  assert.equal(old.reflectance, 90);
  const next = updateState(old, "screenMode", "diffuse");
  assert.equal(next.screenMode, "diffuse");
  assert.equal(updateState(next, "reflectance", 1000).reflectance, 100);
  assert.equal(updateState(next, "reflectance", -1).reflectance, 0);
  assert.equal(
    updateState(next, "screenMode", "constructor").screenMode,
    "absorb",
  );
  assert.deepEqual(restoreState({ schema: "phyto-beams-v8", ...next }), next);
});

test("source scenario ranges follow selected reflection material and no-screen modes remain identical", () => {
  const calculate = createCalculator();
  for (const source of [
    "square50",
    "mf193",
    "mf36",
    "eraGreen18",
    "eraE27_18",
    "eraE27_25",
  ]) {
    const base = calculate({ ...state, source, screenMode: "absorb" });
    for (const screenMode of ["mirror", "diffuse"]) {
      const r = calculate({ ...state, source, screenMode });
      assert.ok(r.metrics.mean >= base.metrics.mean);
      near(sum(r.metrics.budget), 1, 1e-8);
      if (r.ranged) {
        assert.ok(
          r.metrics.range.mean[0] <= r.metrics.mean &&
            r.metrics.range.mean[1] >= r.metrics.mean,
        );
        assert.ok(r.metrics.range.mean[0] >= base.metrics.range.mean[0]);
      }
    }
    const clear = calculate({
      ...state,
      source,
      screenSector: 0,
      screenMode: "mirror",
    });
    near(
      clear.metrics.screenComparison.absorb.mean,
      clear.metrics.screenComparison.diffuse.mean,
    );
  }
});
