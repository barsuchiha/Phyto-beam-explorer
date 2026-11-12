import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyLeafLight, dailyPercent } from "../src/models/daily-light.js";

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
