import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculateReferenceLight,
  referenceDetector,
  REFERENCE_RADIUS,
} from "../src/models/reference-light.js";
import {
  calculateLuminaire,
  lightOutput,
} from "../src/models/luminaire-light.js";
import { normalizeFitting } from "../src/models/fitting.js";
import { buildLuminaireScene, quad } from "../src/models/luminaire-scene.js";
import { cadAssets } from "../src/data/cad-assets.js";

const state = normalizeFitting({
  model: "A2",
  mount: "large",
  source: "mf36",
  dim: 100,
});
const crown = { center: [0, 0, 0.5], rx: 0.3, ry: 0.3, rz: 0.5 };
const source = {
  p: [0, 0, 1.4],
  n: [0, 0, -1],
  u: [1, 0, 0],
  v: [0, 1, 0],
  w: 1e-9,
  d: 1e-9,
};
const scene = { crown, sources: [source], surfaces: [], boards: [] };

test("top detector agrees with independent Lambertian disk average, not a two-sided average", () => {
  const flux = lightOutput(state, 1).fluxes[1];
  for (const h of [0.2, 0.4, 0.6]) {
    const r = calculateReferenceLight(state, {
      ...scene,
      sources: [{ ...source, p: [0, 0, 1 + h] }],
    });
    // Integral over an upward circular receiver: PPF / π(h² + R²).
    const exact = flux / (Math.PI * (h * h + REFERENCE_RADIUS ** 2));
    assert.ok(
      Math.abs(r.mean / exact - 1) < 0.015,
      `${h}: ${r.mean} vs ${exact}`,
    );
    assert.ok(r.range[0] < r.mean && r.range[1] > r.mean);
    assert.equal(r.lowSample, false);
  }
});

test("only the top face contributes; blocked, off and sparsely sampled readings are handled", () => {
  const below = calculateReferenceLight(state, {
    ...scene,
    sources: [{ ...source, p: [0, 0, 0.6], n: [0, 0, 1] }],
  });
  assert.equal(below.mean, 0);
  assert.equal(below.lowSample, true);
  const off = calculateReferenceLight({ ...state, dim: 0 }, scene);
  assert.deepEqual(off.range, [0, 0]);
  const blocked = calculateReferenceLight(state, {
    ...scene,
    boards: [
      quad([-1, -1, 1.2], [1, -1, 1.2], [1, 1, 1.2], [-1, 1, 1.2], "housing"),
    ],
  });
  assert.equal(blocked.mean, 0);
  const sparse = calculateReferenceLight(state, {
    ...scene,
    sources: [{ ...source, p: [0, 0, 20] }],
  });
  assert.equal(sparse.lowSample, true);
});

test("reference follows the crown, is independent of receiver mode, and preserves plant accounting", () => {
  const pose = JSON.parse(
    readFileSync(
      new URL("../data/cad/" + cadAssets.luna.file, import.meta.url),
    ),
  )[0];
  const s = normalizeFitting({
    model: "luna",
    mount: "e27",
    source: "mfE27_25",
    receiver: "leaves",
    plantSize: 100,
    install: 160,
    plantOffset: 10,
    screen: true,
    screenLength: 12,
    sector: 360,
  });
  const g = buildLuminaireScene(s, pose);
  const detector = referenceDetector(g);
  assert.deepEqual(detector.center, [
    g.crown.center[0],
    g.crown.center[1],
    g.crown.center[2] + g.crown.rz,
  ]);
  assert.ok(
    Math.abs(detector.area / (Math.PI * REFERENCE_RADIUS ** 2) - 1) < 0.002,
  );
  const saved = JSON.stringify(g);
  const before = calculateLuminaire(s, g, 16384);
  const reference = calculateReferenceLight(s, g);
  assert.deepEqual(
    reference,
    calculateReferenceLight({ ...s, receiver: "crown" }, g),
  );
  assert.equal(JSON.stringify(g), saved);
  assert.deepEqual(calculateLuminaire(s, g, 16384).metrics, before.metrics);
  const high = calculateReferenceLight(s, g, 1048576);
  assert.ok(Math.abs(reference.mean / high.mean - 1) < 0.05);
});
