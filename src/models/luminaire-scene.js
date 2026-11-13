import { luminaires, mounts, fittingSources } from "../data/luminaires.js";
import { crownGeometry, add, sub, mul, dot, unit } from "./crown.js";
import { sourceFit } from "./fitting.js";
import { buildLeafGeometry } from "./leaf-geometry.js";
import { leafSurfaceCollision } from "./leaf-collision.js";
import { oliveAssembly } from "./olive.js";
import { buildRoom, roomLeafCollision } from "./room.js";
import { placeWindow } from "./window-geometry.js";
import { fixtureDepth, translateFixture } from "./lamp-placement.js";

export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const rad = (d) => (d * Math.PI) / 180;
export const rotationY = (p, angle) => {
  const a = rad(angle);
  return [
    p[0] * Math.cos(a) + p[2] * Math.sin(a),
    p[1],
    -p[0] * Math.sin(a) + p[2] * Math.cos(a),
  ];
};
export function quad(a, b, c, d, kind = "screen") {
  const u = sub(b, a),
    v = sub(d, a);
  return {
    a,
    b,
    c,
    d,
    u,
    v,
    uu: dot(u, u),
    vv: dot(v, v),
    n: unit(cross(u, v)),
    kind,
  };
}
export function flexibleSection(turn) {
  const a = rad(turn),
    radius = 0.165 / a;
  return {
    radius,
    gap: 2 * (0.03 + radius * Math.sin(a)),
    drop: radius * (1 - Math.cos(a)) + 0.0004,
    angle: a,
  };
}
// Centimetres in controls; metres in the shared optical/rendering geometry.
// Diameters describe the full supporting circles, including for partial sectors.
export function coneScreenDimensions(state, mount, source) {
  const length = (state.screenLength ?? 6) / 100,
    clearance = (state.screenGap ?? 1) / 100,
    half = rad(state.opening / 2),
    radius =
      (source.type === "bulb"
        ? source.size[0] / 2000
        : Math.hypot(mount.body[0], mount.body[1]) / 2000) + clearance;
  return {
    length,
    clearance,
    radius,
    depth: length * Math.cos(half),
    mouthRadius: radius + length * Math.sin(half),
  };
}
export function buildLuminaireScene(state, pose) {
  const model = luminaires[state.model],
    mount = mounts[state.mount],
    source = fittingSources[state.source];
  const rawSources = pose.sources;
  let zShift = 0;
  if (model.install !== null) {
    const reference =
      state.model === "B3flex"
        ? 0
        : model.family === "Soltech"
          ? pose.anchor[2] / 1000
          : Math.max(...rawSources.map((s) => s.center[2] / 1000));
    zShift = state.install / 100 - reference;
  }
  const olive = state.model === "olive" ? oliveAssembly(state, pose) : null;
  const sources =
    olive?.sources ??
    rawSources.map((s) => {
      const n = rotationY([0, 0, -1], s.tilt),
        u = rotationY([1, 0, 0], s.tilt);
      // Preserve the original upper mechanical interface when a deeper head is tried.
      const extra = state.mount === "large" ? (mount.body[2] - 26) / 1000 : 0;
      return {
        p: add(add(mul(s.center, 0.001), [0, 0, zShift]), mul(n, extra)),
        n,
        u,
        v: [0, 1, 0],
        tilt: s.tilt,
      };
    });
  if (model.family === "Soltech") {
    const anchor = add(mul(pose.anchor, 0.001), [0, 0, zShift]);
    const length =
      mount.type === "bulb"
        ? (source.size[2] ?? source.drawHeight) / 1000 + 0.045
        : 0.09;
    sources.push({
      p: add(anchor, [0, 0, -length]),
      n: [0, 0, -1],
      u: [1, 0, 0],
      v: [0, 1, 0],
      tilt: 0,
      anchor,
    });
  }
  const rotated = sourceFit(state.mount, state.source).rotated;
  sources.forEach((s) => {
    s.w = source.size[rotated ? 1 : 0] / 1000;
    s.d = source.size[rotated ? 0 : 1] / 1000;
    s.disc = source.type === "bulb";
  });
  const crown = crownGeometry(state),
    potHeight = Math.max(0.09, Math.min(0.3, crown.height * 0.22));
  const plantX =
    (model.plantX ?? sources.reduce((s, p) => s + p.p[0], 0) / sources.length) +
    state.plantOffset / 100;
  const plantY = state.model === "V2" ? sources[0].p[1] : 0;
  crown.center = add(crown.center, [plantX, plantY, potHeight]);
  crown.soil = [plantX, plantY, potHeight];
  crown.potHeight = potHeight;
  const surfaces = [],
    screenSupports = [];
  const screenDimensions =
    model.optic === "cone" ? coneScreenDimensions(state, mount, source) : null;
  if (model.optic === "flex") {
    const f = flexibleSection(state.canopy);
    for (const side of [-1, 1])
      for (let i = 0; i < 40; i++) {
        const section = (t) => [
          side * (0.03 + f.radius * Math.sin(t)),
          zShift - 0.0004 - f.radius * (1 - Math.cos(t)),
        ];
        const [y0, z0] = section((f.angle * i) / 40),
          [y1, z1] = section((f.angle * (i + 1)) / 40);
        surfaces.push(
          quad(
            [-0.36, y0, z0],
            [0.36, y0, z0],
            [0.36, y1, z1],
            [-0.36, y1, z1],
          ),
        );
      }
  } else if (model.optic === "trough") {
    const depth = [0.04, 0.07, 0.11][state.pose];
    for (let i = 0; i < 40; i++) {
      const y0 = -0.1 + (0.2 * i) / 40,
        y1 = -0.1 + (0.2 * (i + 1)) / 40;
      const z = (y) => 0.7 + zShift + depth * (1 - (y / 0.1) ** 2);
      surfaces.push(
        quad(
          [-0.36, y0, z(y0)],
          [0.36, y0, z(y0)],
          [0.36, y1, z(y1)],
          [-0.36, y1, z(y1)],
        ),
      );
    }
  } else if (model.optic === "flap") {
    const p = [0, 0, 0.67],
      local = [
        [-0.09, -0.085, -0.001],
        [0.09, -0.085, -0.001],
        [0.09, 0.085, -0.001],
        [-0.09, 0.085, -0.001],
      ];
    surfaces.push(quad(...local.map((v) => add(p, rotationY(v, state.flap)))));
  } else if (state.screen) {
    const { radius: r, mouthRadius, depth } = screenDimensions,
      expand = mouthRadius - r;
    for (const s of sources) {
      // The shade starts at the emitting plane and extends forward. The bulb
      // and its radiator remain behind it, with no rear cap around the socket.
      const point = (a, r, z) =>
        add(
          s.p,
          add(
            mul(s.u, r * Math.cos(a)),
            add(mul(s.v, r * Math.sin(a)), mul(s.n, z)),
          ),
        );
      const n = Math.ceil(state.sector / 6);
      for (let i = 0; i < n; i++) {
        const a = rad(-state.sector / 2 + (state.sector * i) / n),
          b = rad(-state.sector / 2 + (state.sector * (i + 1)) / n);
        // A cone strip is not a parallelogram: split into triangles below.
        surfaces.push(
          quad(
            point(a, r, 0),
            point(b, r, 0),
            point(b, r + expand, depth),
            point(a, r + expand, depth),
          ),
        );
      }
      if (model.family === "Soltech") {
        // Open supports are an illustrative mounting proposal, not optical
        // surfaces. They attach above the body and stay outside its envelope.
        const back = dot(sub(s.anchor, s.p), s.n) - 0.012;
        const angles =
          state.sector === 360
            ? [-120, 0, 120]
            : [-state.sector / 2, 0, state.sector / 2];
        for (const angle of angles)
          screenSupports.push([
            point(rad(angle), 0.008, back),
            point(rad(angle), r, back),
            point(rad(angle), r, 0),
          ]);
      }
    }
  }
  const boards = sources.map((s) =>
    quad(
      ...[
        [-s.w / 2, -s.d / 2],
        [s.w / 2, -s.d / 2],
        [s.w / 2, s.d / 2],
        [-s.w / 2, s.d / 2],
      ].map(([x, y]) => add(s.p, add(mul(s.u, x), mul(s.v, y)))),
      "housing",
    ),
  );
  if (olive) boards.push(...olive.holders);
  const inside = (p) =>
    ((p[0] - crown.center[0]) / crown.rx) ** 2 +
      ((p[1] - crown.center[1]) / crown.ry) ** 2 +
      ((p[2] - crown.center[2]) / crown.rz) ** 2 <
    1;
  // Conservative envelope check. This is not full CAD collision detection.
  const leafGeometry = buildLeafGeometry(
    crown,
    state.plant,
    state.plantSize,
    state.leafTilt ?? 0,
  );
  const fixtureGeometry = {
    sources,
    surfaces,
    boards,
    screenSupports,
    olive,
    mount,
    source,
  };
  const depth = fixtureDepth(state, pose, fixtureGeometry);
  // Once a wall distance is chosen, the wall is placed from the plant and the
  // lamp follows it at that distance. The lamp slider never moves the plant.
  const window = placeWindow(
    state,
    leafGeometry,
    state.lampDistance == null
      ? [...boards, ...surfaces, ...(olive?.collisionSurfaces ?? [])]
      : [],
  );
  const lampShift =
    state.lampDistance == null
      ? 0
      : window.y - depth.back - state.lampDistance / 100;
  translateFixture(fixtureGeometry, lampShift);
  const lampPlacement = {
    y: lampShift,
    gap: window.y - depth.back - lampShift,
    front: depth.front + lampShift,
    back: depth.back + lampShift,
  };
  const collision =
    sources.some((s) =>
      [
        s.p,
        ...[-1, 1].flatMap((x) =>
          [-1, 1].map((y) =>
            add(s.p, add(mul(s.u, (x * s.w) / 2), mul(s.v, (y * s.d) / 2))),
          ),
        ),
      ].some(inside),
    ) ||
    surfaces.some((s) =>
      [s.a, s.b, s.c, s.d, mul(add(s.a, s.c), 0.5)].some(inside),
    ) ||
    leafSurfaceCollision(leafGeometry, [
      ...boards,
      ...surfaces,
      ...(olive?.collisionSurfaces ?? []),
    ]);
  const room = buildRoom(
    1.6 + (state.chairOffset ?? 0) / 100,
    window.y,
    Math.min(-1.7, lampPlacement.front - 0.3),
  );
  return {
    model,
    mount,
    source,
    sources,
    crown,
    leafGeometry,
    surfaces,
    screenSupports,
    screenDimensions,
    boards,
    zShift,
    collision,
    olive,
    fixture: olive?.fixture,
    room,
    window,
    lampPlacement,
    roomCollision: roomLeafCollision(room, leafGeometry),
  };
}
