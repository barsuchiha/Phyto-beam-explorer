import * as T from "../vendor/three.module.min.js";

const v = (p) => new T.Vector3(...p);
function stroke(group, points, color, width = 1) {
  group.add(
    new T.Line(
      new T.BufferGeometry().setFromPoints(points.map(v)),
      new T.LineBasicMaterial({ color, linewidth: width }),
    ),
  );
}
export function populateRoom(group, room) {
  for (const object of room.objects) {
    if (!object.visible) continue;
    const mat = new T.MeshStandardMaterial({
      color: object.color,
      roughness: 1,
      metalness: 0,
    });
    let mesh;
    if (object.type === "plane") {
      // Build from the exact bounded plane used by the tracer.
      const corners = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([a, b]) => {
        const p = [0, 0, 0];
        p[object.axis] = object.coordinate;
        p[object.axes[0]] = object.ranges[0][a];
        p[object.axes[1]] = object.ranges[1][b];
        return p;
      });
      const n = v(corners[1])
        .sub(v(corners[0]))
        .cross(v(corners[2]).sub(v(corners[0])));
      const order =
        n.dot(v(object.normal)) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      const geo = new T.BufferGeometry();
      geo.setAttribute(
        "position",
        new T.Float32BufferAttribute(
          order.flatMap((i) => corners[i]),
          3,
        ),
      );
      geo.computeVertexNormals();
      mesh = new T.Mesh(geo, mat);
    } else {
      mesh = new T.Mesh(new T.SphereGeometry(1, 40, 24), mat);
      mesh.position.copy(v(object.center));
      mesh.scale.copy(v(object.radius));
    }
    mesh.userData.roomReceiver = object.receiver;
    mesh.name = object.id;
    group.add(mesh);
  }
  // Quiet floorboard seams and skirting; decorative details are not receivers.
  for (let x = -1; x <= 3; x += 0.28)
    stroke(
      group,
      [
        [x, -1.7, 0.001],
        [x, 1.15, 0.001],
      ],
      0x776f63,
    );
  stroke(
    group,
    [
      [-1.099, -1.7, 0.075],
      [-1.099, 1.149, 0.075],
      [3.1, 1.149, 0.075],
    ],
    0xd0cbbb,
  );

  // Recognisable curled-up tabby: the torso, head, paws and tail are receivers;
  // ears, face and fur lines are small illustrative details only.
  const x = room.chairX,
    hx = x - 0.18,
    hy = 0.04,
    hz = 0.84;
  for (const side of [-1, 1]) {
    const ear = new T.Mesh(
      new T.ConeGeometry(0.057, 0.13, 3),
      new T.MeshStandardMaterial({ color: 0xb87a4b, roughness: 1 }),
    );
    ear.rotation.x = Math.PI / 2;
    ear.rotation.z = side * 0.18;
    ear.position.set(hx + side * 0.067, hy + 0.015, hz + 0.105);
    group.add(ear);
    const eye = Array.from({ length: 9 }, (_, i) => {
      const a = i / 8;
      return [
        hx + side * 0.042 + (a - 0.5) * 0.045,
        hy - 0.098,
        hz + 0.012 - Math.sin(a * Math.PI) * 0.008,
      ];
    });
    stroke(group, eye, 0x332e28);
    for (let k = -1; k <= 1; k++)
      stroke(
        group,
        [
          [hx + side * 0.025, hy - 0.106, hz - 0.025],
          [hx + side * 0.14, hy - 0.1, hz - 0.025 + k * 0.02],
        ],
        0xeee1c5,
      );
  }
  const nose = new T.Mesh(
    new T.SphereGeometry(0.012, 10, 6),
    new T.MeshStandardMaterial({ color: 0x5e3d35, roughness: 1 }),
  );
  nose.position.set(hx, hy - 0.105, hz - 0.018);
  group.add(nose);
  for (const dx of [-0.1, -0.02, 0.07, 0.14]) {
    const scale = Math.sqrt(1 - (dx / 0.22) ** 2);
    stroke(
      group,
      Array.from({ length: 25 }, (_, i) => {
        const a = 0.12 + (i / 24) * 2.8;
        return [
          x + 0.02 + dx,
          0.18 + 0.157 * scale * Math.cos(a),
          0.68 + 0.152 * scale * Math.sin(a),
        ];
      }),
      0x7e5838,
    );
  }
}

export function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d"),
    gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(canvas);
}

export function populateRoomLight(group, result) {
  const cells = result.room?.splats.filter((c) => c.power > 0) ?? [];
  if (!cells.length) return;
  const material = new T.MeshBasicMaterial({
    color: 0xffffff,
    map: glowTexture(),
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.FrontSide,
  });
  const mesh = new T.InstancedMesh(
    new T.PlaneGeometry(1, 1),
    material,
    cells.length,
  );
  const dummy = new T.Object3D(),
    z = new T.Vector3(0, 0, 1),
    warm = new T.Color(1, 0.78, 0.42);
  cells.forEach((cell, i) => {
    const flat = cell.receiver === "walls" || cell.receiver === "floor";
    dummy.scale.setScalar(flat ? 0.2 : cell.receiver === "chair" ? 0.14 : 0.08);
    dummy.position.copy(v(cell.point)).addScaledVector(v(cell.normal), 0.003);
    dummy.quaternion.setFromUnitVectors(z, v(cell.normal));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    // Fixed display transfer, never normalised to the brightest current hit.
    mesh.setColorAt(
      i,
      warm
        .clone()
        .multiplyScalar(
          (flat ? 0.18 : cell.receiver === "chair" ? 0.25 : 0.7) *
            (1 - Math.exp(-cell.power / 0.025)),
        ),
    );
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
}
