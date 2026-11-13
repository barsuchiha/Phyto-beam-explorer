import { test } from "node:test";
import assert from "node:assert/strict";
import { plantShapes } from "../src/data/plant-shapes.js";
import { plantArchitecture } from "../src/data/plant-architecture.js";
import { plantLayout } from "../src/models/plant-architecture.js";
import { buildLeafGeometry } from "../src/models/leaf-geometry.js";
import { crownGeometry } from "../src/models/crown.js";
import { normalizeFitting, changeFitting } from "../src/models/fitting.js";
import { referenceDetector } from "../src/models/reference-light.js";
import { leafSurfaceCollision } from "../src/models/leaf-collision.js";
import { quad } from "../src/models/luminaire-scene.js";

const geometry = (id, height, tilt = 0) => {
  const c = crownGeometry({ plant: id, plantSize: height });
  c.soil = [0.1, 0.2, 0.15];
  return { c, g: buildLeafGeometry(c, id, height, tilt) };
};
test("all species have deterministic, connected 3D blades and a fixed-area manual tilt", () => {
  assert.deepEqual(Object.keys(plantArchitecture), Object.keys(plantShapes));
  for (const [id, spec] of Object.entries(plantShapes))
    for (const h of [spec.min, spec.initial, spec.max]) {
      const { c, g } = geometry(id, h);
      assert.ok(Math.abs(g.height - h / 100) < 1e-9, id + " nominal height");
      assert.ok(
        g.bounds.max[1] - g.bounds.min[1] > (0.02 * h) / 100,
        id + " spatial depth",
      );
      for (const leaf of g.leaves) {
        assert.ok(leaf.inclination >= 0 && leaf.inclination <= 90);
        assert.ok(
          leaf.base.every((v, i) => Math.abs(v - leaf.vein[0][i]) < 1e-12),
          id + " attached vein",
        );
      }
      for (const tilt of [-20, 20]) {
        const moved = buildLeafGeometry(c, id, h, tilt);
        assert.ok(
          moved.triangles.every((t) => t.points.flat().every(Number.isFinite)),
          id,
        );
        assert.ok(
          Math.abs(moved.area / g.area - 1) < 1e-10,
          id + " unchanged blade area",
        );
        // Arched outer blades may hang below the pot rim, as in spider plants.
        assert.ok(moved.bounds.min[2] >= 0, id + " above floor");
        assert.equal(
          referenceDetector({ crown: c, leafGeometry: moved }).center[2],
          moved.bounds.max[2],
        );
      }
    }
});

test("habit constraints distinguish swords, broad leaves, arched ribbons and pinnate pairs", () => {
  const average = (g) =>
    g.leaves.reduce((s, l) => s + l.inclination * l.area, 0) / g.area;
  assert.ok(average(geometry("snake", 60).g) > 65);
  assert.ok(average(geometry("monstera", 100).g) < 40);
  const spider = geometry("spider", 35).g;
  assert.ok(
    spider.leaves.some(
      (l) => l.vein[2][2] > l.vein[0][2] && l.vein.at(-1)[2] < l.vein.at(-3)[2],
    ),
  );
  for (const id of ["palm", "zz"]) {
    const layout = plantLayout(id, plantShapes[id].initial);
    const pairs = new Map();
    for (const l of layout.leaves)
      if (l.pair >= 0) {
        const key = l.group + ":" + l.pair;
        if (!pairs.has(key)) pairs.set(key, []);
        pairs.get(key).push(l);
      }
    for (const pair of pairs.values()) {
      assert.equal(pair.length, 2);
      assert.deepEqual(pair[0].base, pair[1].base);
    }
    assert.ok(pairs.size > 5);
  }
  const jade = plantLayout("jade", 50).leaves;
  for (let i = 0; i + 1 < jade.length; i += 2) {
    assert.deepEqual(jade[i].base, jade[i + 1].base);
    assert.ok(Math.abs(jade[i + 1].azimuth - jade[i].azimuth - Math.PI) < 1e-9);
  }
});

test("retired manual tilt migrates to species posture so the height remains literal", () => {
  assert.equal(normalizeFitting({}).leafTilt, 0);
  assert.equal(normalizeFitting({ leafTilt: 80 }).leafTilt, 0);
  assert.equal(normalizeFitting({ leafTilt: -80 }).leafTilt, 0);
  const s = normalizeFitting({ leafTilt: 15 });
  assert.equal(changeFitting(s, "plant", "snake").leafTilt, 0);
  assert.equal(changeFitting(s, "install", 160).leafTilt, 0);
  const c = crownGeometry({ ...s, plant: "strelitzia", plantSize: 150 });
  const g = buildLeafGeometry(c, "strelitzia", 150, s.leafTilt);
  assert.ok(Math.abs(g.height - 1.5) < 1e-9);
});

test("optical surfaces detect leaf contact outside the old crown, including coplanar contact", () => {
  const leaf = {
    triangles: [
      {
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        leaf: 0,
        patch: 0,
      },
    ],
    bounds: { min: [0, 0, 0], max: [1, 1, 0] },
  };
  assert.equal(
    leafSurfaceCollision(leaf, [
      quad([0.2, 0.2, -1], [0.3, 0.2, -1], [0.3, 0.2, 1], [0.2, 0.2, 1]),
    ]),
    true,
  );
  assert.equal(
    leafSurfaceCollision(leaf, [
      quad([0.2, 0.2, 0], [0.3, 0.2, 0], [0.3, 0.3, 0], [0.2, 0.3, 0]),
    ]),
    true,
  );
  assert.equal(
    leafSurfaceCollision(leaf, [
      quad([0.8, 0.8, 0], [1, 0.8, 0], [1, 1, 0], [0.8, 1, 0]),
    ]),
    false,
  );
  assert.equal(
    leafSurfaceCollision(leaf, [
      quad([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]),
    ]),
    false,
  );
});
