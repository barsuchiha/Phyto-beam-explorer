import { plantShapes } from "../data/plant-shapes.js";
import { photometry } from "./photometry.js";
import { wallDistance } from "./screen-geometry.js";

export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const mul = (a, s) => a.map((v) => v * s);
export const unit = (a) => mul(a, 1 / Math.hypot(...a));
const rad = (d) => (d * Math.PI) / 180;

export function crownGeometry(state) {
  const spec = plantShapes[state.plant],
    height = (state.plantSize ?? spec.initial) / 100;
  const rx = (height * spec.width) / 2,
    ry = rx * spec.depth,
    rz = (height * spec.crown) / 2;
  return { height, rx, ry, rz, center: [0, 0, height - rz], spec };
}
export function surfacePoint(c, mu, phi) {
  const q = Math.sqrt(Math.max(0, 1 - mu * mu));
  const s = [q * Math.cos(phi), q * Math.sin(phi), mu];
  const p = add(c.center, [c.rx * s[0], c.ry * s[1], c.rz * s[2]]);
  const gradient = [s[0] / c.rx, s[1] / c.ry, s[2] / c.rz];
  return {
    p,
    normal: unit(gradient),
    jacobian: c.rx * c.ry * c.rz * Math.hypot(...gradient),
  };
}
export function surfaceSamples(c, n, nz = 40, na = 72) {
  const samples = [];
  for (let i = 0; i < nz; i++)
    for (let j = 0; j < na; j++) {
      const mu = -1 + (2 * (i + 0.5)) / nz,
        phi = (2 * Math.PI * (j + 0.5)) / na;
      const s = surfacePoint(c, mu, phi);
      if (dot(s.normal, n) <= 1e-10) continue;
      samples.push({
        ...s,
        i,
        j,
        area: (((s.jacobian * 2) / nz) * 2 * Math.PI) / na,
      });
    }
  return { samples, nz, na };
}
export function createRig(state, groups, crown) {
  const a = rad(state.orbit ?? 0),
    n = [Math.sin(a), 0, Math.cos(a)];
  const u = [Math.cos(a), 0, -Math.sin(a)],
    v = [0, 1, 0],
    f = mul(n, -1);
  // A tangent support plane keeps the whole untilted source outside the crown.
  const support = Math.hypot(crown.rx * n[0], crown.rz * n[2]);
  const origin = add(crown.center, mul(n, support + state.height / 100));
  const radius =
    Math.max(
      ...groups.map((g) =>
        Math.hypot(Math.abs(g.x) + g.w / 2, Math.abs(g.y) + g.d / 2),
      ),
    ) + 0.015;
  const length = Math.min(
    (state.screenDepth ?? 15) / 100,
    Math.max(0, state.height / 100 - 0.05),
  );
  const opening = state.screenOpening ?? 0,
    half = rad(opening / 2),
    depth = length * Math.cos(half);
  return {
    origin,
    n,
    u,
    v,
    f,
    radius,
    depth,
    length,
    opening,
    slope: Math.tan(half),
    mouthRadius: radius + length * Math.sin(half),
    sector: state.screenSector ?? 0,
    turn: state.screenTurn ?? 0,
    support,
  };
}
export const toWorld = (rig, p) =>
  add(
    rig.origin,
    add(mul(rig.u, p[0]), add(mul(rig.v, p[1]), mul(rig.f, p[2]))),
  );
