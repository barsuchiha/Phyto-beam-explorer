import { bulbModel } from "./minifermer-bulbs.js";
import { buildLeafBVH, hitLeaves } from "./leaf-bvh.js";
import { hardware } from "./hardware.js";
import { mini36Model } from "./mini36.js";
import { eraModel } from "./era.js";
import {
  intensity,
  rayCrown,
  surfacePoint,
  add,
  sub,
  mul,
  dot,
  unit,
} from "./crown.js";
import { cross } from "./luminaire-scene.js";

export const PREVIEW_RAYS = 32768;
export const LEAF_RAYS = 131072;
const EPS = 1e-7,
  TAU = 2 * Math.PI;
function radical(i, base) {
  let value = 0,
    f = 1 / base;
  while (i) {
    value += (i % base) * f;
    i = Math.floor(i / base);
    f /= base;
  }
  return value;
}
function noise(i) {
  let x = i | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export function lightOutput(state, count) {
  if (bulbModel.modules[state.source]) {
    const p = bulbModel.output(state.source, count),
      m = bulbModel.modules[state.source];
    return {
      fluxes: bulbModel.angles.flatMap(() => p.fluxes),
      curves: bulbModel.angles.flatMap((angle) => p.fluxes.map(() => angle)),
      note: `PPF предположен: ${m.watts.join(" / ")} Вт × 1,5 / 1,9 / 2,3 мкмоль/Дж всей лампы. Девять сочетаний потока и пучков 110 / 120 / 130°. Это не измеренный диапазон. Встроенное питание, DIM не подтверждён; яркость 100%. Замеры в отражающем Mylar-боксе не использованы для подгонки.`,
    };
  }
  if (state.source === "mf36") {
    const p = mini36Model.output("mf36", count, state.dim);
    return {
      fluxes: p.fluxes,
      curves: [120, 120, 120],
      note: "PPF по трём сценариям Seoul + Osram. PWM совместимого внешнего драйвера предполагается; его модель ещё не выбрана.",
    };
  }
  if (state.source.startsWith("era")) {
    const p = eraModel.modules[state.source].ppf * count;
    return {
      fluxes: [p, p, p],
      curves: eraModel.assumedAngles,
      note: "PPF изготовителя; три предполагаемых пучка 110 / 120 / 130°. Штатное диммирование отсутствует.",
    };
  }
  const p = hardware.point(state.source, 350),
    f = (p.ppf * count * state.dim) / 100;
  return {
    fluxes: [f, f, f],
    curves: ["lm301b", "lm301b", "lm301b"],
    note:
      state.model === "olive"
        ? `6 плат COMPACT 21, по две на блок, 350 мА. PPF до панелей: 54,06 мкмоль/с при 100%; электрическая мощность плат 16,8 Вт. Проект питания: три внешних LDD-350H, по две платы последовательно на канал (тип. 16 В), общий БП 24 В; PWM на нашей стороне. Сейчас яркость общая. Нагрев кассеты и размещение питания не проверены.`
        : `350 мА на плату, ${p.ppf.toFixed(2)} мкмоль/с при 100%. Внешний LDD-350H + БП 24 В, отдельный канал на головку; DIM через PWM. Тепловой расчёт корпуса не выполнен.`,
  };
}
export function triangles(surfaces) {
  return surfaces.flatMap((s) =>
    [
      [s.a, s.b, s.c],
      [s.a, s.c, s.d],
    ].map(([a, b, c]) => {
      const e1 = sub(b, a),
        e2 = sub(c, a);
      return { a, e1, e2, n: unit(cross(e1, e2)), kind: s.kind };
    }),
  );
}
function triangleDistance(o, d, t) {
  const [x, y, z] = d,
    [a, b, c] = t.e2;
  const px = y * c - z * b,
    py = z * a - x * c,
    pz = x * b - y * a;
  const det = t.e1[0] * px + t.e1[1] * py + t.e1[2] * pz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const sx = o[0] - t.a[0],
    sy = o[1] - t.a[1],
    sz = o[2] - t.a[2];
  const u = (sx * px + sy * py + sz * pz) / det;
  if (u < 0 || u > 1) return Infinity;
  const qx = sy * t.e1[2] - sz * t.e1[1],
    qy = sz * t.e1[0] - sx * t.e1[2],
    qz = sx * t.e1[1] - sy * t.e1[0];
  const v = (x * qx + y * qy + z * qz) / det;
  if (v < 0 || u + v > 1) return Infinity;
  const distance = (a * qx + b * qy + c * qz) / det;
  return distance > EPS ? distance : Infinity;
}
export function scatter(d, n, material, a, b) {
  if (dot(d, n) > 0) n = mul(n, -1);
  if (material === "mirror") return sub(d, mul(n, 2 * dot(d, n)));
  const u = unit(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], n)),
    v = cross(n, u),
    r = Math.sqrt(a),
    phi = TAU * b;
  return add(
    mul(n, Math.sqrt(1 - a)),
    add(mul(u, r * Math.cos(phi)), mul(v, r * Math.sin(phi))),
  );
}
export function tracePath(
  geometry,
  origin,
  direction,
  material,
  rho,
  seed = 1,
  maxBounces = 24,
) {
  let o = origin,
    d = direction,
    weight = 1,
    absorbed = 0,
    reflections = 0;
  const path = [o];
  for (let bounce = 0; bounce <= maxBounces; bounce++) {
    const leafHit = geometry.leafReceiver
      ? hitLeaves(geometry.leafBVH, o, d)
      : null;
    let distance = geometry.leafReceiver
        ? (leafHit?.distance ?? Infinity)
        : rayCrown(o, d, geometry.crown),
      hit = null;
    for (const t of geometry.triangles) {
      const k = triangleDistance(o, d, t);
      if (k < distance) {
        distance = k;
        hit = t;
      }
    }
    const fixtureHit = geometry.fixture?.hit(o, d, distance);
    if (fixtureHit) {
      distance = fixtureHit.distance;
      hit = fixtureHit;
    }
    const roomHit = geometry.room?.hit(o, d, distance);
    if (roomHit) {
      distance = roomHit.distance;
      hit = roomHit;
    }
    if (!Number.isFinite(distance))
      return {
        kind: "room",
        weight,
        absorbed,
        path: [...path, add(o, mul(d, 1.2))],
        bounces: reflections,
      };
    const p = add(o, mul(d, distance));
    path.push(p);
    if (hit?.kind === "room")
      return {
        kind: "room",
        weight,
        absorbed,
        path,
        point: p,
        roomHit: hit,
        bounces: reflections,
      };
    if (!hit)
      return {
        kind: "target",
        weight,
        absorbed,
        path,
        point: p,
        leaf: leafHit?.leaf,
        patch: leafHit?.patch,
        side: leafHit?.side,
        bounces: reflections,
      };
    if (hit.kind === "housing")
      return { kind: "housing", weight, absorbed, path, bounces: reflections };
    if (hit.kind === "clear" || hit.kind === "frost") {
      // One thin skin per CAD panel: attenuation once per crossing, without
      // double-counting the two sides of a solid glass insert.
      absorbed += weight * (1 - hit.transmission);
      weight *= hit.transmission;
      if (weight < 1e-10 || bounce === maxBounces)
        return {
          kind: "residual",
          weight,
          absorbed,
          path,
          bounces: reflections,
        };
      if (hit.kind === "frost")
        d = scatter(
          mul(d, -1),
          hit.n,
          "diffuse",
          noise(seed + bounce * 1777),
          noise(seed + 900001 + bounce * 3331),
        );
      o = add(p, mul(d, EPS * 4));
      continue;
    }
    if (material === "absorb")
      return { kind: "screen", weight, absorbed, path, bounces: reflections };
    absorbed += weight * (1 - rho);
    weight *= rho;
    if (weight < 1e-10 || bounce === maxBounces)
      return { kind: "residual", weight, absorbed, path, bounces: bounce + 1 };
    d = scatter(
      d,
      hit.n,
      material,
      noise(seed + bounce * 1777),
      noise(seed + 900001 + bounce * 3331),
    );
    reflections++;
    o = add(p, mul(d, EPS * 4));
  }
}

