import { add, sub, mul, dot, unit } from "./crown.js";
import { buildLeafBVH, hitLeaves } from "./leaf-bvh.js";
import { triangleArea } from "./leaf-geometry.js";

// Design scenario, not a weather service or a measurement of the user's window.
// All photon levels are AFTER glazing. The luminous aperture is on the back wall.
import { WINDOW } from "./window-geometry.js";
export { WINDOW } from "./window-geometry.js";
export const WINDOW_PRESETS = {
  off: { label: "Без окна", diffuse: 0, beam: 0 },
  cloudy: { label: "Пасмурно", diffuse: 80, beam: 0 },
  sunny: { label: "Солнечно", diffuse: 200, beam: 600 },
};
export const WINDOW_FACTORS = [0.6, 1, 1.4];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sunDirections = [
  [-15, 25],
  [0, 35],
  [15, 25],
].map(([az, alt]) => {
  az *= Math.PI / 180;
  alt *= Math.PI / 180;
  return [
    Math.sin(az) * Math.cos(alt),
    Math.cos(az) * Math.cos(alt),
    Math.sin(alt),
  ];
});
export function windowSettings(state) {
  const preset = WINDOW_PRESETS[state.windowWeather] ?? WINDOW_PRESETS.off;
  const level = (state.windowLevel ?? 100) / 100;
  return {
    ...preset,
    diffuse: preset.diffuse * level,
    beam: preset.beam * level,
    hours: state.daylightHours ?? 10,
    sunHours: Math.min(state.sunHours ?? 3, state.daylightHours ?? 10),
    factors:
      preset === WINDOW_PRESETS.off || level === 0 ? [1] : WINDOW_FACTORS,
  };
}
export function windowDose(side, state) {
  if (!side) return 0;
  const s = windowSettings(state);
  return (
    0.0036 *
    (side.diffuse * s.diffuse * s.hours + side.beam * s.beam * s.sunHours)
  );
}
const corners = (x, z, y) => [
  [x[0], y, z[0]],
  [x[1], y, z[0]],
  [x[1], y, z[1]],
  [x[0], y, z[1]],
];
// Exact projected solid angle of a rectangular cell after clipping to the
// receiving face's hemisphere. This stays finite at a nearby area source.
function polygonIntegral(p, n, polygon) {
  const clipped = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = dot(n, sub(a, p)),
      db = dot(n, sub(b, p));
    if (da >= 0) clipped.push(a);
    if (da >= 0 !== db >= 0)
      clipped.push(add(a, mul(sub(b, a), da / (da - db))));
  }
  if (clipped.length < 3) return { weight: 0 };
  const directions = clipped.map((q) => unit(sub(q, p)));
  let weight = 0;
  for (let i = 0; i < directions.length; i++) {
    const a = directions[i],
      b = directions[(i + 1) % directions.length],
      c = cross(a, b),
      length = Math.hypot(...c);
    if (length > 1e-12)
      weight +=
        (dot(n, c) * Math.atan2(length, Math.max(-1, Math.min(1, dot(a, b))))) /
        length /
        2;
  }
  const center = clipped.reduce(
    (sum, q) => add(sum, mul(q, 1 / clipped.length)),
    [0, 0, 0],
  );
  return { weight: Math.abs(weight), center };
}
export function windowDiffuseIntegral(p, n, aperture = WINDOW) {
  if (p[1] >= aperture.y) return 0;
  return polygonIntegral(p, n, corners(aperture.x, aperture.z, aperture.y))
    .weight;
}
export function windowAtPoint(
  p,
  n,
  { columns = 6, rows = 6 } = {},
  visible = () => true,
  aperture = WINDOW,
) {
  if (p[1] >= aperture.y) return { diffuse: 0, beam: 0 };
  const depth = aperture.y - p[1];
  // Angular spacing concentrates visibility samples near the projection of a
  // close leaf. Each cell has an exact irradiance weight, not a point-source 1/r².
  const edges = (bounds, coordinate, count) => {
    const lo = Math.atan((bounds[0] - coordinate) / depth),
      hi = Math.atan((bounds[1] - coordinate) / depth);
    return Array.from(
      { length: count + 1 },
      (_, i) => coordinate + depth * Math.tan(lo + ((hi - lo) * i) / count),
    );
  };
  const xs = edges(aperture.x, p[0], columns),
    zs = edges(aperture.z, p[2], rows);
  let diffuse = 0,
    beam = 0;
  for (let x = 0; x < columns; x++)
    for (let z = 0; z < rows; z++) {
      const cell = polygonIntegral(
        p,
        n,
        corners([xs[x], xs[x + 1]], [zs[z], zs[z + 1]], aperture.y),
      );
      if (cell.weight <= 1e-14) continue;
      const delta = sub(cell.center, p),
        distance = Math.hypot(...delta),
        d = mul(delta, 1 / distance);
      if (visible(p, d, distance)) diffuse += cell.weight;
    }
  for (const d of sunDirections) {
    const distance = (aperture.y - p[1]) / d[1],
      q = add(p, mul(d, distance));
    if (
      distance > 0 &&
      q[0] >= aperture.x[0] &&
      q[0] <= aperture.x[1] &&
      q[2] >= aperture.z[0] &&
      q[2] <= aperture.z[1] &&
      dot(n, d) > 0 &&
      visible(p, d, distance)
    )
      beam += dot(n, d) / sunDirections.length;
  }
  return { diffuse, beam };
}
const radical = (index, base) => {
  let v = 0,
    f = 1 / base;
  while (index) {
    v += (index % base) * f;
    index = Math.floor(index / base);
    f /= base;
  }
  return v;
};
function samplePatch(patch, count) {
  const triangles = patch.triangles.map((points) => ({
    points,
    area: triangleArea(...points),
  }));
  const points = [];
  let j = 0,
    cumulative = triangles[0]?.area ?? 0;
  for (let i = 0; i < count && patch.area > 0; i++) {
    const target = ((i + 0.5) * patch.area) / count;
    while (cumulative < target && j < triangles.length - 1)
      cumulative += triangles[++j].area;
    const [a, b, c] = triangles[j].points,
      u = Math.sqrt(radical(i + 1, 2)),
      v = radical(i + 1, 3);
    points.push({
      p: add(mul(a, 1 - u), add(mul(b, u * (1 - v)), mul(c, u * v))),
      n: unit(cross(sub(b, a), sub(c, a))),
    });
  }
  return points;
}

