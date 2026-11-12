// Deliberately limited importer: Type C, TILT=NONE, metres, quadrant symmetry,
// full vertical sphere. Reject other formats instead of silently misreading them.
export function parseQuadrantIES(text) {
  const parts = text.split(/TILT=NONE\s*/);
  if (parts.length !== 2) throw new Error("Expected TILT=NONE");
  const values = parts[1].trim().split(/\s+/).map(Number);
  if (values.some((v) => !Number.isFinite(v)))
    throw new Error("Invalid IES numbers");
  const [
    lamps,
    lampFlux,
    multiplier,
    nv,
    nh,
    type,
    units,
    width,
    length,
    height,
  ] = values;
  if (
    type !== 1 ||
    units !== 2 ||
    lamps !== 1 ||
    multiplier <= 0 ||
    !Number.isInteger(nv) ||
    !Number.isInteger(nh) ||
    nv < 2 ||
    nh < 2
  )
    throw new Error("Unsupported IES header");
  if (values.length !== 13 + nv + nh + nv * nh)
    throw new Error("Incomplete IES");
  const vertical = values.slice(13, 13 + nv);
  const horizontal = values.slice(13 + nv, 13 + nv + nh);
  const increasing = (a) => a.every((v, i) => !i || v > a[i - 1]);
  if (
    !increasing(vertical) ||
    !increasing(horizontal) ||
    vertical[0] !== 0 ||
    vertical.at(-1) !== 180 ||
    horizontal[0] !== 0 ||
    horizontal.at(-1) !== 90
  )
    throw new Error("Expected complete sphere and quadrant symmetry");
  const start = 13 + nv + nh;
  const intensities = Array.from({ length: nh }, (_, i) =>
    values
      .slice(start + i * nv, start + (i + 1) * nv)
      .map((v) => v * multiplier),
  );
  if (intensities.flat().some((v) => v < 0))
    throw new Error("Negative IES intensity");
  return {
    luminaire: parts[0].match(/\[LUMINAIRE\]\s*([^\r\n]+)/)?.[1] ?? "",
    lampFlux,
    width,
    length,
    height,
    inputWatts: values[12],
    vertical,
    horizontal,
    intensities,
  };
}

const radians = (degrees) => (degrees * Math.PI) / 180;
// Exact integral of a linearly interpolated intensity times sin(theta).
function strip(a, b, ia, ib) {
  return (
    ia * (Math.cos(a) - Math.cos(b)) +
    ((ib - ia) / (b - a)) * (Math.sin(b) - Math.sin(a) - (b - a) * Math.cos(b))
  );
}
export function createIESCurve(data) {
  const { vertical, horizontal, intensities } = data;
  function integral(from = 0, to = 180) {
    const rows = intensities.map((row) => {
      let sum = 0;
      for (let i = 0; i < vertical.length - 1; i++) {
        const lo = Math.max(from, vertical[i]),
          hi = Math.min(to, vertical[i + 1]);
        if (hi <= lo) continue;
        const at = (a) =>
          row[i] +
          ((row[i + 1] - row[i]) * (a - vertical[i])) /
            (vertical[i + 1] - vertical[i]);
        sum += strip(radians(lo), radians(hi), at(lo), at(hi));
      }
      return sum;
    });
    let sum = 0;
    for (let j = 0; j < horizontal.length - 1; j++)
      sum +=
        ((rows[j] + rows[j + 1]) / 2) *
        radians(horizontal[j + 1] - horizontal[j]);
    return 4 * sum;
  }
  function bracket(angles, value) {
    let lo = 0,
      hi = angles.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (angles[mid] > value) hi = mid;
      else lo = mid;
    }
    return [
      lo,
      Math.min(
        1,
        Math.max(0, (value - angles[lo]) / (angles[lo + 1] - angles[lo])),
      ),
    ];
  }
  function intensity(theta, phi) {
    const gamma = Math.max(0, Math.min(180, (theta * 180) / Math.PI));
    // Reflect each quadrant; keep the two C planes distinct, not rotationally averaged.
    const c =
      (Math.atan2(Math.abs(Math.sin(phi)), Math.abs(Math.cos(phi))) * 180) /
      Math.PI;
    const [i, t] = bracket(vertical, gamma),
      [j, u] = bracket(horizontal, c);
    const at = (row) => row[i] + (row[i + 1] - row[i]) * t;
    return at(intensities[j]) * (1 - u) + at(intensities[j + 1]) * u;
  }
  const total = integral();
  if (!(total > 0)) throw new Error("IES has no emitted flux");
  function fwhm(row) {
    const half = row[0] / 2;
    const i = row.findIndex((v) => v <= half);
    if (i <= 0) return null;
    return (
      2 *
      (vertical[i - 1] +
        ((vertical[i] - vertical[i - 1]) * (row[i - 1] - half)) /
          (row[i - 1] - row[i]))
    );
  }
  return {
    id: "era-green-line-18-ies",
    total,
    upwardFraction: integral(90, 180) / total,
    fwhm: [fwhm(intensities[0]), fwhm(intensities.at(-1))],
    intensity,
    normalizedIntensity: (theta, phi) => intensity(theta, phi) / total,
  };
}
