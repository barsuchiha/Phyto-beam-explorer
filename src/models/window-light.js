import { add, sub, mul, dot, unit } from "./crown.js";
import { buildLeafBVH, hitLeaves } from "./leaf-bvh.js";
import { triangleArea } from "./leaf-geometry.js";

// Design scenario, not a weather service or a measurement of the user's window.
// All photon levels are AFTER glazing. The luminous aperture is on the back wall.
export const WINDOW = {
  x: [-0.4, 1],
  y: 1.15,
  z: [0.7, 2.3],
  reference: [0.3, 0.65, 1.5], // 0.5 m inside, facing the centre of the window
};
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
function apertureSamples(columns, rows) {
  return Array.from({ length: columns * rows }, (_, i) => [
    WINDOW.x[0] +
      ((WINDOW.x[1] - WINDOW.x[0]) * ((i % columns) + 0.5)) / columns,
    WINDOW.y,
    WINDOW.z[0] +
      ((WINDOW.z[1] - WINDOW.z[0]) * (Math.floor(i / columns) + 0.5)) / rows,
  ]);
}
function apertureKernel(p, n, q) {
  const delta = sub(q, p),
    distance = Math.hypot(...delta),
    d = mul(delta, 1 / distance);
  // Radiance integral: receiver cosine × aperture cosine × dA / r².
  return {
    d,
    distance,
    weight:
      (Math.max(0, dot(n, d)) * Math.max(0, d[1])) / (distance * distance),
  };
}
export function windowAtPoint(p, n, samples, visible = () => true) {
  const area = (WINDOW.x[1] - WINDOW.x[0]) * (WINDOW.z[1] - WINDOW.z[0]);
  let diffuse = 0,
    beam = 0;
  for (const q of samples) {
    const k = apertureKernel(p, n, q);
    if (k.weight > 0 && visible(p, k.d, k.distance))
      diffuse += (k.weight * area) / samples.length;
  }
  for (const d of sunDirections) {
    const distance = (WINDOW.y - p[1]) / d[1],
      q = add(p, mul(d, distance));
    if (
      distance > 0 &&
      q[0] >= WINDOW.x[0] &&
      q[0] <= WINDOW.x[1] &&
      q[2] >= WINDOW.z[0] &&
      q[2] <= WINDOW.z[1] &&
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
  const samples = apertureSamples(columns, rows);
  const reference = windowAtPoint(WINDOW.reference, [0, 1, 0], samples).diffuse;
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
        const value = windowAtPoint(p, mul(n, side ? -1 : 1), samples, visible);
        const weight = patch.area / (leaf.area * patchSamples);
        target.sides[side].diffuse += (value.diffuse / reference) * weight;
        target.sides[side].beam += value.beam * weight;
      }
  }
  return { leaves, patchSamples, apertureSamples: samples.length };
}