// Backward visibility samples, independent of lamp power. Coefficients can be
// reused when weather, duration or brightness changes; no rays need retracing.
export function calculateWindowLight(
  scene,
  { patchSamples = 8, columns = 6, rows = 6 } = {},
) {
  const geometry = scene.leafGeometry;
  if (!geometry?.leaves.length) return { leaves: [] };
  const aperture = scene.window ?? WINDOW;
  const sampling = { columns, rows };
  const reference = windowDiffuseIntegral(
    aperture.reference,
    [0, 1, 0],
    aperture,
  );
  const leafBVH = buildLeafBVH(geometry.triangles);
  const blockers = buildLeafBVH(
    [...(scene.surfaces ?? []), ...(scene.boards ?? [])].flatMap((s) => [
      { points: [s.a, s.b, s.c] },
      { points: [s.a, s.c, s.d] },
    ]),
  );
  const visible = (p, d, distance) => {
    const origin = add(p, mul(d, 2e-6)),
      limit = distance - 4e-6;
    return (
      !hitLeaves(leafBVH, origin, d, limit) &&
      !hitLeaves(blockers, origin, d, limit) &&
      !scene.fixture?.hit(origin, d, limit) &&
      !scene.room?.hit(origin, d, limit)
    );
  };
  const leaves = geometry.leaves.map((leaf) => ({
    id: leaf.id,
    sides: [
      { diffuse: 0, beam: 0 },
      { diffuse: 0, beam: 0 },
    ],
  }));
  for (const patch of geometry.patches) {
    if (!patch.area) continue;
    const target = leaves.find((l) => l.id === patch.leaf),
      leaf = geometry.leaves.find((l) => l.id === patch.leaf);
    for (const { p, n } of samplePatch(patch, patchSamples))
      for (const side of [0, 1]) {
        const value = windowAtPoint(
          p,
          mul(n, side ? -1 : 1),
          sampling,
          visible,
          aperture,
        );
        const weight = patch.area / (leaf.area * patchSamples);
        target.sides[side].diffuse += (value.diffuse / reference) * weight;
        target.sides[side].beam += value.beam * weight;
      }
  }
  return { leaves, patchSamples, apertureSamples: columns * rows };
}
