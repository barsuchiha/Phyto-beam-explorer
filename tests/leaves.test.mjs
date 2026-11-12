import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plantShapes } from "../src/data/plant-shapes.js";
import { plantIllustration } from "../src/models/plant-illustration.js";
import {
  buildLeafGeometry,
  triangleArea,
} from "../src/models/leaf-geometry.js";
import { buildLeafBVH, hitLeaves } from "../src/models/leaf-bvh.js";
import { crownGeometry } from "../src/models/crown.js";
import { normalizeFitting, changeFitting } from "../src/models/fitting.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import {
  calculateLuminaire,
  tracePath,
} from "../src/models/luminaire-light.js";
import { cadAssets } from "../src/data/cad-assets.js";

function receiver(shapes) {
  const patches = shapes.map((triangles, id) => ({
    id,
    leaf: id,
    triangles,
    area: triangles.reduce((a, t) => a + triangleArea(...t), 0),
  }));
  return {
    patches,
    triangles: patches.flatMap((p) =>
      p.triangles.map((points) => ({ points, patch: p.id, leaf: p.leaf })),
    ),
    leaves: patches.map((p) => ({ id: p.leaf, area: p.area, patches: [p.id] })),
  };
}
const square = (r, z) => [
  [
    [-r, -r, z],
    [r, -r, z],
    [r, r, z],
  ],
  [
    [-r, -r, z],
    [r, r, z],
    [-r, r, z],
  ],
];
const source = {
  p: [0, 0, 2],
  n: [0, 0, -1],
  u: [1, 0, 0],
  v: [0, 1, 0],
  w: 1e-9,
  d: 1e-9,
};
const sphere = { center: [0, 0, 0], rx: 0.5, ry: 0.5, rz: 0.5 };
const state = normalizeFitting({
  model: "A2",
  mount: "large",
  source: "mf36",
  receiver: "leaves",
  dim: 100,
});

