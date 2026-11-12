// Finite conical sector: radial distance R(z) = radius + slope * z.
// Both roots are checked, including the linear limit of a ray parallel to a side.
export function wallDistance(x, y, z, dx, dy, dz, rig, epsilon = 1e-9) {
  if (!rig.sector || !rig.depth) return Infinity;
  const k = rig.slope ?? 0,
    radius = rig.radius + k * z,
    a = dx * dx + dy * dy - (k * dz) ** 2,
    b = x * dx + y * dy - radius * k * dz,
    c = x * x + y * y - radius * radius;
  let t0, t1;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-15) return Infinity;
    t0 = -c / (2 * b);
    t1 = Infinity;
  } else {
    const disc = b * b - a * c;
    if (disc < 0) return Infinity;
    // Stable quadratic roots avoid cancellation for rays near the linear limit.
    const q = -b - (b >= 0 ? 1 : -1) * Math.sqrt(disc);
    t0 = q / a;
    t1 = q ? c / q : -b / a;
    if (t0 > t1) [t0, t1] = [t1, t0];
  }
  for (const t of [t0, t1]) {
    if (!Number.isFinite(t) || t <= epsilon) continue;
    const hitZ = z + t * dz;
    if (hitZ < 0 || hitZ > rig.depth) continue;
    const az = Math.atan2(y + t * dy, x + t * dx) - (rig.turn * Math.PI) / 180;
    if (
      Math.abs(Math.atan2(Math.sin(az), Math.cos(az))) <=
      (rig.sector * Math.PI) / 360 + 1e-12
    )
      return t;
  }
  return Infinity;
}

export function wallNormal(x, y, rig) {
  const radial = Math.hypot(x, y),
    k = rig.slope ?? 0,
    norm = Math.hypot(1, k);
  return [-x / radial / norm, -y / radial / norm, k / norm];
}
