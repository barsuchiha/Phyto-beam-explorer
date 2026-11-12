import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyLeafLight,
  dailyPlantLight,
  dailyPercent,
} from "../src/models/daily-light.js";

const state = { plant: "lyrata", hours: 10 };
const face = (dli, lo = dli, hi = dli) => ({
  mean: dli / 0.036,
  range: [lo / 0.036, hi / 0.036],
  hits: 500,
});
const fixture = (dli, lo = dli, hi = dli) => ({
  receiver: "leaves",
  range: [0, 1],
  output: { fluxes: [10] },
  metrics: [{ budget: { target: 0.1 } }],
  leaves: [{ id: 0, sides: [face(dli, lo, hi), face(0)] }],
});

test("daily judgement is local to the brighter whole face, not an average with a dark back", () => {
  const r = fixture(8);
  r.leaves.push({ id: 1, sides: [face(1), face(2)] });
  assert.equal(dailyLeafLight(r, state).kind, "enough");
  const shadow = dailyLeafLight(r, state, 1);
  assert.equal(shadow.kind, "low");
  assert.equal(shadow.side, 1);
  assert.ok(Math.abs(shadow.value - 2) < 1e-12);
  assert.equal(dailyLeafLight({ ...r, receiver: "crown" }, state), null);
});

test("daily status handles low, enough, high and crossing source scenarios without claiming certainty", () => {
  assert.equal(dailyLeafLight(fixture(1), state).kind, "low");
  assert.equal(dailyLeafLight(fixture(8, 7, 9), state).kind, "enough");
  assert.equal(dailyLeafLight(fixture(12, 11, 15), state).kind, "high");
  assert.equal(dailyLeafLight(fixture(6, 5, 7), state).kind, "uncertain");
  assert.equal(dailyLeafLight(fixture(10, 9, 11), state).kind, "uncertain");
});

test("sun fill is a literal fraction of the lower reference, with excess still reported", () => {
  const weak = dailyLeafLight(fixture(0.9), state);
  assert.ok(Math.abs(weak.fill - 0.15) < 1e-12);
  assert.equal(dailyPercent(weak.ratioRange[0]), "15%");
  const high = dailyLeafLight(fixture(18), state);
  assert.equal(high.fill, 1);
  assert.equal(dailyPercent(high.ratioRange[0]), "300%");
  assert.equal(dailyPercent(0.999), "99%");
  assert.equal(dailyPercent(0.001), "<1%");
});

test("duration and plant reference change the local assessment without changing the lighting result", () => {
  const result = fixture(4),
    original = JSON.stringify(result);
  assert.equal(dailyLeafLight(result, state).kind, "low");
  assert.equal(dailyLeafLight(result, { ...state, hours: 20 }).kind, "enough");
  assert.equal(
    dailyLeafLight(result, { ...state, plant: "zz" }).kind,
    "enough",
  );
  assert.equal(JSON.stringify(result), original);
});

test("lamp off, sparse sampling and missing old leaf selection have distinct safe fallbacks", () => {
  const off = fixture(0);
  off.output.fluxes = [0];
  assert.equal(dailyLeafLight(off, state).kind, "off");
  assert.equal(dailyLeafLight(off, state).fill, 0);
  const zero = fixture(0);
  zero.leaves[0].sides[0].hits = 0;
  assert.equal(dailyLeafLight(zero, state).sparse, true);
  assert.equal(dailyLeafLight(fixture(8), state, 999).leaf, 0);
});

const plantFixture = (specs, middle = 0) => ({
  receiver: "leaves",
  middle,
  output: { fluxes: specs[0].doses.map(() => 10) },
  leaves: specs.map(({ area, doses, backs = doses.map(() => 0) }, id) => ({
    id,
    area,
    sides: [doses, backs].map((values) => ({
      mean: values[middle] / 0.036,
      values: values.map((v) => v / 0.036),
      range: [Math.min(...values) / 0.036, Math.max(...values) / 0.036],
      hits: 500,
    })),
  })),
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} vs ${b}`);

test("the whole-plant sun caps each leaf before area weighting so excess cannot hide shade", () => {
  const r = plantFixture([
    { area: 9, doses: [0] },
    { area: 1, doses: [60] },
  ]);
  const s = dailyPlantLight(r, state);
  near(s.mean, 6); // Uncapped average would appear to meet the reference.
  near(s.fill, 0.1);
  near(s.reachedRange[0], 0.1);
  near(s.aboveRange[0], 0.1);
  assert.equal(s.kind, "mixed");
});

test("whole-plant weighting uses leaf area, not leaf count or both sides averaged together", () => {
  const r = plantFixture([
    { area: 1, doses: [3] },
    { area: 3, doses: [6] },
  ]);
  const original = JSON.stringify(r),
    s = dailyPlantLight(r, state);
  near(s.fill, 0.875);
  near(s.reachedRange[0], 0.75);
  assert.equal(s.area, 4);
  assert.equal(s.kind, "partial");
  assert.equal(JSON.stringify(r), original);
});

test("whole-plant intervals keep source scenarios correlated across leaves", () => {
  const r = plantFixture([
    { area: 1, doses: [0, 12] },
    { area: 1, doses: [12, 0] },
  ]);
  const s = dailyPlantLight(r, state);
  assert.deepEqual(s.ratioRange, [0.5, 0.5]);
  assert.deepEqual(s.reachedRange, [0.5, 0.5]);
  assert.equal(s.kind, "mixed");
});

test("whole-plant evaluation keeps the same physical face across scenarios and flags ambiguity", () => {
  const r = plantFixture([{ area: 1, doses: [9, 0], backs: [0, 9] }]);
  const s = dailyPlantLight(r, state);
  assert.deepEqual(s.ratioRange, [0, 1]);
  assert.equal(s.kind, "uncertain");
  const u = dailyPlantLight(plantFixture([{ area: 1, doses: [3, 8] }]), state);
  assert.equal(u.kind, "uncertain");
});

test("whole-plant sun distinguishes enough, too high, off and unavailable receivers", () => {
  const r = plantFixture([
    { area: 1, doses: [8] },
    { area: 2, doses: [9] },
  ]);
  assert.equal(dailyPlantLight(r, state).kind, "enough");
  assert.equal(dailyPlantLight(r, state).fill, 1);
  assert.equal(
    dailyPlantLight(plantFixture([{ area: 1, doses: [12] }]), state).kind,
    "high",
  );
  const off = plantFixture([{ area: 1, doses: [0] }]);
  off.output.fluxes = [0];
  assert.equal(dailyPlantLight(off, state).kind, "off");
  assert.equal(dailyPlantLight(off, state).fill, 0);
  assert.equal(dailyPlantLight({ ...r, receiver: "crown" }, state), null);
  assert.equal(
    dailyPlantLight(plantFixture([{ area: 0, doses: [8] }]), state),
    null,
  );
});
