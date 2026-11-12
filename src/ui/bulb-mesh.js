import * as T from "../vendor/three.module.min.js";

// Visual approximation of the open, finned MiniFermer body from product photos.
// Only the outer envelope is sourced. Fin count/profile are illustrative,
// and these meshes are not part of the optical or thermal calculation.
export function miniFermerBody(radius, length) {
  const group = new T.Group();
  const metal = (color) =>
    new T.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.4 });
  function lathe(points, material) {
    const mesh = new T.Mesh(
      new T.LatheGeometry(
        points.map((p) => new T.Vector2(...p)),
        48,
      ),
      material,
    );
    mesh.rotation.x = Math.PI / 2;
    group.add(mesh);
  }
  const r = radius,
    h = length;
  lathe(
    [
      [0, 0],
      [r, 0],
      [r, h * 0.02],
      [r * 0.68, h * 0.04],
      [r * 0.6, h * 0.32],
      [0.017, h * 0.66],
      [0, h * 0.66],
    ],
    metal(0x929792),
  );
  const rib = new T.Shape();
  rib.moveTo(r * 0.66, h * 0.025);
  rib.lineTo(r * 0.99, h * 0.025);
  rib.quadraticCurveTo(r * 0.94, h * 0.35, r * 0.62, h * 0.52);
  rib.lineTo(0.017, h * 0.68);
  rib.lineTo(0.016, h * 0.58);
  rib.lineTo(r * 0.57, h * 0.3);
  rib.closePath();
  for (let i = 0; i < 32; i++) {
    const geometry = new T.ExtrudeGeometry(rib, {
      depth: 0.0008,
      bevelEnabled: false,
      curveSegments: 8,
    });
    geometry.rotateX(Math.PI / 2);
    const mesh = new T.Mesh(geometry, metal(0xd1d5cf));
    mesh.rotation.z = (i * Math.PI) / 16;
    group.add(mesh);
  }
  lathe(
    [
      [0.017, h * 0.65],
      [0.019, h * 0.68],
      [0.017, h * 0.75],
      [0.0135, h * 0.84],
    ],
    new T.MeshStandardMaterial({ color: 0xe7e6db, roughness: 0.6 }),
  );
  lathe(
    [
      [0.0135, h * 0.82],
      [0.0135, h],
      [0, h],
    ],
    metal(0xb1aca0),
  );
  return group;
}
