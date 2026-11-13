import { add, mul, sub } from "./crown.js";
import { olivePoint } from "./olive.js";

// Use the same CAD parts for the drawing and the wall-clearance envelope.
export function visibleFixtureMesh(state, mesh) {
  if (/light_output_placeholder/i.test(mesh.name)) return false;
  if (state.model === "G2" && /Reflector_(back|surface)/.test(mesh.name))
    return false;
  return !(
    ["large", "pendantPanel"].includes(state.mount) &&
    /Light_module_shell|Removable_top_cover|Yoke_side|Passive_suspension_crossbar/.test(
      mesh.name,
    )
  );
}

export function fixtureDepth(state, pose, geometry) {
  let front = Infinity,
    back = -Infinity;
  const include = (p) => {
    front = Math.min(front, p[1]);
    back = Math.max(back, p[1]);
  };
  const meshes = (items, transform = (p) => p) => {
    for (const m of items)
      for (let i = 0; i < m.v.length; i += 3)
        include(transform(m.v.slice(i, i + 3).map((v) => v / 10000)));
  };
  meshes(pose.meshes.filter((m) => visibleFixtureMesh(state, m)));
  if (geometry.olive) {
    meshes(pose.baseMeshes, (p) => olivePoint(p, state.towerTurn));
    for (const [block, angle] of geometry.olive.angles.entries()) {
      meshes(pose.moduleMeshes, (p) => olivePoint(p, angle, block));
      if (block < 2)
        meshes(pose.jointMeshes, (p) => olivePoint(p, angle, block));
    }
  }
  for (const surface of [
    ...geometry.boards,
    ...geometry.surfaces,
    ...(geometry.olive?.collisionSurfaces ?? []),
  ])
    for (const key of ["a", "b", "c", "d"]) include(surface[key]);
  for (const points of geometry.screenSupports) points.forEach(include);
  for (const s of geometry.sources) {
    // Include the bulb / replacement head behind the emitting face.
    const bulb = geometry.source.type === "bulb";
    const enlarged = ["large", "pendantPanel"].includes(state.mount);
    if (!bulb && !enlarged) continue;
    const w = bulb ? s.w : geometry.mount.body[0] / 1000 + 0.02;
    const d = bulb ? s.d : geometry.mount.body[1] / 1000;
    const h = bulb
      ? (geometry.source.size[2] ?? geometry.source.drawHeight) / 1000 + 0.045
      : 0.09;
    for (const x of [-w / 2, w / 2])
      for (const y of [-d / 2, d / 2])
        for (const z of [0, h])
          include(add(s.p, add(mul(s.u, x), add(mul(s.v, y), mul(s.n, -z)))));
  }
  return { front, back };
}

// Translate all optical geometry together. Vectors/normals stay unchanged.
// The olive BVH is local to its CAD template, so translate incoming rays back.
export function translateFixture(geometry, y) {
  if (!y) return;
  const shift = [0, y, 0];
  for (const source of geometry.sources) {
    source.p = add(source.p, shift);
    if (source.anchor) source.anchor = add(source.anchor, shift);
  }
  for (const surface of new Set([
    ...geometry.boards,
    ...geometry.surfaces,
    ...(geometry.olive?.collisionSurfaces ?? []),
  ]))
    for (const key of ["a", "b", "c", "d"])
      surface[key] = add(surface[key], shift);
  for (const points of geometry.screenSupports)
    for (let i = 0; i < points.length; i++) points[i] = add(points[i], shift);
  if (geometry.olive) {
    const fixture = geometry.olive.fixture;
    geometry.olive.fixture = {
      hit: (origin, direction, limit) =>
        fixture.hit(sub(origin, shift), direction, limit),
    };
  }
}
