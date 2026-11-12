import { Shape, ShapeUtils } from "../vendor/three.module.min.js";
import { paths } from "../data/leaf-paths.js";
import { plantLayout, bladePoint } from "./plant-architecture.js";
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

const meshCache = new Map();
function curvedMesh(kind) {
  if (meshCache.has(kind)) return meshCache.get(kind);
  const mesh = outlineMesh(paths[kind]);
  const steps = kind === "strap" ? 16 : 8;
  const low = Math.min(...mesh.points.map((p) => p.y));
  const high = Math.max(...mesh.points.map((p) => p.y));
  const cut = (poly, axis, boundary, above) =>
    clip(
      poly.map((p) => ({ p, t: p[axis] })),
      boundary,
      above,
    ).map((v) => v.p);
  const cells = [];
  for (const face of mesh.faces) {
    const original = face.map((j) => [mesh.points[j].x, mesh.points[j].y, 0]);
    for (let band = 0; band < steps; band++) {
      let poly = cut(
        cut(original, 1, low + ((high - low) * band) / steps, true),
        1,
        low + ((high - low) * (band + 1)) / steps,
        false,
      );
      for (const side of [false, true]) {
        const half = cut(poly, 0, 0, side);
        for (let j = 1; j < half.length - 1; j++) {
          const t = [half[0], half[j], half[j + 1]];
          const normal = cross(sub(t[1], t[0]), sub(t[2], t[0]));
          if (Math.abs(normal[2]) < 1e-12) continue;
          if (normal[2] < 0) [t[1], t[2]] = [t[2], t[1]];
          cells.push({ points: t, zone: Math.floor((band * 4) / steps) });
        }
      }
    }
  }
  meshCache.set(kind, cells);
  return cells;
}

export function buildLeafGeometry(crown, id, height, tilt = 0) {
  const layout = plantLayout(id, height);
  // The height slider defines the default posture. Manual leaf rotation does
  // not rescale blades/petioles or silently change their receiving area.
  let top = 0;
  for (const leaf of [...layout.leaves, ...layout.flowers])
    for (const cell of curvedMesh(leaf.kind))
      for (const p of cell.points)
        top = Math.max(top, bladePoint(leaf, p[0], p[1])[2]);
  for (const stem of layout.stems)
    for (const p of stem.points) top = Math.max(top, p[2]);
  const scale = crown.height / top,
    soil = crown.soil ?? [crown.center[0], crown.center[1], 0];
  const world = (p) => p.map((v, i) => soil[i] + scale * v);
  const leaves = [],
    patches = [],
    triangles = [],
    decorations = [];
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const include = (p) =>
    p.forEach((v, i) => {
      bounds.min[i] = Math.min(bounds.min[i], v);
      bounds.max[i] = Math.max(bounds.max[i], v);
    });
  for (const [i, leaf] of layout.leaves.entries()) {
    const zones = Array.from({ length: 4 }, (_, z) => ({
      id: patches.length + z,
      leaf: i,
      area: 0,
      triangles: [],
    }));
    const entry = {
      id: i,
      area: 0,
      patches: [],
      pattern: leaf.pattern,
      base: world(leaf.base),
      pitch: leaf.pitch + tilt,
      bend: leaf.bend,
      group: leaf.group,
      pair: leaf.pair,
      vein: Array.from({ length: 17 }, (_, j) =>
        world(
          bladePoint(leaf, 0, leaf.attach + ((1 - leaf.attach) * j) / 16, tilt),
        ),
      ),
    };
    let angleSum = 0;
    for (const cell of curvedMesh(leaf.kind)) {
      const points = cell.points.map((p) =>
        world(bladePoint(leaf, p[0], p[1], tilt)),
      );
      const area = triangleArea(...points);
      if (area < 1e-12) continue;
      const n = cross(sub(points[1], points[0]), sub(points[2], points[0]));
      angleSum +=
        (area *
          Math.acos(Math.min(1, Math.abs(n[2]) / Math.hypot(...n))) *
          180) /
        Math.PI;
      points.forEach(include);
      const patch = zones[cell.zone];
      patch.triangles.push(points);
      patch.area += area;
      triangles.push({ points, leaf: i, patch: patch.id });
    }
    for (const zone of zones) {
      patches.push(zone);
      entry.patches.push(zone.id);
      entry.area += zone.area;
    }
    entry.inclination = angleSum / entry.area;
    leaves.push(entry);
  }
  const stems = layout.stems.map((s) => ({
    ...s,
    points: s.points.map(world),
  }));
  stems.forEach((s) => s.points.forEach(include));
  for (const flower of layout.flowers) {
    const tris = curvedMesh(flower.kind).map((cell) =>
      cell.points.map((p) => world(bladePoint(flower, p[0], p[1]))),
    );
    tris.forEach((t) => t.forEach(include));
    decorations.push({ triangles: tris, color: flower.color });
  }
  return {
    leaves,
    patches,
    triangles,
    decorations,
    stems,
    bounds,
    height: bounds.max[2] - soil[2],
    area: leaves.reduce((s, l) => s + l.area, 0),
  };
}
