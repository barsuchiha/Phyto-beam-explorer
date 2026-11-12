import * as T from "../vendor/three.module.min.js";
import { OLIVE_STEP } from "../models/olive.js";

export function populateOlive(group, pose, geometry, state) {
  function instance(meshes, angle, dz = 0) {
    const assembly = new T.Group();
    assembly.rotation.z = ((angle + 90) * Math.PI) / 180;
    assembly.position.z = dz;
    for (const m of meshes) {
      const g = new T.BufferGeometry();
      g.setAttribute(
        "position",
        new T.Float32BufferAttribute(
          m.v.map((v) => v / 10000),
          3,
        ),
      );
      g.setIndex(m.t);
      g.computeVertexNormals();
      const clear = m.color[3] < 0.3,
        frost = m.color[3] < 1 && !clear;
      const mesh = new T.Mesh(
        g,
        new T.MeshStandardMaterial({
          color: new T.Color(...m.color.slice(0, 3)).convertSRGBToLinear(),
          roughness: clear ? 0.15 : 0.65,
          metalness: clear || frost ? 0 : 0.25,
          transparent: clear,
          opacity: clear ? 0.12 : 1,
          depthWrite: !clear,
          side: T.DoubleSide,
        }),
      );
      assembly.add(mesh);
    }
    group.add(assembly);
    return assembly;
  }
  instance(pose.baseMeshes, state.towerTurn);
  for (let i = 0; i < 3; i++) {
    const block = instance(
      pose.moduleMeshes,
      geometry.olive.angles[i],
      i * OLIVE_STEP,
    );
    const cassette = new T.Mesh(
      new T.BoxGeometry(0.032, 0.02, 0.33),
      new T.MeshStandardMaterial({
        color: 0xb2b6af,
        roughness: 0.6,
        metalness: 0.65,
      }),
    );
    cassette.position.set(0, -0.001, 0.254);
    block.add(cassette);
    if (i < 2)
      instance(pose.jointMeshes, geometry.olive.angles[i], i * OLIVE_STEP);
  }
}
