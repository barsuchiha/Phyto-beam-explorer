import * as T from "../vendor/three.module.min.js";
import { WINDOW } from "../models/window-light.js";

// A visual aperture, not a render-derived measurement of daylight.
export function populateWindow(group, state) {
  if (state.windowWeather === "off") return;
  const sunny = state.windowWeather === "sunny",
    y = WINDOW.y - 0.008;
  const box = (w, d, h, x, z, color) => {
    const mesh = new T.Mesh(
      new T.BoxGeometry(w, d, h),
      new T.MeshBasicMaterial({ color }),
    );
    mesh.position.set(x, y - d / 2, z);
    group.add(mesh);
    return mesh;
  };
  const w = WINDOW.x[1] - WINDOW.x[0],
    h = WINDOW.z[1] - WINDOW.z[0],
    x = (WINDOW.x[1] + WINDOW.x[0]) / 2,
    z = (WINDOW.z[1] + WINDOW.z[0]) / 2;
  box(
    w,
    0.008,
    h,
    x,
    z,
    new T.Color(sunny ? 0xa4c5ce : 0xa0aeb2).multiplyScalar(
      Math.min(1.4, 0.25 + (0.75 * (state.windowLevel ?? 100)) / 100),
    ),
  );
  const disc = (r, cx, cz, color) => {
    const mesh = new T.Mesh(
      new T.CircleGeometry(r, 40),
      new T.MeshBasicMaterial({ color, side: T.DoubleSide }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(cx, y - 0.015, cz);
    group.add(mesh);
  };
  if (sunny) disc(0.14, WINDOW.x[1] - 0.3, WINDOW.z[1] - 0.3, 0xffe4a6);
  else
    for (const [dx, dz, r] of [
      [-0.2, 0, 0.14],
      [0, 0.05, 0.19],
      [0.2, 0, 0.13],
    ])
      disc(r, x + dx, z + 0.3 + dz, 0xcbd2d0);
  for (const xx of WINDOW.x) box(0.045, 0.06, h + 0.09, xx, z, 0xe0ddce);
  for (const zz of WINDOW.z) box(w + 0.09, 0.06, 0.045, x, zz, 0xe0ddce);
  box(0.035, 0.065, h, x, z, 0xe0ddce);
  box(w + 0.16, 0.2, 0.035, x, WINDOW.z[0] - 0.03, 0xcec7b5);
}
