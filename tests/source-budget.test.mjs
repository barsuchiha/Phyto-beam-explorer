import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceBudget, sourcePoint } from "../src/models/source-budget.js";
import { sourceSpecs } from "../src/data/source-specs.js";
import { fittingSources } from "../src/data/luminaires.js";
import { cadAssets } from "../src/data/cad-assets.js";
import { normalizeFitting, sourceFit, compatibleSources } from "../src/models/fitting.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import { calculateLuminaire, lightOutput } from "../src/models/luminaire-light.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const fixture = JSON.parse(readFileSync(new URL("./fixtures/source-import.json", import.meta.url)));

test("all 13 sources reproduce the supplied calculator's electrical and thermal outputs", () => {
  assert.equal(Object.keys(sourceSpecs).length, 13);
  assert.deepEqual(Object.keys(fittingSources).sort(), Object.keys(sourceSpecs).sort());
  for (const { source, input, expected } of fixture.cases) {
    const result = sourceBudget({
      source, sourceCurrent: input.current, ambient: input.air,
      enabled: input.enabled, dim: input.dim, hours: input.hours,
      cooling: input.cooling, driverEfficiency: 90, tariff: 8.9,
    }, input.count, 0.15);
    for (const key of ["inputW", "sourcePPF", "wallW", "dayKWh", "monthKWh", "dayRub", "monthRub", "fixtureHeatW", "sinkC"])
      expected[key] == null ? assert.equal(result[key], null) : close(result[key], expected[key]);
    result.monthRubRange.forEach((value, i) => close(value, expected.monthRubRange[i]));
  }
});

test("ready bulbs include their driver once and the new power switch extinguishes their light", () => {
  const on = normalizeFitting({ model: "luna", source: "eraE27_18", dim: 10, driverEfficiency: 50 });
  close(sourceBudget(on, 2).wallW, 36);
  assert.equal(sourceBudget(on, 2, 0.8).sinkC, null);
  assert.deepEqual(lightOutput(on, 2).fluxes, [72, 72, 72]);
  const off = { ...on, enabled: false };
  close(sourceBudget(off, 2).wallW, 0);
  assert.ok(lightOutput(off, 2).fluxes.every((flux) => flux === 0));
  assert.equal(off.dim, 100);
});

test("current, dimming, count, tariff and duration control only their intended budgets", () => {
  const s = normalizeFitting({ model: "A1", source: "square50", dim: 100, hours: 12 });
  close(sourceBudget(s, 1, 0).inputW, 0.350 * 18.62);
  close(sourceBudget(s, 1, 0).sourcePPF, 19.15);
  const high = { ...s, sourceCurrent: 700 };
  close(sourceBudget(high, 1, 0).sourcePPF, 36.98);
  close(lightOutput(high, 1).fluxes[1], 36.98);
  const half = sourceBudget({ ...high, dim: 50 }, 2, 0);
  close(half.inputW, sourceBudget(high, 1, 0).inputW);
  const cost = sourceBudget({ ...s, hours: 6, tariff: 17.8 }, 1, 0);
  close(cost.monthRub, sourceBudget(s, 1, 0).monthRub);
  close(cost.sinkC, sourceBudget(s, 1, 0).sinkC);
  assert.deepEqual(lightOutput({ ...s, tariff: 99, ambient: 35 }, 1).fluxes, lightOutput(s, 1).fluxes);
});

test("radiator estimate follows absorbed light and never reports a pending result as a measurement", () => {
  const s = normalizeFitting({ model: "B3flex", source: "v22d", dim: 100 });
  assert.equal(sourceBudget(s, 2).sinkC, null);
  assert.ok(sourceBudget(s, 2, 1).sinkC > sourceBudget(s, 2, 0).sinkC);
  const shared = sourceBudget(s, 2, 0.15);
  const separate = sourceBudget({ ...s, cooling: "separate-05" }, 2, 0.15);
  close(shared.sinkC - s.ambient, 2 * (separate.sinkC - s.ambient));
  close(sourceBudget({ ...s, enabled: false }, 2).sinkC, s.ambient);
  assert.ok(shared.sinkRange[0] <= shared.sinkC && shared.sinkC <= shared.sinkRange[1]);
  const olive = normalizeFitting({ model: "olive", dim: 100 });
  close(sourceBudget(olive, 6, 0).inputW, 16.8);
});

test("old settings retain 350 mA and valid cooling; large sources do not bypass the fit check", () => {
  const old = normalizeFitting({ model: "A1" });
  assert.equal(old.enabled, true);
  assert.equal(old.sourceCurrent, 350);
  assert.equal(old.tariff, 8.9);
  const damaged = normalizeFitting({ sourceCurrent: 99999, cooling: "missing", tariff: "bad", ambient: 100, driverEfficiency: 0 });
  assert.equal(damaged.sourceCurrent, 350);
  assert.equal(damaged.cooling, "shared-05");
  assert.equal(damaged.tariff, 8.9);
  assert.equal(damaged.ambient, 35);
  assert.equal(damaged.driverEfficiency, 50);
  for (const id of ["linear98", "mf193", "mf194", "eraGreen18"])
    for (const mount of ["original", "large", "pendantPanel", "oliveCassette", "e27"])
      assert.equal(sourceFit(mount, id).ok, false, `${id}/${mount}`);
  assert.deepEqual(compatibleSources("oliveCassette"), ["compact21"]);
  assert.throws(() => sourcePoint("square50", 5000), RangeError);
});

test("both imported COBs trace light on leaves with finite values and conserved photons", () => {
  const data = JSON.parse(readFileSync(new URL("../data/cad/" + cadAssets.V4.file, import.meta.url)))[0];
  for (const source of ["v22d", "x2828"]) {
    const s = normalizeFitting({ model: "V4", source, dim: 100, plantSize: 40, install: 180 });
    const scene = buildLuminaireScene(s, data);
    close(scene.sources[0].w, 0.028);
    close(scene.sources[0].d, 0.028);
    const result = calculateLuminaire(s, scene, 8192);
    for (const metric of result.metrics) {
      assert.ok(Number.isFinite(metric.mean));
      const sum = ["target", "room", "screen", "housing", "residual"].reduce((v, key) => v + metric.budget[key], 0);
      assert.ok(Math.abs(sum - 1) < 0.001);
    }
    assert.ok(result.output.fluxes.every((flux) => flux > 0));
    assert.ok(lightOutput({ ...s, enabled: false }, scene.sources.length).fluxes.every((flux) => flux === 0));
  }
});
