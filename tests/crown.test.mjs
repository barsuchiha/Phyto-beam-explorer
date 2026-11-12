import assert from "node:assert/strict";
import { test } from "node:test";
import { defaults, restoreState, updateState } from "../src/state.js";
import { createCalculator } from "../src/calculate.js";
import { profiles } from "../src/data/profiles.js";
import { plantShapes } from "../src/data/plant-shapes.js";
import { photometry } from "../src/models/photometry.js";
import {
  crownGeometry,
  createRig,
  sourceSamples,
  field3D,
  photonBudget,
  summarizeCrown,
  screenHit,
  rayCrown,
} from "../src/models/crown.js";

const close = (a, b, tol = 1e-8) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} ± ${tol}`);
const point = [{ x: 0, y: 0, w: 0.001, d: 0.001, points: [[0, 0, 1]] }];
const sphere = { rx: 0.5, ry: 0.5, rz: 0.5, center: [0, 0, 0], height: 1 };
const state = { ...defaults, count: 1, dim: 100, dim2: 100, height: 50 };

test("3D receiver reproduces independent planar irradiance, cosine and inverse-square units", () => {
  const rig = { ...createRig(state, point, sphere), origin: [0, 0, 1] };
  const emitters = sourceSamples(point, rig);
  const receiver = { p: [0, 0, 0], normal: [0, 0, 1] };
  close(field3D(receiver, emitters, rig, 120, 40), 40 / Math.PI);
  const shifted = { p: [0.3, 0.2, 0], normal: [0, 0, 1] };
  close(
    field3D(shifted, emitters, rig, 120, 40),
    photometry.fieldAt(
      0.3,
      0.2,
      photometry.sampleEmitters(point, 1, 0),
      120,
      0,
      40,
    ),
  );
  close(
    field3D({ ...receiver, normal: [0, 0, -1] }, emitters, rig, 120, 40),
    0,
  );
  const farther = { ...rig, origin: [0, 0, 2] };
  close(
    field3D(receiver, sourceSamples(point, farther), farther, 120, 40),
    10 / Math.PI,
  );
});

test("side lighting has a finite result and preserves rotational symmetry of a sphere", () => {
  const above = createRig({ ...state, orbit: 0 }, point, sphere),
    side = createRig({ ...state, orbit: 90 }, point, sphere);
  const a = summarizeCrown(sphere, above, point, 120, 40),
    b = summarizeCrown(sphere, side, point, 120, 40);
  close(a.center, b.center);
  close(a.mean / b.mean, 1, 0.012);
  assert.ok(b.mean > 0);
  close(a.area, 2 * Math.PI * 0.5 ** 2, 1e-8);
  close(rayCrown([0, 0, 1], [0, 0, -1], sphere), 0.5);
});

test("finite screen sectors block only the intersected front wall", () => {
  const rig = { radius: 0.2, depth: 0.2, sector: 90, turn: 0 };
  close(screenHit([0, 0, 0], [0.8, 0, 0.6], rig), 0.25);
  assert.equal(screenHit([0, 0, 0], [-0.8, 0, 0.6], rig), Infinity);
  assert.equal(screenHit([0, 0, 0], [0, 0, 1], rig), Infinity);
  assert.equal(screenHit([0, 0, 0], [0.8, 0, -0.6], rig), Infinity);
  assert.equal(screenHit([0, 0, 0], [0.2, 0, Math.sqrt(0.96)], rig), Infinity);
  close(screenHit([0, 0, 0], [-0.8, 0, 0.6], { ...rig, turn: 180 }), 0.25);
});

test("full-sphere budget matches analytical interception and a Lambertian screen cutoff", () => {
  const rig = createRig({ ...state, orbit: 0 }, point, sphere);
  const isotropic = { normalizedIntensity: () => 1 / (4 * Math.PI) };
  const b = photonBudget(sphere, rig, point, isotropic, 1, 2);
  const analytical = (1 - Math.sqrt(1 - (0.5 / 1) ** 2)) / 2;
  close(b.target, analytical, 0.0055);
  close(b.target + b.screen + b.room, 1);
  close(b.quadrature, 1, 1e-10);
  const shield = { ...rig, radius: 0.2, depth: 0.2, sector: 360 };
  const result = photonBudget(sphere, shield, point, 120, 1, 2);
  close(result.screen, 0.5, 0.015); // cos²(atan(R/depth))
  const half = photonBudget(
    sphere,
    { ...shield, sector: 180 },
    point,
    120,
    1,
    2,
  );
  close(half.screen, 0.25, 0.01);
});

test("absorbing screens never boost light; broader nested sectors remove additional photons", () => {
  const calculate = createCalculator();
  const base = calculate({ ...state, source: "square50", orbit: 60 });
  let previous = base;
  for (const screenSector of [90, 180, 270, 360]) {
    const next = calculate({
      ...state,
      source: "square50",
      orbit: 60,
      screenSector,
    });
    assert.ok(next.metrics.mean <= previous.metrics.mean + 1e-9);
    assert.ok(
      next.metrics.budget.screen >= previous.metrics.budget.screen - 1e-9,
    );
    assert.ok(next.metrics.budget.room <= previous.metrics.budget.room + 1e-9);
    close(next.flux, base.flux);
    next.metrics.samples.forEach((s, i) =>
      assert.ok(s.value <= base.metrics.samples[i].value + 1e-9),
    );
    close(
      Object.values(next.metrics.budget)
        .slice(0, 3)
        .reduce((a, b) => a + b, 0),
      1,
    );
    previous = next;
  }
});

test("size limits are species-specific; v1-v7 settings migrate and physical screen depth is bounded", () => {
  for (const [plant, spec] of Object.entries(plantShapes)) {
    const small = restoreState({
      schema: "phyto-beams-v7",
      ...defaults,
      plant,
      plantSize: 1,
      orbit: 150,
      height: 20,
      screenDepth: 100,
    });
    assert.equal(small.plantSize, spec.min);
    assert.equal(small.orbit, 90);
    assert.equal(small.screenDepth, 15);
    const large = restoreState({
      ...small,
      schema: "phyto-beams-v7",
      plantSize: 1000,
    });
    assert.equal(large.plantSize, spec.max);
    assert.ok(crownGeometry(small).rx < crownGeometry(large).rx);
  }
  assert.equal(
    updateState({ ...defaults, plantSize: 230 }, "plant", "spider").plantSize,
    35,
  );
  for (let v = 1; v <= 6; v++) {
    const migrated = restoreState({
      schema: `phyto-beams-v${v}`,
      plant: "peace",
      source: "mf36",
    });
    assert.equal(migrated.plantSize, 50);
    assert.equal(migrated.orbit, 0);
    assert.equal(migrated.screenSector, 0);
  }
  const explicit = {
    ...defaults,
    plantSize: 150,
    orbit: 90,
    screenSector: 270,
    screenDepth: 25,
    screenTurn: 120,
  };
  assert.deepEqual(
    restoreState({ schema: "phyto-beams-v7", ...explicit }),
    explicit,
  );
});

test("all catalog profiles support overhead, oblique and side lighting with conserved photon budgets", () => {
  const calculate = createCalculator();
  for (const source of Object.keys(profiles))
    for (const orbit of [0, 45, 90]) {
      const r = calculate({ ...state, source, orbit, screenSector: 270 });
      assert.ok(r.metrics && Number.isFinite(r.metrics.mean), source);
      assert.ok(
        r.metrics.samples.every(
          (s) => s.value >= 0 && Number.isFinite(s.value),
        ),
        source,
      );
      close(
        r.assessment.percentages.reduce((a, b) => a + b, 0),
        100,
        1e-7,
      );
      const b = r.metrics.budget;
      close(b.target + b.screen + b.room, 1, 1e-8);
      close(b.quadrature, 1, 0.003);
      if (r.ranged)
        assert.ok(
          r.metrics.range.mean[0] <= r.metrics.mean &&
            r.metrics.mean <= r.metrics.range.mean[1],
        );
    }
});

test("surface quadrature converges and intercepted photons agree with the independent ray budget", () => {
  const c = crownGeometry({ ...state, plantSize: 70 }),
    rig = createRig({ ...state, orbit: 45 }, point, c);
  const coarse = summarizeCrown(c, rig, point, "lm301b", 30),
    fine = summarizeCrown(c, rig, point, "lm301b", 30, 2);
  close(coarse.mean / fine.mean, 1, 0.025);
  const budget = photonBudget(c, rig, point, "lm301b", 30, 2);
  // All illuminated surface is on the central-source-facing hemisphere here.
  close((fine.mean * fine.area) / 30, budget.target, 0.008);
});
