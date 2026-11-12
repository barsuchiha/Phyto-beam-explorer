import { Shape, ShapeUtils } from "../vendor/three.module.min.js";
import { paths } from "../data/leaf-paths.js";
import { plantIllustration } from "./plant-illustration.js";
import { add, sub, mul } from "./crown.js";

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const triangleArea = (a, b, c) =>
  Math.hypot(...cross(sub(b, a), sub(c, a))) / 2;

// Our leaf outlines use only absolute M/L/Q/C/Z. No DOM or SVG renderer needed.
// Triangulation is shared by the visible leaves and their optical receivers.
export function outlineMesh(path) {
  const tokens = path.match(
    /[MLCQZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi,
  );
  const shape = new Shape();
  let i = 0;
  const numbers = (n) => Array.from({ length: n }, () => Number(tokens[i++]));
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M") shape.moveTo(...numbers(2));
    else if (command === "L") shape.lineTo(...numbers(2));
    else if (command === "Q") shape.quadraticCurveTo(...numbers(4));
    else if (command === "C") shape.bezierCurveTo(...numbers(6));
    else if (command === "Z") shape.closePath();
    else throw Error("Unsupported leaf outline command: " + command);
  }
  const points = shape.getPoints(16);
  if (points[0].equals(points.at(-1))) points.pop();
  return { points, faces: ShapeUtils.triangulateShape(points, []) };
}

function clip(poly, threshold, above) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const insideA = above ? a.t >= threshold : a.t <= threshold;
    const insideB = above ? b.t >= threshold : b.t <= threshold;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const f = (threshold - a.t) / (b.t - a.t);
      out.push({ t: threshold, p: add(a.p, mul(sub(b.p, a.p), f)) });
    }
  }
  return out;
}

export function buildLeafGeometry(crown, id, height) {
  const art = plantIllustration(id, height),
    sx = crown.rx / art.radius,
    sz = crown.height / art.top;
  const leaves = [],
    patches = [],
    triangles = [],
    decorations = [];
  const transform = (leaf, i, point) => {
    const length = Math.hypot(leaf.tx - leaf.x, leaf.ty - leaf.y),
      dx = (leaf.tx - leaf.x) / length,
      dz = (leaf.ty - leaf.y) / length;
    const depth = Math.sin(i * 2.399) * crown.ry * 0.55;
    const x = point.x,
      y = point.y;
    const px = leaf.path ? x : leaf.x + dz * x * leaf.w + dx * y * length;
    const pz = leaf.path ? y : leaf.y - dx * x * leaf.w + dz * y * length;
    const py = leaf.path
      ? depth * Math.min(1, pz)
      : depth * Math.min(1, y * 2) + x * crown.ry * 0.15;
    return [
      crown.soil[0] + px * sx,
      crown.soil[1] + py,
      crown.soil[2] + pz * sz,
    ];
  };
  [...art.leaves, ...art.flowers].forEach((leaf, i) => {
    const mesh = outlineMesh(leaf.path ?? paths[leaf.kind]);
    const coords = mesh.points.map((p) => transform(leaf, i, p));
    if (i >= art.leaves.length) {
      decorations.push({
        triangles: mesh.faces.map((f) => f.map((j) => coords[j])),
        color: leaf.color,
      });
      return; // Flowers remain illustrative, not photosynthetic receivers or occluders.
    }
    const lo = Math.min(...mesh.points.map((p) => p.y)),
      hi = Math.max(...mesh.points.map((p) => p.y));
    const entry = { id: i, area: 0, patches: [] };
    const zones = Array.from({ length: 4 }, (_, zone) => ({
      id: patches.length + zone,
      leaf: i,
      area: 0,
      triangles: [],
    }));
    for (const face of mesh.faces) {
      const poly = face.map((j) => ({
        p: coords[j],
        t: (mesh.points[j].y - lo) / (hi - lo),
      }));
      for (let zone = 0; zone < 4; zone++) {
        const polygon = clip(clip(poly, zone / 4, true), (zone + 1) / 4, false);
        for (let j = 1; j + 1 < polygon.length; j++) {
          const points = [polygon[0].p, polygon[j].p, polygon[j + 1].p];
          const area = triangleArea(...points);
          if (area < 1e-12) continue;
          zones[zone].triangles.push(points);
          zones[zone].area += area;
          triangles.push({ points, leaf: i, patch: zones[zone].id });
        }
      }
    }
    for (const zone of zones) {
      patches.push(zone);
      entry.patches.push(zone.id);
      entry.area += zone.area;
    }
    leaves.push(entry);
  });
  return {
    leaves,
    patches,
    triangles,
    decorations,
    area: leaves.reduce((s, l) => s + l.area, 0),
  };
}
