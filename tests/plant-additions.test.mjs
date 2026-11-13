import { test } from "node:test";
import assert from "node:assert/strict";
import { paths, leafHoles } from "../src/data/leaf-paths.js";
import { outlineMesh, triangleArea } from "../src/models/leaf-geometry.js";
import { buildLeafBVH, hitLeaves } from "../src/models/leaf-bvh.js";
import { plantLayout } from "../src/models/plant-architecture.js";
import { plantShapes } from "../src/data/plant-shapes.js";

test("Monkey Mask fenestrations remove area and transmit rays through all six holes", () => {
  const mesh = (holes) => {
    const { points, faces } = outlineMesh(paths.perforated, holes);
    return faces.map((face) => ({
      points: face.map((i) => [points[i].x, points[i].y, 0]),
      leaf: 0,
      patch: 0,
    }));
  };
  const solid = mesh([]),
    cut = mesh(leafHoles.perforated);
  const area = (tris) =>
    tris.reduce((a, t) => a + triangleArea(...t.points), 0);
  assert.ok(area(cut) < area(solid) * 0.9);
  const bvh = buildLeafBVH(cut),
    solidBVH = buildLeafBVH(solid);
  for (const hole of leafHoles.perforated) {
    const center = [0, 1].map(
      (axis) => hole.reduce((s, p) => s + p[axis], 0) / hole.length,
    );
    assert.equal(hitLeaves(bvh, [...center, 1], [0, 0, -1]), null);
    assert.ok(hitLeaves(solidBVH, [...center, 1], [0, 0, -1]));
  }
  assert.ok(hitLeaves(bvh, [0, 0.5, 1], [0, 0, -1]), "midrib remains opaque");
});

test("palmate and trifoliate leaves attach their leaflets to a shared petiole", () => {
  for (const [id, n] of [
    ["schefflera", 7],
    ["pachira", 5],
    ["oxalis", 3],
  ]) {
    const { leaves } = plantLayout(id, plantShapes[id].initial);
    assert.equal(leaves.length % n, 0);
    for (let i = 0; i < leaves.length; i += n)
      for (let j = 1; j < n; j++)
        assert.deepEqual(leaves[i + j].base, leaves[i].base);
  }
  const pilea = plantLayout("pilea", 25).leaves;
  assert.ok(pilea.every((l) => l.attach === 0.5));
  assert.equal(plantLayout("nolina", 80).bodies.length, 2);
  const orchid = plantLayout("phalaenopsis", 18).leaves;
  assert.ok(orchid.every((l) => Math.abs(Math.sin(l.azimuth)) < 0.09));
});

// A dense canopy must not depend on the engine-specific spread-argument limit.
test("large receiver meshes build a BVH and retain first-hit visibility", () => {
  const tris = Array.from({ length: 140000 }, (_, i) => ({
    points: [
      [0, 0, i * 1e-5],
      [1, 0, i * 1e-5],
      [0, 1, i * 1e-5],
    ],
    leaf: i,
    patch: i,
  }));
  const bvh = buildLeafBVH(tris);
  assert.equal(hitLeaves(bvh, [0.2, 0.2, 2], [0, 0, -1]).leaf, tris.length - 1);
});
