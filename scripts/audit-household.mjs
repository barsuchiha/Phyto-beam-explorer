// Reproduce the household-lighting review without changing app defaults.
// Output is model evidence, not a measurement or plant-health validation.
// Usage: node scripts/audit-household.mjs > /tmp/household-audit.json
import assert from "node:assert/strict";
import { createCalculator } from "../src/calculate.js";
import { defaults } from "../src/state.js";
import { profiles } from "../src/data/profiles.js";
import { plants } from "../src/data/plants.js";

const calculate = createCalculator();
const area = Math.PI * 0.28 * 0.22;
const nominal = {
  ...defaults,
  count: 1,
  current: 700,
  dim: 100,
  dim2: 100,
  height: 40,
  tilt: 0,
  hours: 12,
};
const metrics = (result) => ({
  ppf: result.flux,
  meanPPFD: result.metrics.mean,
  centerPPFD: result.metrics.center,
  meanPPFDRange: result.ranged ? result.metrics.range.mean : null,
  meanDLI: result.daily,
  meanDLIRange: result.dailyRange,
  ledWatts: result.op?.watts ?? null,
});
const comparison = Object.entries(profiles)
  .filter(([, p]) => ["catalog", "estimate", "era"].includes(p.kind))
  .map(([source, p]) => ({
    source,
    kind: p.kind,
    at40cm: metrics(calculate({ ...nominal, source })),
    at20cm: metrics(calculate({ ...nominal, source, height: 20 })),
  }));

const cases = [
  {},
  { height: 20, tilt: -20, dim: 50, dim2: 50, count: 2 },
  { height: 100, tilt: 20, dim: 70, dim2: 70, count: 4, current: 350 },
];
let opticalCases = 0;
let plantCases = 0;
for (const source of Object.keys(profiles)) {
  for (const overrides of cases) {
    const state = { ...nominal, source, ...overrides };
    const r = calculate(state);
    assert.ok(r.metrics, `${source}: ${r.op?.reason}`);
    assert.ok(r.metrics.samples.every((s) => Number.isFinite(s.value) && s.value >= 0));
    // Captured photons on the finite receiver cannot exceed total emitted PPF.
    // The allowance is only for numerical quadrature, not optical uncertainty.
    assert.ok(r.metrics.mean * area <= r.flux * 1.001 + 1e-9, source);
    if (r.ranged) {
      for (const name of ["mean", "center"]) {
        const [lo, hi] = r.metrics.range[name];
        assert.ok(lo <= r.metrics[name] && r.metrics[name] <= hi, source);
      }
    }
    opticalCases++;
    for (const plant of Object.keys(plants)) {
      const result = calculate({ ...state, plant });
      assert.ok(Number.isFinite(result.daily) && result.daily >= 0);
      assert.ok(result.meanClass >= 0 && result.meanClass <= 4);
      const total = result.assessment.percentages.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(total - 100) < 1e-8, source);
      plantCases++;
    }
  }
}
console.log(JSON.stringify({
  reviewedOn: "2026-11-12",
  sourceCount: Object.keys(profiles).length,
  specificProductCount: comparison.length,
  opticalCases,
  plantCases,
  conditions: {
    ...nominal,
    source: "varies",
    receiver: "horizontal ellipse 56 × 44 cm",
    receiverAreaM2: area,
    backgroundLight: "excluded",
    notes: "100% refers to the selected 700 mA for Samsung, not the maximum permissible current. MiniFermer uses the documented hypothetical rated output. ERA uses published PPF at full output.",
  },
  comparison,
}, null, 2));
