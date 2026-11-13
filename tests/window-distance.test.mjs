import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WINDOW,
  windowAtY,
  placeWindow,
} from "../src/models/window-geometry.js";
import {
  windowAtPoint,
  windowDiffuseIntegral,
  calculateWindowLight,
  windowDose,
} from "../src/models/window-light.js";
import { normalizeFitting } from "../src/models/fitting.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import { cadAssets } from "../src/data/cad-assets.js";
const near = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const pose = JSON.parse(
  readFileSync(new URL("../data/cad/" + cadAssets.olive.file, import.meta.url)),
)[0];
const state = normalizeFitting({
  model: "olive",
  plant: "lyrata",
  plantSize: 105,
  receiver: "leaves",
  windowWeather: "sunny",
  towerTurn: 0,
  jointMiddle: 0,
  jointTop: 0,
});
test("moving the wall preserves the plant and lamp, changes all room planes and keeps the chair inside", () => {
  const close = buildLuminaireScene({ ...state, windowDistance: 5 }, pose),
    far = buildLuminaireScene({ ...state, windowDistance: 500 }, pose);
  near(close.window.y - close.leafGeometry.bounds.max[1], 0.05);
  near(far.window.y - far.leafGeometry.bounds.max[1], 5);
  assert.deepEqual(close.sources, far.sources);
  assert.deepEqual(close.leafGeometry, far.leafGeometry);
  for (const scene of [close, far]) {
    near(scene.room.bounds.max[1], scene.window.y);
    near(scene.window.reference[1], scene.window.y - 0.5);
    near(
      scene.room.objects.find((o) => o.id === "back-wall").coordinate,
      scene.window.y,
    );
    near(
      scene.room.objects.find((o) => o.id === "floor").ranges[1][1],
      scene.window.y,
    );
    near(
      scene.room.objects.find((o) => o.id === "left-wall").ranges[0][1],
      scene.window.y,
    );
    for (const o of scene.room.objects.filter((o) => o.type === "ellipsoid"))
      assert.ok(o.center[1] + o.radius[1] < scene.window.y);
    assert.equal(scene.roomCollision, null);
  }
  assert.ok(close.room.chairY < far.room.chairY);
});
test("old saves retain their wall position and distance bounds are enforced", () => {
  assert.equal(normalizeFitting().windowDistance, null);
  near(buildLuminaireScene(state, pose).window.y, WINDOW.y);
  assert.equal(normalizeFitting({ windowDistance: -1 }).windowDistance, 5);
  assert.equal(normalizeFitting({ windowDistance: 999 }).windowDistance, 500);
  const aperture = placeWindow(
    { windowDistance: 5 },
    { bounds: { max: [0, 0.2, 1] } },
    [{ a: [0, 0.5, 1], b: [1, 0.5, 1], c: [1, 0.5, 2], d: [0, 0.5, 2] }],
  );
  near(aperture.y, 0.55);
  assert.ok(aperture.limitedByFixture);
});
test("near-window diffuse irradiance matches the analytical rectangle and never exceeds a hemisphere", () => {
  const a = (WINDOW.x[1] - WINDOW.x[0]) / 2,
    b = (WINDOW.z[1] - WINDOW.z[0]) / 2;
  for (const h of [0.05, 0.1, 0.5, 1, 5]) {
    const aperture = windowAtY(h),
      p = [0.3, 0, 1.5];
    const exact =
      2 *
      ((a / Math.hypot(h, a)) * Math.atan(b / Math.hypot(h, a)) +
        (b / Math.hypot(h, b)) * Math.atan(a / Math.hypot(h, b)));
    const coarse = windowAtPoint(
      p,
      [0, 1, 0],
      { columns: 4, rows: 4 },
      () => true,
      aperture,
    ).diffuse;
    const fine = windowAtPoint(
      p,
      [0, 1, 0],
      { columns: 12, rows: 12 },
      () => true,
      aperture,
    ).diffuse;
    near(coarse, exact);
    near(fine, exact);
    assert.ok(coarse < Math.PI);
    near(
      windowDiffuseIntegral(aperture.reference, [0, 1, 0], aperture),
      windowDiffuseIntegral(WINDOW.reference, [0, 1, 0]),
    );
    for (const n of [
      [0, 0, 1],
      [1, 0, 0],
      [0, -1, 0],
    ]) {
      const part = windowAtPoint(p, n, {}, () => true, aperture).diffuse;
      near(part, windowDiffuseIntegral(p, n, aperture));
      assert.ok(Number.isFinite(part) && part >= 0 && part < Math.PI);
    }
  }
});
test("solar beam keeps its intensity while visible and disappears when the aperture excludes it", () => {
  const p = [0.3, 0, 1.1],
    n = [0, 1, 0];
  const close = windowAtPoint(p, n, {}, () => true, windowAtY(0.1));
  const nearWindow = windowAtPoint(p, n, {}, () => true, windowAtY(0.3));
  const far = windowAtPoint(p, n, {}, () => true, windowAtY(5));
  near(close.beam, nearWindow.beam);
  assert.ok(close.beam > 0.8);
  near(far.beam, 0);
});
test("at 5 m less daylight reaches the plant, while near-window shadows remain finite", () => {
  const mean = (scene, result) =>
    result.leaves.reduce(
      (sum, l) =>
        sum +
        scene.leafGeometry.leaves[l.id].area *
          Math.max(...l.sides.map((s) => windowDose(s, state))),
      0,
    ) / scene.leafGeometry.area;
  const close = buildLuminaireScene({ ...state, windowDistance: 5 }, pose),
    far = buildLuminaireScene({ ...state, windowDistance: 500 }, pose);
  const a = calculateWindowLight(close),
    b = calculateWindowLight(far);
  assert.ok(mean(close, a) > mean(far, b) * 5);
  for (const l of a.leaves)
    for (const side of l.sides)
      assert.ok(
        Number.isFinite(side.diffuse) && side.diffuse >= 0 && side.diffuse < 2,
      );
  const finer = calculateWindowLight(close, {
    patchSamples: 24,
    columns: 12,
    rows: 12,
  });
  assert.ok(
    Math.abs(mean(close, a) - mean(close, finer)) / mean(close, finer) < 0.1,
  );
});
