import { buildLeafBVH, hitLeaves, leafTriangle } from "./leaf-bvh.js";
import { add, sub } from "./crown.js";

export const OLIVE_STEP = 0.418;
export const OLIVE_PRESETS = {
  toward: [0, 0, 0],
  cad: [0, 45, 45],
  alternate: [0, 120, -120],
};
export function oliveAngles(state) {
  return [
    state.towerTurn,
    state.towerTurn + state.jointMiddle,
    state.towerTurn + state.jointMiddle + state.jointTop,
  ];
}
export function rotateZ(p, degrees) {
  const a = (degrees * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}
export const olivePoint = (p, angle, block = 0) =>
  add(rotateZ(p, angle + 90), [0, 0, block * OLIVE_STEP]);

const cache = new WeakMap();
function fixtureTemplate(pose) {
  if (cache.has(pose)) return cache.get(pose);
  const triangles = [];
  for (const m of pose.opticalMeshes) {
    for (let i = 0; i < m.t.length; i += 3) {
      const points = m.t
        .slice(i, i + 3)
        .map((k) => m.v.slice(k * 3, k * 3 + 3).map((v) => v / 10000));
      let n = leafTriangle(points).n;
      // Inner metal reflects from the cavity; the olive exterior absorbs in
      // this model. Orient the inner skin toward the central axis.
      if (m.kind === "screen" && n[0] * points[0][0] + n[1] * points[0][1] > 0)
        n = n.map((x) => -x);
      triangles.push({ points, kind: m.kind, n });
    }
  }
  const bvh = buildLeafBVH(
    triangles.map((t, patch) => ({ points: t.points, patch })),
  );
  const result = { triangles, bvh };
  cache.set(pose, result);
  return result;
}

function quad(points, kind = "housing") {
  const [a, b, c, d] = points;
  return { a, b, c, d, kind };
}

export function oliveAssembly(state, pose) {
  const angles = oliveAngles(state),
    template = fixtureTemplate(pose);
  const sources = angles.flatMap((angle, block) =>
    [-0.0795, 0.0795].map((dz) => ({
      p: olivePoint([0, -0.012, 0.254 + dz], angle, block),
      n: rotateZ([0, -1, 0], angle + 90),
      u: [0, 0, 1],
      v: rotateZ([1, 0, 0], angle + 90),
      block,
    })),
  );
  // New internal 32 x 20 x 330 mm cassette, replacing the symbolic Ø17 tube.
  const holders = [],
    collisionSurfaces = [];
  for (const [block, angle] of angles.entries()) {
    const world = (p) => olivePoint(p, angle, block);
    const corners = [
      [-0.016, -0.011, 0.089],
      [0.016, -0.011, 0.089],
      [0.016, 0.009, 0.089],
      [-0.016, 0.009, 0.089],
      [-0.016, -0.011, 0.419],
      [0.016, -0.011, 0.419],
      [0.016, 0.009, 0.419],
      [-0.016, 0.009, 0.419],
    ].map(world);
    for (const face of [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0],
    ])
      holders.push(quad(face.map((i) => corners[i])));
    // Conservative outer envelope, used only for leaf / fixture collisions.
    for (let i = 0; i < 24; i++) {
      const point = (a, z) =>
        world([0.09 * Math.cos(a), 0.09 * Math.sin(a), z]);
      const a = (i * Math.PI) / 12,
        b = ((i + 1) * Math.PI) / 12;
      collisionSurfaces.push(
        quad([
          point(a, 0.054),
          point(b, 0.054),
          point(b, 0.454),
          point(a, 0.454),
        ]),
      );
    }
  }
  return {
    angles,
    sources,
    holders,
    collisionSurfaces,
    fixture: {
      hit(origin, direction, limit = Infinity) {
        let closest = null;
        for (const [block, angle] of angles.entries()) {
          const o = rotateZ(
            sub(origin, [0, 0, block * OLIVE_STEP]),
            -angle - 90,
          );
          const d = rotateZ(direction, -angle - 90);
          const hit = hitLeaves(template.bvh, o, d, limit);
          if (hit) {
            const t = template.triangles[hit.patch];
            limit = hit.distance;
            const outsideMetal =
              t.kind === "screen" &&
              d.reduce((s, v, i) => s + v * t.n[i], 0) > 0;
            closest = {
              distance: limit,
              kind: outsideMetal ? "housing" : t.kind,
              n: rotateZ(t.n, angle + 90),
              transmission:
                t.kind === "clear"
                  ? state.clearTransmission / 100
                  : state.slotTransmission / 100,
            };
          }
        }
        return closest;
      },
    },
  };
}
