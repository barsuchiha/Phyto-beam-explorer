import { buildLeafBVH } from "./leaf-bvh.js";
import { add, sub, dot } from "./crown.js";
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const overlaps = (a, b) =>
  a.min.every((v, i) => v <= b.max[i] + 1e-8 && a.max[i] >= b.min[i] - 1e-8);
const bounds = (points) => ({
  min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
  max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))),
});

// Separating-axis check for a leaf triangle and a convex optical quad.
// In-plane axes also handle coplanar contact; this is not a full CAD solid test.
function intersects(tri, quad) {
  const a = [tri.a, add(tri.a, tri.e1), add(tri.a, tri.e2)],
    b = quad.points;
  const ea = a.map((p, i) => sub(a[(i + 1) % 3], p)),
    eb = b.map((p, i) => sub(b[(i + 1) % 4], p));
  const axes = [
    tri.n,
    quad.n,
    ...ea.flatMap((x) => eb.map((y) => cross(x, y))),
    ...[...ea, ...eb].map((e) => cross(tri.n, e)),
  ];
  return axes.every((axis) => {
    const length = Math.hypot(...axis);
    if (length < 1e-12) return true;
    const n = axis.map((v) => v / length),
      av = a.map((p) => dot(p, n)),
      bv = b.map((p) => dot(p, n));
    return (
      Math.min(...av) <= Math.max(...bv) + 1e-8 &&
      Math.max(...av) >= Math.min(...bv) - 1e-8
    );
  });
}
export function leafSurfaceCollision(geometry, surfaces) {
  const quads = surfaces
    .map((s) => {
      const points = [s.a, s.b, s.c, s.d];
      return { points, n: s.n, ...bounds(points) };
    })
    .filter((q) => overlaps(geometry.bounds, q));
  if (!quads.length) return false;
  const bvh = buildLeafBVH(geometry.triangles);
  const visit = (node, q) =>
    node &&
    overlaps(node, q) &&
    (node.items
      ? node.items.some((t) => intersects(t, q))
      : visit(node.left, q) || visit(node.right, q));
  return quads.some((q) => visit(bvh, q));
}
