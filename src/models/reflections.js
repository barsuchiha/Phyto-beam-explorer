import { sourceSamples, intensity, toWorld } from "./crown.js";
import { wallDistance, wallNormal } from "./screen-geometry.js";

export const reflectionNames = {
  absorb: "Поглощающий",
  mirror: "Зеркальный",
  diffuse: "Матовый",
};
export const REFLECTION_RAYS = 131072;
export const MAX_BOUNCES = 64;
const TAU = 2 * Math.PI,
  EPS = 1e-8;
// Fixed low-discrepancy primary directions and decorrelated deterministic scatter.
function radical(index, base) {
  let v = 0,
    f = 1 / base;
  while (index) {
    v += (index % base) * f;
    index = Math.floor(index / base);
    f /= base;
  }
  return v;
}
function random(index) {
  let x = index | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export function bounceDirection(d, n, kind, a = 0.5, b = 0.5) {
  if (kind === "mirror") {
    const k = 2 * (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]);
    return [d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]];
  }
  const r = Math.sqrt(a),
    p = TAU * b,
    c = Math.sqrt(1 - a);
  // Orthonormal frame for a conical wall. Reduces to the old cylinder at nz=0.
  const h = Math.hypot(n[0], n[1]),
    tx = -n[1] / h,
    ty = n[0] / h,
    bx = -n[2] * ty,
    by = n[2] * tx;
  return [
    c * n[0] + r * (Math.cos(p) * tx + Math.sin(p) * bx),
    c * n[1] + r * (Math.cos(p) * ty + Math.sin(p) * by),
    c * n[2] + r * Math.sin(p) * h,
  ];
}
function geometry(c, rig, groups) {
  return {
    c,
    rig,
    groups,
    cs: rig.u[0],
    sn: -rig.f[0],
    distance:
      (rig.origin[0] - c.center[0]) * rig.n[0] +
      (rig.origin[2] - c.center[2]) * rig.n[2],
    ix: 1 / c.rx ** 2,
    iy: 1 / c.ry ** 2,
    iz: 1 / c.rz ** 2,
  };
}
function crownDistance(x, y, z, dx, dy, dz, g) {
  // Rotate the ray from lamp-local coordinates into the ellipsoid axes.
  const q = z - g.distance,
    px = g.cs * x - g.sn * q,
    pz = -g.sn * x - g.cs * q;
  const vx = g.cs * dx - g.sn * dz,
    vz = -g.sn * dx - g.cs * dz;
  const a = vx * vx * g.ix + dy * dy * g.iy + vz * vz * g.iz,
    b = px * vx * g.ix + y * dy * g.iy + pz * vz * g.iz;
  const cc = px * px * g.ix + y * y * g.iy + pz * pz * g.iz - 1,
    disc = b * b - a * cc;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t > EPS ? t : Infinity;
}
function boardDistance(x, y, z, dx, dy, dz, g) {
  if (dz >= -EPS || z <= EPS) return Infinity;
  const t = -z / dz,
    px = x + t * dx,
    py = y + t * dy;
  for (const a of g.groups) {
    const xx = (px - a.x) / (a.w / 2),
      yy = (py - a.y) / (a.d / 2);
    if (
      a.disc ? xx * xx + yy * yy <= 1 : Math.abs(xx) <= 1 && Math.abs(yy) <= 1
    )
      return t;
  }
  return Infinity;
}
// Endpoints: 0 crown, 1 escaped, 2 returned to an opaque board, 3 unresolved.
function trace(
  origin,
  d,
  g,
  kind,
  seed,
  maxBounces = MAX_BOUNCES,
  path = null,
) {
  let [x, y, z] = origin,
    [dx, dy, dz] = d,
    bounces = 0,
    first = 1;
  if (path) path.push([x, y, z]);
  for (;;) {
    const wall = wallDistance(x, y, z, dx, dy, dz, g.rig, EPS),
      target = crownDistance(x, y, z, dx, dy, dz, g);
    const board = bounces ? boardDistance(x, y, z, dx, dy, dz, g) : Infinity;
    const distance = Math.min(wall, target, board);
    if (!bounces)
      first =
        Number.isFinite(wall) && wall < target
          ? 2
          : Number.isFinite(target)
            ? 0
            : 1;
    if (!Number.isFinite(distance)) {
      if (path) path.push([x + dx * 2, y + dy * 2, z + dz * 2]);
      return { kind: 1, bounces, first, x, y, z };
    }
    x += distance * dx;
    y += distance * dy;
    z += distance * dz;
    if (path) path.push([x, y, z]);
    if (distance === target) return { kind: 0, bounces, first, x, y, z };
    if (distance === board) return { kind: 2, bounces, first, x, y, z };
    if (kind === "absorb") return { kind: 3, bounces: 1, first, x, y, z };
    bounces++;
    const normal = wallNormal(x, y, g.rig);
    [dx, dy, dz] = bounceDirection(
      [dx, dy, dz],
      normal,
      kind,
      random(seed + Math.imul(bounces, 0x9e3779b9)),
      random(seed ^ Math.imul(bounces, 0x6a09e667)),
    );
    x += dx * EPS * 4;
    y += dy * EPS * 4;
    z += dz * EPS * 4;
    if (bounces >= maxBounces) return { kind: 3, bounces, first, x, y, z };
  }
}
export function illustrativePath(c, rig, groups, d, kind, seed = 1) {
  const path = [];
  trace([0, 0, 0], d, geometry(c, rig, groups), kind, seed, 6, path);
  return path.map((p) => toWorld(rig, p));
}

