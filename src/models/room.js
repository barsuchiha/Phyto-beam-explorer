// Shared, deliberately simple room / chair / cat geometry. Metres, Z up.
// Every room hit terminates transport: these surfaces do not bounce light.
const EPS = 1e-7;
export const ROOM_BOUNDS = { min: [-1.1, -1.7, 0], max: [3.1, 1.15, 2.8] };

export function roomObjects(chairX = 1.6, backY = ROOM_BOUNDS.max[1]) {
  const objects = [];
  const plane = (
    id,
    receiver,
    axis,
    coordinate,
    ranges,
    normal,
    color,
    visible = true,
  ) =>
    objects.push({
      id,
      receiver,
      type: "plane",
      axis,
      axes: [0, 1, 2].filter((a) => a !== axis),
      coordinate,
      ranges,
      normal,
      color,
      visible,
    });
  const min = ROOM_BOUNDS.min,
    max = [ROOM_BOUNDS.max[0], backY, ROOM_BOUNDS.max[2]];
  plane(
    "floor",
    "floor",
    2,
    0,
    [
      [min[0], max[0]],
      [min[1], max[1]],
    ],
    [0, 0, 1],
    0x8c8172,
  );
  plane(
    "back-wall",
    "walls",
    1,
    max[1],
    [
      [min[0], max[0]],
      [0, max[2]],
    ],
    [0, -1, 0],
    0xb9b5a4,
  );
  plane(
    "left-wall",
    "walls",
    0,
    min[0],
    [
      [min[1], max[1]],
      [0, max[2]],
    ],
    [1, 0, 0],
    0x999e90,
  );
  plane(
    "open-front",
    "escape",
    1,
    min[1],
    [
      [min[0], max[0]],
      [0, max[2]],
    ],
    [0, 1, 0],
    0,
    false,
  );
  plane(
    "open-right",
    "escape",
    0,
    max[0],
    [
      [min[1], max[1]],
      [0, max[2]],
    ],
    [-1, 0, 0],
    0,
    false,
  );
  plane(
    "open-top",
    "escape",
    2,
    max[2],
    [
      [min[0], max[0]],
      [min[1], max[1]],
    ],
    [0, 0, -1],
    0,
    false,
  );
  const ellipsoid = (id, receiver, center, radius, color) =>
    objects.push({
      id,
      receiver,
      type: "ellipsoid",
      center,
      radius,
      color,
      visible: true,
    });
  // Keep the chair in front of a wall moved close to the plant.
  const cy = Math.min(0.28, backY - 0.47);
  for (const x of [-0.3, 0.3])
    for (const y of [-0.25, 0.25])
      ellipsoid(
        `leg-${x}-${y}`,
        "chair",
        [chairX + x, cy + y, 0.22],
        [0.035, 0.035, 0.22],
        0x51473e,
      );
  ellipsoid(
    "seat",
    "chair",
    [chairX, cy - 0.02, 0.44],
    [0.4, 0.37, 0.11],
    0xc1ad89,
  );
  ellipsoid(
    "back",
    "chair",
    [chairX, cy + 0.3, 0.74],
    [0.43, 0.12, 0.45],
    0xbda783,
  );
  for (const x of [-0.4, 0.4])
    ellipsoid(
      `arm-${x}`,
      "chair",
      [chairX + x, cy, 0.62],
      [0.095, 0.36, 0.13],
      0xc9b795,
    );
  ellipsoid(
    "cat-body",
    "cat",
    [chairX + 0.02, cy - 0.1, 0.68],
    [0.22, 0.155, 0.15],
    0xb57644,
  );
  ellipsoid(
    "cat-chest",
    "cat",
    [chairX - 0.14, cy - 0.18, 0.72],
    [0.105, 0.115, 0.14],
    0xdba96d,
  );
  ellipsoid(
    "cat-head",
    "cat",
    [chairX - 0.18, cy - 0.24, 0.84],
    [0.115, 0.102, 0.11],
    0xc58b53,
  );
  for (const x of [-0.16, -0.05])
    ellipsoid(
      `paw-${x}`,
      "cat",
      [chairX + x, cy - 0.31, 0.57],
      [0.07, 0.085, 0.035],
      0xe0be8b,
    );
  // Curled tail uses the same small ellipsoids in rendering and transport.
  for (let i = 0; i < 12; i++) {
    const a = -1.4 + i * 0.18;
    ellipsoid(
      `tail-${i}`,
      "cat",
      [
        chairX + 0.08 + 0.23 * Math.cos(a),
        cy - 0.1 + 0.16 * Math.sin(a),
        0.585,
      ],
      [0.045, 0.038, 0.04],
      i % 3 === 0 ? 0x805936 : 0xb57644,
    );
  }
  return objects;
}

