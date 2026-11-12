import * as T from "../vendor/three.module.min.js";
import { glowTexture } from "./room-view.js";

// An explanatory haze along computed paths, not a simulation of air scattering.
export function populateRayLight(glowGroup, pathGroup, rays) {
  const positions = [],
    colors = [],
    lines = [],
    lineColors = [];
  const warm = new T.Color(1, 0.78, 0.4);
  rays.forEach((ray, index) => {
    if (!(ray.strength > 0)) return;
    const strength = Math.min(1.5, Math.sqrt(ray.strength / 60));
    const c = warm.clone().multiplyScalar(strength);
    for (let i = 1; i < ray.points.length; i++) {
      const a = new T.Vector3(...ray.points[i - 1]),
        b = new T.Vector3(...ray.points[i]);
      const count = Math.min(180, Math.ceil(a.distanceTo(b) / 0.045));
      for (let j = 0; j < count; j++) {
        const p = a.clone().lerp(b, (j + 0.5) / count);
        positions.push(...p.toArray());
        colors.push(...c.toArray());
      }
      if (index % 4 === 0) {
        lines.push(...a.toArray(), ...b.toArray());
        lineColors.push(...c.toArray(), ...c.toArray());
      }
    }
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  glowGroup.add(
    new T.Points(
      geometry,
      new T.PointsMaterial({
        map: glowTexture(),
        color: 0xffffff,
        vertexColors: true,
        size: 0.055,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    ),
  );
  const lineGeometry = new T.BufferGeometry();
  lineGeometry.setAttribute("position", new T.Float32BufferAttribute(lines, 3));
  lineGeometry.setAttribute(
    "color",
    new T.Float32BufferAttribute(lineColors, 3),
  );
  pathGroup.add(
    new T.LineSegments(
      lineGeometry,
      new T.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.19,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    ),
  );
}