let cachedKey = "",
  cachedTransport;
export function transport(c, rig, groups, rayCount = REFLECTION_RAYS) {
  const emitters = sourceSamples(groups, rig),
    geo = geometry(c, rig, groups);
  // Source power/weights and material reflectance don't change geometric paths.
  const key = JSON.stringify([
    c.rx,
    c.ry,
    c.rz,
    c.center,
    rig,
    groups.map((g) => [g.x, g.y, g.w, g.d, g.disc]),
    emitters.map((e) => e.local),
    rayCount,
  ]);
  if (key === cachedKey) return { ...cachedTransport, emitters };
  const source = new Uint32Array(rayCount),
    mu = new Float32Array(rayCount),
    phi = new Float32Array(rayCount),
    first = new Uint8Array(rayCount);
  const modes = {};
  for (const mode of ["mirror", "diffuse"])
    modes[mode] = {
      kind: new Uint8Array(rayCount),
      bounces: new Uint8Array(rayCount),
      mu: new Float32Array(rayCount),
      phi: new Float32Array(rayCount),
    };
  for (let i = 0; i < rayCount; i++) {
    source[i] = Math.min(
      emitters.length - 1,
      Math.floor(radical(i + 1, 5) * emitters.length),
    );
    mu[i] = 2 * radical(i + 1, 2) - 1;
    phi[i] = TAU * radical(i + 1, 3);
    const q = Math.sqrt(1 - mu[i] ** 2),
      d = [q * Math.cos(phi[i]), q * Math.sin(phi[i]), mu[i]];
    for (const mode of ["mirror", "diffuse"]) {
      const r = trace(emitters[source[i]].local, d, geo, mode, i + 1),
        out = modes[mode];
      first[i] = r.first;
      out.kind[i] = r.kind;
      out.bounces[i] = r.bounces;
      if (r.kind === 0 && r.bounces) {
        const q = r.z - geo.distance,
          wx = geo.cs * r.x - geo.sn * q,
          wz = -geo.sn * r.x - geo.cs * q;
        out.mu[i] = Math.max(-1, Math.min(1, wz / c.rz));
        out.phi[i] = Math.atan2(r.y / c.ry, wx / c.rx);
      }
    }
  }
  cachedKey = key;
  cachedTransport = { source, mu, phi, first, modes, rayCount };
  return { ...cachedTransport, emitters };
}