export function intersectRoomObject(
  object,
  origin,
  direction,
  limit = Infinity,
) {
  let distance, normal;
  if (object.type === "plane") {
    const axis = object.axis;
    if (Math.abs(direction[axis]) < 1e-12) return null;
    distance = (object.coordinate - origin[axis]) / direction[axis];
    if (distance <= EPS || distance >= limit) return null;
    const axes = object.axes;
    for (let k = 0; k < 2; k++) {
      const value = origin[axes[k]] + direction[axes[k]] * distance;
      if (
        value < object.ranges[k][0] - EPS ||
        value > object.ranges[k][1] + EPS
      )
        return null;
    }
    normal = object.normal;
  } else {
    const p = origin.map((v, k) => (v - object.center[k]) / object.radius[k]);
    const d = direction.map((v, k) => v / object.radius[k]);
    const a = d.reduce((s, v) => s + v * v, 0);
    const b = p.reduce((s, v, k) => s + v * d[k], 0);
    const c = p.reduce((s, v) => s + v * v, 0) - 1;
    const discriminant = b * b - a * c;
    if (discriminant < 0) return null;
    const near = (-b - Math.sqrt(discriminant)) / a;
    distance = near > EPS ? near : (-b + Math.sqrt(discriminant)) / a;
    if (distance <= EPS || distance >= limit) return null;
    normal = origin.map(
      (v, k) =>
        (v + direction[k] * distance - object.center[k]) /
        object.radius[k] ** 2,
    );
    const length = Math.hypot(...normal);
    normal = normal.map((v) => v / length);
  }
  return {
    distance,
    normal,
    object: object.id,
    receiver: object.receiver,
    kind: "room",
  };
}

export function buildRoom(chairX = 1.6, backY = ROOM_BOUNDS.max[1]) {
  const objects = roomObjects(chairX, backY);
  const bounds = {
    min: [...ROOM_BOUNDS.min],
    max: [ROOM_BOUNDS.max[0], backY, ROOM_BOUNDS.max[2]],
  };
  const planes = objects.slice(0, 6),
    furniture = objects.slice(6);
  const lo = [0, 1, 2].map((i) =>
      Math.min(...furniture.map((o) => o.center[i] - o.radius[i])),
    ),
    hi = [0, 1, 2].map((i) =>
      Math.max(...furniture.map((o) => o.center[i] + o.radius[i])),
    );
  return {
    objects,
    chairX,
    chairY: Math.min(0.28, backY - 0.47),
    bounds,
    hit(origin, direction, limit = Infinity) {
      let best = null;
      for (const object of planes) {
        const hit = intersectRoomObject(
          object,
          origin,
          direction,
          best?.distance ?? limit,
        );
        if (hit) best = hit;
      }
      // Broad phase avoids testing every chair/cat part for most room rays.
      let near = 0,
        far = best?.distance ?? limit;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(direction[k]) < 1e-12) {
          if (origin[k] < lo[k] || origin[k] > hi[k]) return best;
        } else {
          const a = (lo[k] - origin[k]) / direction[k],
            b = (hi[k] - origin[k]) / direction[k];
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
          if (far < near) return best;
        }
      }
      for (const object of furniture) {
        const hit = intersectRoomObject(
          object,
          origin,
          direction,
          best?.distance ?? limit,
        );
        if (hit) best = hit;
      }
      return best;
    },
  };
}

export function roomLeafCollision(room, leafGeometry) {
  const { min, max } = room.bounds ?? ROOM_BOUNDS;
  for (const { points } of leafGeometry.triangles) {
    if (points.some((p) => p.some((v, i) => v <= min[i] || v >= max[i])))
      return "boundary";
    for (const object of room.objects) {
      if (object.type !== "ellipsoid") continue;
      // The triangle's AABB rejects most furniture parts before exact edge tests.
      if (
        [0, 1, 2].some(
          (i) =>
            Math.max(...points.map((p) => p[i])) <
              object.center[i] - object.radius[i] ||
            Math.min(...points.map((p) => p[i])) >
              object.center[i] + object.radius[i],
        )
      )
        continue;
      if (
        points.some(
          (p) =>
            p.reduce(
              (s, v, i) => s + ((v - object.center[i]) / object.radius[i]) ** 2,
              0,
            ) <= 1,
        )
      )
        return object.receiver;
      for (let i = 0; i < 3; i++) {
        const a = points[i],
          b = points[(i + 1) % 3],
          d = b.map((v, k) => v - a[k]);
        const length = Math.hypot(...d);
        if (
          length &&
          intersectRoomObject(
            object,
            a,
            d.map((v) => v / length),
            length,
          )
        )
          return object.receiver;
      }
      // A broad leaf can slice through an ellipsoid without an edge entering it.
      // In ellipsoid-normalised space, test the sphere's projection on the face.
      const [a, b, c] = points.map((p) =>
        p.map((v, k) => (v - object.center[k]) / object.radius[k]),
      );
      const u = b.map((v, k) => v - a[k]),
        v = c.map((x, k) => x - a[k]);
      const dot = (x, y) => x.reduce((s, n, k) => s + n * y[k], 0);
      const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const nn = dot(n, n),
        d = dot(n, a);
      if (nn > 1e-16 && d * d <= nn) {
        const w = n.map((x, k) => (x * d) / nn - a[k]);
        const uu = dot(u, u),
          vv = dot(v, v),
          uv = dot(u, v),
          uw = dot(u, w),
          vw = dot(v, w),
          denominator = uu * vv - uv * uv;
        const s = (uw * vv - vw * uv) / denominator,
          t = (vw * uu - uw * uv) / denominator;
        if (s >= 0 && t >= 0 && s + t <= 1) return object.receiver;
      }
    }
  }
  return null;
}
