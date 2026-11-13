import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plantShapes } from "../src/data/plant-shapes.js";
import { cadAssets } from "../src/data/cad-assets.js";
import { normalizeFitting, changeFitting } from "../src/models/fitting.js";
import {
  crownGeometry,
  surfacePoint,
  rayCrown,
  crownLocal,
} from "../src/models/crown.js";
import { buildLeafGeometry } from "../src/models/leaf-geometry.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import { calculateLuminaire } from "../src/models/luminaire-light.js";
import {
  calculateWindowLight,
  windowDose,
} from "../src/models/window-light.js";
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const pose = JSON.parse(
  readFileSync(new URL("../data/cad/" + cadAssets.olive.file, import.meta.url)),
)[0];
const baseState = normalizeFitting({
  model: "olive",
  receiver: "leaves",
  plant: "lyrata",
  plantSize: 105,
  towerTurn: 0,
  jointMiddle: 0,
  jointTop: 0,
  windowWeather: "sunny",
  windowDistance: 100,
});

test("all plants rotate around their pot with unchanged area, height, identities and 360-degree closure", () => {
  for (const [id, spec] of Object.entries(plantShapes)) {
    const crown = crownGeometry({ plant: id, plantSize: spec.initial });
    crown.soil = [0.4, -0.2, 0.25];
    const original = buildLeafGeometry(crown, id, spec.initial, 10);
    const rotated = buildLeafGeometry(
      { ...crown, turn: 90 },
      id,
      spec.initial,
      10,
    );
    const full = buildLeafGeometry(
      { ...crown, turn: 360 },
      id,
      spec.initial,
      10,
    );
    assert.deepEqual(full, original, id + " 360° returns exactly");
    near(original.area, rotated.area);
    near(original.height, rotated.height);
    const check = (p, q) => {
      near(q[0] - crown.soil[0], -(p[1] - crown.soil[1]));
      near(q[1] - crown.soil[1], p[0] - crown.soil[0]);
      near(q[2], p[2]);
    };
    for (const [i, leaf] of original.leaves.entries()) {
      const turned = rotated.leaves[i];
      assert.equal(turned.id, leaf.id);
      assert.deepEqual(turned.patches, leaf.patches);
      near(turned.area, leaf.area);
      near(turned.inclination, leaf.inclination);
      check(leaf.base, turned.base);
      leaf.vein.forEach((p, j) => check(p, turned.vein[j]));
    }
    for (const [i, t] of original.triangles.entries())
      t.points.forEach((p, j) => check(p, rotated.triangles[i].points[j]));
    for (const [i, s] of original.stems.entries())
      s.points.forEach((p, j) => check(p, rotated.stems[i].points[j]));
    for (const [i, f] of original.decorations.entries())
      f.triangles.forEach((t, j) =>
        t.forEach((p, k) => check(p, rotated.decorations[i].triangles[j][k])),
      );
    near(
      rotated.bounds.max[0] - crown.soil[0],
      -(original.bounds.min[1] - crown.soil[1]),
    );
  }
});

test("saved rotation is bounded and survives reload while moving the window restores edge-based placement", () => {
  assert.equal(normalizeFitting().plantTurn, 0);
  assert.equal(normalizeFitting({ plantTurn: -10 }).plantTurn, 0);
  assert.equal(normalizeFitting({ plantTurn: 999 }).plantTurn, 360);
  assert.equal(normalizeFitting({ plantTurn: "bad" }).plantTurn, 0);
  const state = normalizeFitting({
    ...baseState,
    plantTurn: 95,
    windowWallY: 1.25,
  });
  const restored = normalizeFitting(JSON.parse(JSON.stringify(state)));
  assert.equal(
    changeFitting(restored, "model", restored.model).windowWallY,
    1.25,
  );
  assert.equal(changeFitting(restored, "windowDistance", 30).windowWallY, null);
  assert.equal(changeFitting(restored, "dim", 50).windowWallY, 1.25);
  assert.equal(restored.plantTurn, 95);
});

test("turning leaves keeps the window, lamp, chair and pot centre fixed and updates actual clearance", () => {
  const state = { ...baseState, lampDistance: 60 };
  const before = buildLuminaireScene(state, pose);
  const after = buildLuminaireScene(
    { ...state, plantTurn: 90, windowWallY: before.window.y },
    pose,
  );
  assert.deepEqual(after.sources, before.sources);
  assert.deepEqual(after.room.objects, before.room.objects);
  assert.deepEqual(after.crown.soil, before.crown.soil);
  near(after.window.y, before.window.y);
  near(after.window.gap, after.window.y - after.leafGeometry.bounds.max[1]);
  assert.notEqual(after.window.gap, before.window.gap);
});

test("rotated ellipsoid uses the same frame for its rendered samples, intersections and map bins", () => {
  const c = { rx: 2, ry: 1, rz: 3, center: [0.4, -0.2, 1], turn: 90 };
  const sample = surfacePoint(c, 0, 0);
  near(sample.p[0], 0.4);
  near(sample.p[1], 1.8);
  near(sample.normal[0], 0);
  near(sample.normal[1], 1);
  near(rayCrown([0.4, 3.8, 1], [0, -1, 0], c), 2);
  near(rayCrown([3.4, -0.2, 1], [-1, 0, 0], c), 2);
  const local = crownLocal(c, sample.p);
  near(local[0], 2);
  near(local[1], 0);
});

test("lamp and window light respond to orientation at unchanged PPF; full turn restores both", () => {
  const original = buildLuminaireScene(baseState, pose);
  const scenes = [
    original,
    ...[90, 360].map((plantTurn) =>
      buildLuminaireScene(
        { ...baseState, plantTurn, windowWallY: original.window.y },
        pose,
      ),
    ),
  ];
  const results = scenes.map((g) => calculateLuminaire(baseState, g, 8192));
  const daylight = scenes.map((g) => calculateWindowLight(g));
  assert.ok(
    Math.abs(
      results[0].leaves[0].sides[0].mean - results[1].leaves[0].sides[0].mean,
    ) > 0.5,
  );
  assert.ok(
    Math.abs(
      windowDose(daylight[0].leaves[0].sides[0], baseState) -
        windowDose(daylight[1].leaves[0].sides[0], baseState),
    ) > 0.5,
  );
  assert.deepEqual(results[0].output.fluxes, results[1].output.fluxes);
  assert.deepEqual(results[0].leaves, results[2].leaves);
  assert.deepEqual(daylight[0], daylight[2]);
  for (const r of results)
    for (const { budget: b } of r.metrics)
      near(b.target + b.room + b.screen + b.housing + b.residual, 1);
});
