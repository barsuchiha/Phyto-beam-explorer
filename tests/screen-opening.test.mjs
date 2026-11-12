import assert from "node:assert/strict";
import { test } from "node:test";
import { defaults, restoreState, updateState } from "../src/state.js";
import { layout } from "../src/models/layout.js";
import {
  crownGeometry,
  createRig,
  photonBudget,
  screenHit,
  summarizeCrown,
} from "../src/models/crown.js";
import { wallNormal } from "../src/models/screen-geometry.js";
import { bounceDirection, compareScreens } from "../src/models/reflections.js";
import { createCalculator } from "../src/calculate.js";

const near = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b} ± ${tol}`);
const sum = (b) => b.target + b.screen + b.room + b.housing + b.residual;
const base = { ...defaults, count: 1, screenSector: 360, screenMode: "mirror" };
function setup(screenOpening, orbit = 0) {
  const state = { ...base, screenOpening, orbit },
    groups = layout(state),
    crown = crownGeometry(state),
    rig = createRig(state, groups, crown);
  return {
    state,
    groups,
    crown,
    rig,
    direct: summarizeCrown(crown, rig, groups, "lm301b", 36.98),
  };
}

test("opening preserves wall length and source clearance; old states retain the cylinder", () => {
  for (const opening of [0, 30, 60, 120]) {
    const { rig } = setup(opening);
    near(Math.hypot(rig.depth, rig.mouthRadius - rig.radius), 0.15);
    assert.ok(rig.depth <= 0.15 && rig.mouthRadius >= rig.radius);
    near(rig.slope, Math.tan((opening * Math.PI) / 360));
  }
  assert.equal(
    restoreState({ schema: "phyto-beams-v8", ...base }).screenOpening,
    0,
  );
  assert.equal(updateState(base, "screenOpening", 150).screenOpening, 120);
  assert.equal(updateState(base, "screenOpening", -1).screenOpening, 0);
  assert.equal(
    restoreState({ schema: "phyto-beams-v9", ...base, screenOpening: 75 })
      .screenOpening,
    75,
  );
});

test("conical intersection and normal agree with analytical rays, including a linear root", () => {
  const rig = {
    radius: 0.1,
    depth: 0.4 * Math.cos(Math.PI / 6),
    slope: Math.tan(Math.PI / 6),
    sector: 360,
    turn: 0,
  };
  const d = [Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)];
  const t = screenHit([0, 0, 0], d, rig);
  near(t, 0.1 / (d[0] - rig.slope * d[2]));
  const n = wallNormal(d[0] * t, 0, rig),
    r = bounceDirection(d, n, "mirror");
  near(r[0], 0);
  near(r[1], 0);
  near(r[2], 1);
  near(screenHit([0.3, 0, 0], [-0.5, 0, Math.sqrt(0.75)], rig), 0.2);
  assert.equal(screenHit([0, 0, 0], [0.5, 0, Math.sqrt(0.75)], rig), Infinity);
  assert.equal(
    screenHit([0, 0, 0], d, { ...rig, sector: 90, turn: 180 }),
    Infinity,
  );
  assert.equal(screenHit([0, 0, 0], d, { ...rig, depth: 0.01 }), Infinity);
});

test("matte sampling stays in the tilted normal hemisphere with expected mean direction", () => {
  const n = wallNormal(1, 0, { slope: Math.tan(Math.PI / 3) }),
    mean = [0, 0, 0];
  for (let i = 0; i < 10000; i++) {
    const d = bounceDirection(
      [1, 0, 0],
      n,
      "diffuse",
      (i + 0.5) / 10000,
      ((i + 0.5) * 0.61803398875) % 1,
    );
    near(Math.hypot(...d), 1);
    assert.ok(d.reduce((v, x, j) => v + x * n[j], 0) >= -1e-12);
    d.forEach((x, j) => (mean[j] += x / 10000));
  }
  mean.forEach((x, j) => near(x, (n[j] * 2) / 3, 0.001));
});

test("opened absorbing wall matches a Lambertian analytical aperture cutoff", () => {
  const crown = { center: [0, 0, 10], rx: 0.01, ry: 0.01, rz: 0.01 };
  const groups = [
    { x: 0, y: 0, w: 0.01, d: 0.01, weight: 1, points: [[0, 0, 1]] },
  ];
  const rig = {
    origin: [0, 0, 0],
    u: [1, 0, 0],
    v: [0, 1, 0],
    f: [0, 0, 1],
    radius: 0.1,
    depth: 0.4 * Math.cos(Math.PI / 6),
    slope: Math.tan(Math.PI / 6),
    sector: 360,
    turn: 0,
  };
  const mouth = rig.radius + rig.depth * rig.slope;
  const b = photonBudget(crown, rig, groups, 120, 1, 3);
  near(b.screen, rig.depth ** 2 / (mouth ** 2 + rig.depth ** 2), 0.009);
  const half = photonBudget(crown, { ...rig, sector: 180 }, groups, 120, 1, 3);
  near(half.screen, b.screen / 2, 0.004);
});

test("opened reflectors conserve photons at both orbit endpoints and converge on target/spill", () => {
  for (const orbit of [0, 90]) {
    const { crown, rig, groups, direct } = setup(60, orbit);
    const low = compareScreens(
      crown,
      rig,
      groups,
      "lm301b",
      36.98,
      direct,
      0.9,
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
    for (const mode of ["absorb", "mirror", "diffuse"]) {
      near(sum(low[mode].budget), 1);
      near(low[mode].budget.target, high[mode].budget.target, 0.004);
      near(low[mode].budget.room, high[mode].budget.room, 0.004);
      if (mode !== "absorb")
        near(low[mode].reflectedMean / high[mode].reflectedMean, 1, 0.05);
    }
  }
});

test("changing opening invalidates optics and preserves source PPF across source models", () => {
  const calc = createCalculator();
  for (const source of [
    "square50",
    "mf193",
    "mf36",
    "eraGreen18",
    "eraE27_18",
    "qb30",
  ]) {
    const closed = calc({ ...base, source, screenOpening: 0 });
    const open = calc({ ...base, source, screenOpening: 60 });
    near(closed.flux, open.flux);
    assert.notEqual(closed.metrics.mean, open.metrics.mean);
    near(sum(open.metrics.budget), 1);
    assert.ok(open.metrics.budget.target >= open.metrics.budget.returned);
  }
  for (const screenOpening of [0, 120]) {
    const r = calc({ ...base, screenOpening, screenSector: 0 });
    near(
      r.metrics.mean,
      calc({ ...base, screenOpening: 0, screenSector: 0 }).metrics.mean,
    );
  }
});