function splat(hist, mu, phi, weight, nz, na) {
  const v = ((mu + 1) * nz) / 2 - 0.5,
    u = ((phi / TAU + 1) % 1) * na - 0.5,
    iv = Math.floor(v),
    iu = Math.floor(u),
    fy = v - iv,
    fx = u - iu;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++) {
      const row = Math.max(0, Math.min(nz - 1, iv + a)),
        col = (((iu + b) % na) + na) % na;
      hist[row * na + col] += weight * (a ? fy : 1 - fy) * (b ? fx : 1 - fx);
    }
}
export function reflectedMetrics(direct, paths, curve, flux, rho, mode) {
  const nz = direct.nz,
    na = direct.na,
    hist = new Float64Array(nz * na);
  let total = 0,
    target = 0,
    screen = 0,
    room = 0,
    housing = 0,
    residual = 0,
    returned = 0,
    directTarget = 0;
  const data = paths.modes[mode],
    powers = Array.from({ length: MAX_BOUNCES + 1 }, (_, i) => rho ** i);
  for (let i = 0; i < paths.rayCount; i++) {
    const w =
      paths.emitters[paths.source[i]].weight *
      intensity(curve, paths.mu[i], paths.phi[i]);
    total += w;
    if (paths.first[i] === 0) {
      target += w;
      directTarget += w;
      continue;
    }
    if (paths.first[i] === 1) {
      room += w;
      continue;
    }
    if (mode === "absorb" || rho === 0) {
      screen += w;
      continue;
    }
    const survival = powers[data.bounces[i]],
      remaining = w * survival;
    screen += w - remaining;
    if (data.kind[i] === 0) {
      target += remaining;
      returned += remaining;
      splat(hist, data.mu[i], data.phi[i], remaining, nz, na);
    } else if (data.kind[i] === 1) room += remaining;
    else if (data.kind[i] === 2) housing += remaining;
    else residual += remaining;
  }
  const norm = total > 0 ? 1 / total : 0;
  const samples = direct.samples.map((s) => ({
    ...s,
    direct: s.value,
    reflected: (hist[s.i * na + s.j] * norm * flux) / s.area,
    value: s.value + (hist[s.i * na + s.j] * norm * flux) / s.area,
  }));
  const mean =
    samples.reduce((sum, s) => sum + s.value * s.area, 0) / direct.area;
  // Photon maps estimate an area, not an exact specular caustic at a point.
  // Average the reflected term over the nine closest surface cells to the axis.
  const nearest = [...samples]
    .sort(
      (a, b) =>
        a.p.reduce((s, v, i) => s + (v - direct.centerPoint[i]) ** 2, 0) -
        b.p.reduce((s, v, i) => s + (v - direct.centerPoint[i]) ** 2, 0),
    )
    .slice(0, 9);
  const axisReflection =
    nearest.reduce((s, p) => s + p.reflected * p.area, 0) /
    nearest.reduce((s, p) => s + p.area, 0);
  const budget = {
    target: target * norm,
    screen: screen * norm,
    room: room * norm,
    housing: housing * norm,
    residual: residual * norm,
    returned: returned * norm,
    direct: directTarget * norm,
    quadrature: (total * paths.emitters.length * 4 * Math.PI) / paths.rayCount,
  };
  if (!flux)
    for (const key of Object.keys(budget))
      if (key !== "quadrature") budget[key] = 0;
  return {
    ...direct,
    samples,
    mean,
    center: direct.center + axisReflection,
    axisReflection,
    budget,
    reflectedMean: mean - direct.mean,
  };
}

export function compareScreens(
  c,
  rig,
  groups,
  curve,
  flux,
  direct,
  rho,
  rayCount = REFLECTION_RAYS,
) {
  const paths = transport(c, rig, groups, rayCount),
    result = {};
  for (const mode of Object.keys(reflectionNames))
    result[mode] = reflectedMetrics(direct, paths, curve, flux, rho, mode);
  return result;
}
