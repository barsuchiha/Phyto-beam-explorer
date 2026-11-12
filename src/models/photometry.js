// normalized photon intensity, finite emitters, horizontal receiver.
// Digitized Samsung LM301B CRI80 Rev.10.1, p.15, Ts25C/If65mA.
// Average of left/right graph samples; rotational symmetry and angular spectral invariance assumed.
const lm301b = [
  1, 0.995, 0.985, 0.965, 0.941, 0.908, 0.869, 0.826, 0.774, 0.711, 0.642,
  0.566, 0.484, 0.397, 0.306, 0.211, 0.126, 0.055, 0,
];
function relative(theta) {
  const x = Math.max(0, Math.min(18, (theta * 180) / Math.PI / 5)),
    i = Math.min(17, Math.floor(x));
  return lm301b[i] + (lm301b[i + 1] - lm301b[i]) * (x - i);
}
let integral = 0;
const da = Math.PI / 2 / 1800;
for (let i = 0; i < 1800; i++) {
  const a = (i + 0.5) * da;
  integral += relative(a) * Math.sin(a) * da;
}
const curveNorm = 1 / (2 * Math.PI * integral),
  nativeAngle = 2 * (55 + (5 * (0.566 - 0.5)) / (0.566 - 0.484));
function sampleEmitters(groups, h, t, density = 1) {
  const result = [];
  for (const a of groups) {
    const local = [];
    if (a.points) {
      local.push(...a.points);
    } else if (a.disc) {
      const nr = 4 * density,
        na = 24 * density;
      for (let i = 0; i < nr; i++)
        for (let j = 0; j < na; j++) {
          const r = Math.sqrt((i + 0.5) / nr),
            p = (2 * Math.PI * (j + 0.5)) / na;
          local.push([
            (a.w / 2) * r * Math.cos(p),
            (a.d / 2) * r * Math.sin(p),
          ]);
        }
    } else {
      const nx = Math.max(4, Math.ceil(a.w / 0.01)) * density,
        ny = Math.max(3, Math.ceil(a.d / 0.01)) * density;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++)
          local.push([
            a.w * ((i + 0.5) / nx - 0.5),
            a.d * ((j + 0.5) / ny - 0.5),
          ]);
    }
    for (const [u, v, weight] of local)
      result.push({
        x: a.x + u * Math.cos(t),
        y: a.y + v,
        z: h + u * Math.sin(t),
        weight: (a.weight ?? 1 / groups.length) * (weight ?? 1 / local.length),
      });
  }
  return result;
}
function fieldAt(x, y, emitters, angle, t, flux) {
  if (flux === 0) return 0;
  const n = Math.log(0.5) / Math.log(Math.cos((angle * Math.PI) / 360));
  const norm = (flux * (n + 1)) / (2 * Math.PI),
    st = Math.sin(t),
    ct = Math.cos(t);
  let value = 0;
  for (const a of emitters) {
    const dx = x - a.x,
      dy = y - a.y,
      r2 = dx * dx + dy * dy + a.z * a.z,
      r = Math.sqrt(r2);
    const c = (st * dx + ct * a.z) / r;
    if (c > 0 && a.z > 0) {
      const intensity =
        angle === "lm301b"
          ? flux * curveNorm * relative(Math.acos(Math.min(1, c)))
          : norm * Math.pow(Math.min(1, c), n);
      value += (intensity * a.weight * a.z) / (r2 * r);
    }
  }
  return value;
}
function summarize(groups, h, t, angle, flux, density = 1) {
  const emitters = sampleEmitters(groups, h, t, density),
    nr = 12 * density,
    na = 48 * density;
  let sum = 0;
  const samples = [];
  for (let i = 0; i < nr; i++)
    for (let j = 0; j < na; j++) {
      const r = Math.sqrt((i + 0.5) / nr),
        p = (2 * Math.PI * (j + 0.5 + (i % 2) * 0.5)) / na;
      const value = fieldAt(
        0.28 * r * Math.cos(p),
        0.22 * r * Math.sin(p),
        emitters,
        angle,
        t,
        flux,
      );
      sum += value;
      samples.push({ i, j, value });
    }
  return {
    mean: sum / (nr * na),
    center: fieldAt(0, 0, emitters, angle, t, flux),
    samples,
    nr,
    na,
  };
}

export const photometry = {
  sampleEmitters,
  fieldAt,
  summarize,
  relative,
  curveNorm,
  nativeAngle,
};