test("all 20 displayed plants share finite leaf triangles, zones and physical surface areas", () => {
  for (const [id, p] of Object.entries(plantShapes)) {
    for (const height of [p.min, p.initial, p.max]) {
      const c = crownGeometry({ plant: id, plantSize: height });
      c.soil = [0.1, 0.2, 0.3];
      const g = buildLeafGeometry(c, id, height);
      assert.equal(
        g.leaves.length,
        plantIllustration(id, height).leaves.length,
      );
      assert.ok(g.area > 0);
      assert.ok(
        g.triangles.every((t) => t.points.flat().every(Number.isFinite)),
      );
      assert.ok(g.patches.every((p) => p.area > 0));
      assert.ok(
        Math.abs(
          g.area -
            g.triangles.reduce((sum, t) => sum + triangleArea(...t.points), 0),
        ) < 1e-10,
      );
      const doubled = buildLeafGeometry(
        {
          ...c,
          rx: c.rx * 2,
          ry: c.ry * 2,
          height: c.height * 2,
          soil: c.soil.map((v) => v * 2),
        },
        id,
        height,
      );
      assert.ok(Math.abs(doubled.area / g.area - 4) < 1e-10);
    }
  }
});
test("first-hit leaves cast mutual shadows on both sides, and gaps do not hit an imaginary shell", () => {
  const mesh = receiver([square(0.5, 1), square(1, 0)]),
    bvh = buildLeafBVH(mesh.triangles);
  assert.equal(hitLeaves(bvh, [0, 0, 2], [0, 0, -1]).leaf, 0);
  assert.equal(hitLeaves(bvh, [0.75, 0, 2], [0, 0, -1]).leaf, 1);
  assert.equal(hitLeaves(bvh, [0, 0, -1], [0, 0, 1]).leaf, 1);
  assert.equal(hitLeaves(bvh, [0, 0, 2], [0, 0, -1]).side, 0);
  assert.equal(hitLeaves(bvh, [0, 0, -1], [0, 0, 1]).side, 1);
  assert.equal(hitLeaves(bvh, [2, 0, 2], [0, 0, -1]), null);
  const empty = tracePath(
    { leafReceiver: true, leafBVH: null, crown: sphere, triangles: [] },
    [0, 0, 2],
    [0, 0, -1],
    "absorb",
    0,
  );
  assert.equal(empty.kind, "room");
  assert.equal(normalizeFitting({}).receiver, "crown");
  assert.equal(normalizeFitting({ receiver: "invalid" }).receiver, "crown");
  assert.equal(
    normalizeFitting(
      JSON.parse(JSON.stringify(changeFitting(state, "receiver", "leaves"))),
    ).receiver,
    "leaves",
  );
});
test("Lambertian disk interception matches R²/(R²+h²); map and both-face means conserve incident PPF", () => {
  const disk = Array.from({ length: 256 }, (_, i) => [
    [0, 0, 0],
    [
      0.5 * Math.cos((i * 2 * Math.PI) / 256),
      0.5 * Math.sin((i * 2 * Math.PI) / 256),
      0,
    ],
    [
      0.5 * Math.cos(((i + 1) * 2 * Math.PI) / 256),
      0.5 * Math.sin(((i + 1) * 2 * Math.PI) / 256),
      0,
    ],
  ]);
  const scene = {
    sources: [source],
    surfaces: [],
    boards: [],
    crown: sphere,
    leafGeometry: receiver([disk]),
  };
  const r = calculateLuminaire(state, scene, 131072),
    m = r.metrics[r.middle];
  assert.ok(Math.abs(m.budget.target - 0.25 / 4.25) < 0.0002);
  assert.ok(Math.abs(r.mean * 2 - r.leaves[0].sides[0].mean) < 1e-10);
  assert.equal(r.leaves[0].sides[1].mean, 0);
  for (const [k, metric] of r.metrics.entries()) {
    const incident = r.leaves.reduce(
      (sum, leaf) =>
        sum + leaf.area * leaf.sides.reduce((s, side) => s + side.values[k], 0),
      0,
    );
    assert.ok(Math.abs(incident - metric.budget.target * metric.flux) < 1e-10);
  }
  assert.ok(
    Math.abs(
      r.bins.reduce((a, b) => a + b.area * b.ppfd, 0) -
        m.budget.target * m.flux,
    ) < 1e-10,
  );
});
test("tilted leaf PPFD agrees with independent receiver-area quadrature including both cosines", () => {
  const angle = Math.PI / 4,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const mesh = square(0.5, 0).map((tri) =>
    tri.map(([x, y]) => [c * x, y, -s * x]),
  );
  const r = calculateLuminaire(
    state,
    {
      sources: [source],
      surfaces: [],
      boards: [],
      crown: sphere,
      leafGeometry: receiver([mesh]),
    },
    262144,
  );
  let reference = 0;
  const n = 100,
    flux = r.metrics[r.middle].flux;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = (i + 0.5) / n - 0.5,
        y = (j + 0.5) / n - 0.5,
        z = -s * x,
        dx = -c * x,
        dz = 2 - z,
        rr = dx * dx + y * y + dz * dz;
      reference +=
        ((flux / Math.PI) *
          (dz / Math.sqrt(rr)) *
          ((dx * s + dz * c) / Math.sqrt(rr))) /
        rr /
        (n * n);
    }
  assert.ok(Math.abs(r.leaves[0].sides[0].mean - reference) / reference < 0.01);
});
test("leaf photon budgets and coarse leaf means converge with reflective screens", () => {
  const data = JSON.parse(
    readFileSync(
      new URL("../data/cad/" + cadAssets.luna.file, import.meta.url),
    ),
  )[0];
  for (const material of ["absorb", "mirror", "diffuse"]) {
    const s = normalizeFitting({
      model: "luna",
      source: "mfE27_25",
      receiver: "leaves",
      screen: true,
      screenLength: 12,
      sector: 360,
      material,
      plant: "monstera",
      plantSize: 100,
    });
    const g = buildLuminaireScene(s, data),
      lo = calculateLuminaire(s, g, 65536),
      hi = calculateLuminaire(s, g, 262144);
    assert.ok(
      Math.abs(lo.mean - hi.mean) / hi.mean < 0.05,
      `${material}: ${lo.mean} / ${hi.mean}`,
    );
    for (const leaf of hi.leaves)
      for (let side = 0; side < 2; side++)
        if (leaf.sides[side].mean > 5)
          assert.ok(
            Math.abs(
              lo.leaves[leaf.id].sides[side].mean - leaf.sides[side].mean,
            ) /
              leaf.sides[side].mean <
              0.15,
          );
    for (const metric of hi.metrics) {
      const b = metric.budget;
      assert.ok(
        Math.abs(b.target + b.room + b.screen + b.housing + b.residual - 1) <
          1e-9,
      );
      assert.ok(b.returned <= b.target);
    }
    assert.ok(
      Math.abs(
        hi.bins.reduce((sum, b) => sum + b.ppfd * b.area, 0) -
          hi.mean * hi.area,
      ) < 1e-9,
    );
  }
});