export function calculateLuminaire(
  state,
  scene,
  rayCount = state.receiver === "leaves" ? LEAF_RAYS : PREVIEW_RAYS,
) {
  const output = lightOutput(state, scene.sources.length),
    scenarioCount = output.fluxes.length,
    middle = Math.floor(scenarioCount / 2),
    nz = 16,
    na = 32;
  const geometry = {
    crown: scene.crown,
    triangles: triangles([...scene.surfaces, ...scene.boards]),
    leafReceiver: state.receiver === "leaves",
    fixture: scene.fixture,
    room: scene.room,
    leafBVH:
      state.receiver === "leaves"
        ? buildLeafBVH(scene.leafGeometry.triangles)
        : null,
  };
  const bins = geometry.leafReceiver
    ? scene.leafGeometry.patches.flatMap((patch) =>
        [0, 1].map((side) => ({
          leaf: patch.leaf,
          patch: patch.id,
          side,
          area: patch.area,
          power: Array(scenarioCount).fill(0),
          hits: 0,
        })),
      )
    : Array.from({ length: nz * na }, (_, k) => {
        const mu = -1 + (2 * (Math.floor(k / na) + 0.5)) / nz,
          phi = (TAU * ((k % na) + 0.5)) / na;
        const s = surfacePoint(scene.crown, mu, phi);
        return {
          p: s.p,
          area: (((s.jacobian * 2) / nz) * TAU) / na,
          power: Array(scenarioCount).fill(0),
        };
      });
  const budgets = Array.from({ length: scenarioCount }, () => ({
    target: 0,
    room: 0,
    screen: 0,
    housing: 0,
    residual: 0,
    returned: 0,
    total: 0,
  }));
  const rays = [];
  const rayStride = Math.max(1, Math.floor(rayCount / 512));
  const roomKinds = ["chair", "cat", "walls", "floor", "escape"];
  const roomPower = Object.fromEntries(
    roomKinds.map((key) => [key, Array(scenarioCount).fill(0)]),
  );
  const roomHits = Object.fromEntries(roomKinds.map((key) => [key, 0]));
  const roomCells = new Map();
  for (let i = 1; i <= rayCount; i++) {
    const source =
      scene.sources[
        Math.min(
          scene.sources.length - 1,
          Math.floor(radical(i, 5) * scene.sources.length),
        )
      ];
    const a = radical(i, 7),
      b = radical(i, 11),
      mu = radical(i, 2),
      phi = TAU * radical(i, 3),
      q = Math.sqrt(1 - mu * mu);
    let x = (a - 0.5) * source.w,
      y = (b - 0.5) * source.d;
    if (source.disc) {
      x = ((Math.sqrt(a) * source.w) / 2) * Math.cos(TAU * b);
      y = ((Math.sqrt(a) * source.d) / 2) * Math.sin(TAU * b);
    }
    const origin = add(source.p, add(mul(source.u, x), mul(source.v, y)));
    const d = add(
      mul(source.n, mu),
      add(mul(source.u, q * Math.cos(phi)), mul(source.v, q * Math.sin(phi))),
    );
    const result = tracePath(
      geometry,
      origin,
      d,
      state.material,
      state.reflectance / 100,
      i,
    );
    let index = -1;
    const roomKind = result.roomHit?.receiver ?? "escape";
    if (result.kind === "room") roomHits[roomKind]++;
    if (result.kind === "target" && geometry.leafReceiver) {
      index = result.patch * 2 + result.side;
      bins[index].hits++;
    } else if (result.kind === "target") {
      const p = sub(result.point, scene.crown.center),
        cz = Math.max(-1, Math.min(1, p[2] / scene.crown.rz));
      const cp =
        (Math.atan2(p[1] / scene.crown.ry, p[0] / scene.crown.rx) + TAU) % TAU;
      index =
        Math.min(nz - 1, Math.floor((cz + 1) * 0.5 * nz)) * na +
        Math.min(na - 1, Math.floor((cp / TAU) * na));
    }
    for (let k = 0; k < scenarioCount; k++) {
      const w = (TAU * intensity(output.curves[k], mu, phi)) / rayCount;
      budgets[k].total += w;
      budgets[k].screen += w * result.absorbed;
      budgets[k][result.kind] += w * result.weight;
      if (result.kind === "room") roomPower[roomKind][k] += w * result.weight;
      if (index >= 0) {
        bins[index].power[k] += w * result.weight;
        if (result.bounces) budgets[k].returned += w * result.weight;
      }
    }
    if (result.roomHit && roomKind !== "escape") {
      const p = result.point;
      // 5 cm world-space cells are a display-only smoothing grid, not detectors.
      const key =
        result.roomHit.object +
        ":" +
        p.map((v) => Math.floor(v / 0.05)).join(":");
      const w =
        ((TAU * intensity(output.curves[middle], mu, phi)) / rayCount) *
        result.weight;
      let cell = roomCells.get(key);
      if (!cell) {
        cell = {
          point: [0, 0, 0],
          normal: [0, 0, 0],
          weight: 0,
          receiver: roomKind,
        };
        roomCells.set(key, cell);
      }
      cell.weight += w;
      for (let j = 0; j < 3; j++) {
        cell.point[j] += p[j] * w;
        cell.normal[j] += result.roomHit.normal[j] * w;
      }
    }
    if (i % rayStride === 0 && rays.length < 512)
      rays.push({
        points: result.path,
        kind: result.kind,
        reflected: result.bounces > 0,
        receiver: result.roomHit?.receiver,
        strength:
          TAU *
          intensity(output.curves[middle], mu, phi) *
          output.fluxes[middle] *
          result.weight,
      });
  }
  const area = bins.reduce((s, b) => s + b.area, 0);
  const metrics = budgets.map((budget, k) => {
    const normal = budget.total;
    const fractions = Object.fromEntries(
      Object.entries(budget).map(([key, v]) => [key, v / normal]),
    );
    return {
      budget: fractions,
      mean: (fractions.target * output.fluxes[k]) / area,
      flux: output.fluxes[k],
    };
  });
  bins.forEach((b) => {
    b.ppfd =
      b.area > 0
        ? ((b.power[middle] / budgets[middle].total) * output.fluxes[middle]) /
          b.area
        : 0;
  });
  const leaves = geometry.leafReceiver
    ? scene.leafGeometry.leaves.map((leaf) => {
        const sides = [0, 1].map((side) => {
          const cells = leaf.patches.map((id) => bins[id * 2 + side]);
          const values = output.fluxes.map(
            (flux, k) =>
              ((cells.reduce((sum, b) => sum + b.power[k], 0) /
                budgets[k].total) *
                flux) /
              leaf.area,
          );
          return {
            mean: values[middle],
            values,
            range: [Math.min(...values), Math.max(...values)],
            hits: cells.reduce((sum, b) => sum + b.hits, 0),
          };
        });
        return { id: leaf.id, area: leaf.area, sides };
      })
    : null;
  return {
    receiver: geometry.leafReceiver ? "leaves" : "crown",
    leaves,
    output,
    metrics,
    bins,
    nz,
    na,
    rays,
    room: scene.room
      ? {
          fractions: Object.fromEntries(
            roomKinds.map((key) => [
              key,
              roomPower[key].map((value, k) => value / budgets[k].total),
            ]),
          ),
          hits: roomHits,
          splats: [...roomCells.values()]
            .filter((c) => c.weight > 0)
            .map((cell) => ({
              point: cell.point.map((v) => v / cell.weight),
              normal: unit(cell.normal),
              power:
                (cell.weight / budgets[middle].total) * output.fluxes[middle],
              receiver: cell.receiver,
            })),
        }
      : null,
    area,
    rayCount,
    middle,
    mean: metrics[middle].mean,
    range: [
      Math.min(...metrics.map((m) => m.mean)),
      Math.max(...metrics.map((m) => m.mean)),
    ],
  };
}
