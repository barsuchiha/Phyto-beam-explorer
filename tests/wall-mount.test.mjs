import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cadAssets } from "../src/data/cad-assets.js";
import { luminaires, luminaireGroups } from "../src/data/luminaires.js";
import { normalizeFitting, changeFitting } from "../src/models/fitting.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import { calculateLuminaire } from "../src/models/luminaire-light.js";
import { WINDOW } from "../src/models/window-geometry.js";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const wallX = { V2: -0.14, B2: -0.13, luna: 0, archetto: 0, pinocchio: 0 };
const poses = Object.fromEntries(Object.keys(wallX).map((id) => [
  id, JSON.parse(readFileSync(new URL("../data/cad/" + cadAssets[id].file, import.meta.url))),
]));

test("all wall catalog models discard free placement from saves, controls and model changes", () => {
  assert.deepEqual(luminaireGroups.find((g) => g.id === "wall").models, Object.keys(wallX));
  for (const model of Object.keys(wallX)) {
    const saved = normalizeFitting({ model, lampDistance: 500 });
    assert.equal(saved.lampDistance, null);
    assert.equal(changeFitting(saved, "lampDistance", 250).lampDistance, null);
    const switched = changeFitting(normalizeFitting({ model: "olive", lampDistance: 500 }), "model", model);
    assert.equal(switched.lampDistance, null);
    const free = changeFitting(switched, "model", "olive");
    assert.equal(changeFitting(free, "lampDistance", 250).lampDistance, 250);
  }
});

test("every wall pose and head keeps its CAD mounting backs flush with the same bounded wall", () => {
  for (const [model, options] of Object.entries(poses))
    for (const [poseIndex, pose] of options.entries())
      for (const mount of luminaires[model].mounts) {
        const state = normalizeFitting({ model, pose: poseIndex, mount, plantSize: 45 });
        const base = buildLuminaireScene(state, pose);
        for (const windowDistance of [5, 500])
          for (const install of [50, 250]) {
            // Deliberately bypass normalisation to test the geometry constraint.
            const positioned = normalizeFitting({ ...state, windowDistance, install });
            const scene = buildLuminaireScene({ ...positioned, lampDistance: 500 }, pose);
            const wall = scene.room.objects.find((o) => o.id === "left-wall");
            near(wall.coordinate, wallX[model]);
            near(scene.room.bounds.min[0], wall.coordinate);
            assert.equal(scene.lampPlacement.wallMount.wall, wall.id);
            near(scene.lampPlacement.y, 0);
            assert.deepEqual(scene.leafGeometry, base.leafGeometry);
            for (const [i, source] of scene.sources.entries()) {
              near(source.p[0], base.sources[i].p[0]);
              near(source.p[1], base.sources[i].p[1]);
              assert.deepEqual(source.n, base.sources[i].n);
            }
            for (const name of luminaires[model].wallMountMeshes) {
              const mesh = pose.meshes.find((m) => m.name === name);
              near(Math.min(...mesh.v.filter((_, i) => i % 3 === 0)) / 10000, wall.coordinate);
              for (let i = 0; i < mesh.v.length; i += 3) {
                const y = mesh.v[i + 1] / 10000 + scene.lampPlacement.y;
                const z = mesh.v[i + 2] / 10000 + scene.zShift;
                assert.ok(y >= wall.ranges[0][0] && y <= wall.ranges[0][1]);
                assert.ok(z >= wall.ranges[1][0] && z <= wall.ranges[1][1]);
              }
            }
            for (const id of ["floor", "back-wall", "open-front", "open-top"])
              near(scene.room.objects.find((o) => o.id === id).ranges[0][0], wall.coordinate);
            near(wall.ranges[0][1], scene.window.y);
            assert.ok(scene.window.x[0] - 0.045 > wall.coordinate);
            near(scene.window.x[1] - scene.window.x[0], WINDOW.x[1] - WINDOW.x[0]);
            near(scene.window.reference[0], (scene.window.x[0] + scene.window.x[1]) / 2);
            const hit = scene.room.hit([wall.coordinate + 0.02, 0, 1], [-1, 0, 0]);
            assert.equal(hit.receiver, "walls");
            near(hit.distance, 0.02);
          }
      }
});

test("fixed walls reject intersecting leaves and conserve photons for a plant clear of the wall", () => {
  for (const model of Object.keys(wallX)) {
    const state = normalizeFitting({ model, plantOffset: 60, plantSize: 45 });
    const scene = buildLuminaireScene(state, poses[model][0]);
    assert.equal(scene.roomCollision, null, model);
    assert.equal(scene.collision, false, model);
    const result = calculateLuminaire(state, scene, 2048);
    assert.ok(result.mean > 0, model);
    for (const { budget: p } of result.metrics)
      near(p.target + p.room + p.screen + p.housing + p.residual, 1);
    const crossing = buildLuminaireScene({ ...state, plantOffset: -60 }, poses[model][0]);
    assert.equal(crossing.roomCollision, "boundary", model);
  }
});
