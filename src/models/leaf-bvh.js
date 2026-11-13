// Two-sided first-hit triangle receiver. No leaf reflectance/transmission is
// claimed: a path terminates at its first leaf and records incident photons.
import { sub, dot, unit } from "./crown.js";
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function leafTriangle(points, data = {}) {
  const [a, b, c] = points,
    e1 = sub(b, a),
    e2 = sub(c, a);
  return {
    a,
    e1,
    e2,
    n: unit(cross(e1, e2)),
    min: a.map((_, i) => Math.min(a[i], b[i], c[i])),
    max: a.map((_, i) => Math.max(a[i], b[i], c[i])),
    ...data,
  };
}
export function buildLeafBVH(input) {
  const tris = input.map((t) =>
    leafTriangle(t.points, { leaf: t.leaf, patch: t.patch }),
  );
  function node(items) {
    // Dense compound foliage can exceed the JS engine's function argument limit.
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const t of items)
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], t.min[i]);
        max[i] = Math.max(max[i], t.max[i]);
      }
    if (items.length <= 8) return { min, max, items };
    const axis = [0, 1, 2].sort(
      (a, b) => max[b] - min[b] - (max[a] - min[a]),
    )[0];
    items.sort((a, b) => a.min[axis] + a.max[axis] - b.min[axis] - b.max[axis]);
    const middle = Math.floor(items.length / 2);
    return {
      min,
      max,
      left: node(items.slice(0, middle)),
      right: node(items.slice(middle)),
    };
  }
  return tris.length ? node(tris) : null;
}
function boxDistance(node, o, d, limit) {
  let near = 0,
    far = limit;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-14) {
      if (o[i] < node.min[i] - 1e-10 || o[i] > node.max[i] + 1e-10)
        return Infinity;
    } else {
      const a = (node.min[i] - o[i] - 1e-10) / d[i],
        b = (node.max[i] - o[i] + 1e-10) / d[i];
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (far < near) return Infinity;
    }
  }
  return near;
}
export function hitLeaves(bvh, o, d, limit = Infinity) {
  let distance = limit,
    triangle = null;
  function visit(node) {
    if (!node || boxDistance(node, o, d, distance) === Infinity) return;
    if (node.items) {
      for (const t of node.items) {
        const p = cross(d, t.e2),
          det = dot(t.e1, p);
        if (Math.abs(det) < 1e-14) continue;
        const s = sub(o, t.a),
          u = dot(s, p) / det;
        if (u < 0 || u > 1) continue;
        const q = cross(s, t.e1),
          v = dot(d, q) / det;
        if (v < 0 || u + v > 1) continue;
        const k = dot(t.e2, q) / det;
        if (k > 1e-7 && k < distance) {
          distance = k;
          triangle = t;
        }
      }
    } else {
      const a = boxDistance(node.left, o, d, distance),
        b = boxDistance(node.right, o, d, distance);
      if (a < b) {
        visit(node.left);
        visit(node.right);
      } else {
        visit(node.right);
        visit(node.left);
      }
    }
  }
  visit(bvh);
  return triangle
    ? {
        distance,
        leaf: triangle.leaf,
        patch: triangle.patch,
        side: dot(d, triangle.n) < 0 ? 0 : 1,
      }
    : null;
}
