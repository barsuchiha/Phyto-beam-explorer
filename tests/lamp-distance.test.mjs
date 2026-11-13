import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cadAssets } from "../src/data/cad-assets.js";
import { normalizeFitting } from "../src/models/fitting.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import { calculateLuminaire } from "../src/models/luminaire-light.js";
import { unit, add } from "../src/models/crown.js";

const near = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const poses = Object.fromEntries(
  Object.entries(cadAssets).map(([id, a]) => [
    id,
    JSON.parse(readFileSync(new URL("../data/cad/" + a.file, import.meta.url))),
  ]),
);
const oliveState = normalizeFitting({
  model: "olive",
  plant: "lyrata",
  plantSize: 105,
  receiver: "leaves",
  towerTurn: 0,
  jointMiddle: 0,
  jointTop: 0,
  windowDistance: 150,
});

test("every CAD pose moves its emitters without moving the plant or window and stays inside the room", () => {
  for (const [model, options] of Object.entries(poses))
    for (const [poseIndex, pose] of options.entries()) {
      const state = normalizeFitting({
        model,
        pose: poseIndex,
        windowDistance: 150,
      });
      const base = buildLuminaireScene(state, pose);
      for (const distance of [0, 500]) {
        const scene = buildLuminaireScene(
          { ...state, lampDistance: distance },
          pose,
        );
        near(scene.window.y, base.window.y);
        assert.deepEqual(scene.leafGeometry, base.leafGeometry, model);
        near(scene.window.y - scene.lampPlacement.back, distance / 100);
        assert.ok(scene.lampPlacement.front > scene.room.bounds.min[1]);
        assert.equal(
          scene.room.objects.find((o) => o.id === "open-front").coordinate,
          scene.room.bounds.min[1],
        );
        assert.equal(
          scene.room.objects.find((o) => o.id === "floor").ranges[1][0],
          scene.room.bounds.min[1],
        );
        for (const [i, source] of scene.sources.entries()) {
          near(source.p[1] - base.sources[i].p[1], scene.lampPlacement.y);
          near(source.p[0], base.sources[i].p[0]);
          near(source.p[2], base.sources[i].p[2]);
          assert.deepEqual(source.n, base.sources[i].n);
        }
        for (const key of ["boards", "surfaces"])
          for (const [i, surface] of scene[key].entries())
            for (const p of ["a", "b", "c", "d"])
              near(surface[p][1] - base[key][i][p][1], scene.lampPlacement.y);
      }
    }
});

test("distance persists when the window moves, while old saves and reset retain their original placement", () => {
  assert.equal(normalizeFitting().lampDistance, null);
  assert.equal(normalizeFitting({ lampDistance: -20 }).lampDistance, 0);
  assert.equal(normalizeFitting({ lampDistance: 999 }).lampDistance, 500);
  assert.equal(normalizeFitting({ lampDistance: "bad" }).lampDistance, 100);
  const scenes = [5, 500].map((windowDistance) =>
    buildLuminaireScene(
      { ...oliveState, windowDistance, lampDistance: 25 },
      poses.olive[0],
    ),
  );
  for (const scene of scenes)
    near(scene.window.y - scene.lampPlacement.back, 0.25);
  near(scenes[1].lampPlacement.y - scenes[0].lampPlacement.y, 4.95);
  assert.deepEqual(scenes[0].crown, scenes[1].crown);
  near(
    buildLuminaireScene({ ...oliveState, lampDistance: null }, poses.olive[0])
      .lampPlacement.y,
    0,
  );
});

test("translated olive housing intercepts the same local rays, including clear panels and reflective cavities", () => {
  const base = buildLuminaireScene(oliveState, poses.olive[0]);
  const moved = buildLuminaireScene(
    { ...oliveState, lampDistance: 30 },
    poses.olive[0],
  );
  let hits = 0;
  for (const source of base.sources)
    for (const d of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [1, 1, 0.2],
      [1, -1, -0.2],
    ]) {
      const direction = unit(d);
      const a = base.fixture.hit(source.p, direction);
      const b = moved.fixture.hit(
        add(source.p, [0, moved.lampPlacement.y, 0]),
        direction,
      );
      assert.equal(Boolean(a), Boolean(b));
      if (!a) continue;
      hits++;
      near(a.distance, b.distance);
      assert.equal(a.kind, b.kind);
      assert.deepEqual(a.n, b.n);
      assert.equal(a.transmission, b.transmission);
    }
  assert.ok(hits > 12);
});

test("moving the lamp changes leaf light at the same PPF and keeps photon accounting closed", () => {
  const s = { ...oliveState, windowDistance: null };
  const base = buildLuminaireScene(s, poses.olive[0]);
  const far = buildLuminaireScene({ ...s, lampDistance: 500 }, poses.olive[0]);
  const a = calculateLuminaire(s, base, 8192),
    b = calculateLuminaire(s, far, 8192);
  assert.deepEqual(a.output.fluxes, b.output.fluxes);
  assert.ok(a.mean > b.mean * 5);
  for (const result of [a, b])
    for (const { budget: p } of result.metrics)
      near(p.target + p.room + p.screen + p.housing + p.residual, 1);
  const crossing = buildLuminaireScene(
    { ...oliveState, plantOffset: -50, lampDistance: 160 },
    poses.olive[0],
  );
  assert.equal(crossing.collision, true);
});