export function sourceSamples(groups, rig) {
  return photometry.sampleEmitters(groups, 0, 0).map((e) => ({
    p: toWorld(rig, [e.x, e.y, 0]),
    local: [e.x, e.y, 0],
    weight: e.weight,
  }));
}
export function intensity(curve, mu, phi = 0) {
  if (typeof curve === "object")
    return curve.normalizedIntensity(
      Math.acos(Math.max(-1, Math.min(1, mu))),
      phi,
    );
  if (mu <= 0) return 0;
  if (curve === "lm301b")
    return (
      photometry.curveNorm * photometry.relative(Math.acos(Math.min(1, mu)))
    );
  const n = Math.log(0.5) / Math.log(Math.cos(rad(curve / 2)));
  return ((n + 1) / (2 * Math.PI)) * Math.pow(mu, n);
}
// Shared wall intersection for direct occlusion and reflected photon transport.
export function screenHit(origin, d, rig) {
  return wallDistance(...origin, ...d, rig);
}
export function rayCrown(origin, d, c) {
  const p = sub(origin, c.center),
    r = [c.rx, c.ry, c.rz];
  let a = 0,
    b = 0,
    cc = -1;
  for (let i = 0; i < 3; i++) {
    a += (d[i] / r[i]) ** 2;
    b += (p[i] * d[i]) / r[i] ** 2;
    cc += (p[i] / r[i]) ** 2;
  }
  const disc = b * b - a * cc;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t > 1e-9 ? t : Infinity;
}
export function field3D(receiver, emitters, rig, curve, flux) {
  if (!flux) return 0;
  let value = 0;
  for (const e of emitters) {
    const dx = receiver.p[0] - e.p[0],
      dy = receiver.p[1] - e.p[1],
      dz = receiver.p[2] - e.p[2];
    const r2 = dx * dx + dy * dy + dz * dz,
      distance = Math.sqrt(r2);
    const x = dx / distance,
      y = dy / distance,
      z = dz / distance;
    const receive = -(
      receiver.normal[0] * x +
      receiver.normal[1] * y +
      receiver.normal[2] * z
    );
    if (receive <= 0) continue;
    const lx = x * rig.u[0] + z * rig.u[2],
      ly = y,
      lz = x * rig.f[0] + z * rig.f[2];
    if (rig.sector && screenHit(e.local, [lx, ly, lz], rig) < distance)
      continue;
    value +=
      (flux * e.weight * intensity(curve, lz, Math.atan2(ly, lx)) * receive) /
      r2;
  }
  return value;
}
export function summarizeCrown(
  crown,
  rig,
  groups,
  curve,
  flux,
  resolution = 1,
) {
  const emitters = sourceSamples(groups, rig);
  const mesh = surfaceSamples(crown, rig.n, 40 * resolution, 72 * resolution);
  let sum = 0,
    area = 0;
  const samples = mesh.samples.map((s) => {
    const value = field3D(s, emitters, rig, curve, flux);
    sum += value * s.area;
    area += s.area;
    return { ...s, value };
  });
  const n = rig.n,
    radius = 1 / Math.sqrt((n[0] / crown.rx) ** 2 + (n[2] / crown.rz) ** 2);
  const q = mul(n, radius);
  const receiver = {
    p: add(crown.center, q),
    normal: unit([q[0] / crown.rx ** 2, 0, q[2] / crown.rz ** 2]),
  };
  return {
    mean: sum / area,
    center: field3D(receiver, emitters, rig, curve, flux),
    samples,
    area,
    nz: mesh.nz,
    na: mesh.na,
    centerPoint: receiver.p,
  };
}
export function photonBudget(crown, rig, groups, curve, flux, resolution = 1) {
  if (!flux) return { target: 0, screen: 0, room: 0, quadrature: 1 };
  const source = sourceSamples(groups, rig);
  // Deterministic equal-weight quantiles of the finite-source photon distribution.
  const emitters = [];
  let idx = 0,
    acc = source[0].weight;
  const count = 12 * resolution;
  for (let k = 0; k < count; k++) {
    const q = (k + 0.5) / count;
    while (acc < q && idx < source.length - 1) acc += source[++idx].weight;
    emitters.push(source[idx]);
  }
  let target = 0,
    screen = 0,
    room = 0;
  const nm = 48 * resolution,
    np = 96 * resolution,
    solid = (4 * Math.PI) / (nm * np * count);
  for (let i = 0; i < nm; i++)
    for (let j = 0; j < np; j++) {
      const mu = -1 + (2 * (i + 0.5)) / nm,
        phi = (2 * Math.PI * (j + 0.5)) / np,
        q = Math.sqrt(1 - mu * mu);
      const local = [q * Math.cos(phi), q * Math.sin(phi), mu];
      const weight = intensity(curve, mu, phi) * solid;
      if (!weight) continue;
      const d = add(
        mul(rig.u, local[0]),
        add(mul(rig.v, local[1]), mul(rig.f, local[2])),
      );
      for (const e of emitters) {
        const wall = screenHit(e.local, local, rig),
          hit = rayCrown(e.p, d, crown);
        if (Number.isFinite(wall) && wall < hit) screen += weight;
        else if (Number.isFinite(hit)) target += weight;
        else room += weight;
      }
    }
  const total = target + screen + room;
  // Correct only angular quadrature error; blocked photons remain in the budget.
  return {
    target: target / total,
    screen: screen / total,
    room: room / total,
    quadrature: total,
  };
}
