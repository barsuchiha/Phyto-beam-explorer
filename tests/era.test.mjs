import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseQuadrantIES, createIESCurve } from "../src/models/ies.js";
import { greenLineIES } from "../src/data/era-ies.js";
import { eraModel } from "../src/models/era.js";
import { photometry } from "../src/models/photometry.js";
import { createCalculator } from "../src/calculate.js";
import { defaults, updateState, restoreState } from "../src/state.js";

const near = (a, b, eps = 1e-8) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const radians = (degrees) => (degrees * Math.PI) / 180;
const raw = fs.readFileSync(
  new URL("../data/era/green-line-18.ies", import.meta.url),
);
const data = parseQuadrantIES(raw.toString("utf8"));
const curve = eraModel.curve;

test("archived ERA IES matches imported data, source identity and hash", () => {
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    greenLineIES.sha256,
  );
  assert.equal(data.luminaire, "ФИТО-18W-PFR-GR");
  for (const key of Object.keys(data))
    assert.deepEqual(data[key], greenLineIES[key]);
  assert.equal(data.vertical.length, 91);
  assert.equal(data.horizontal.length, 10);
  assert.equal(data.lampFlux, -1); // Absolute intensities; -1 is not a photon flux.
  near(curve.total, 36.009668131376095, 1e-9);
  near(curve.upwardFraction, 0.049585323845338876, 1e-10);
  near(curve.fwhm[0], 116.5925925925926);
  near(curve.fwhm[1], 116.1);
});

test("IES nodes, bilinear interpolation, quadrant symmetry and normalization", () => {
  for (let j = 0; j < data.horizontal.length; j++)
    for (let i = 0; i < data.vertical.length; i++)
      near(
        curve.intensity(radians(data.vertical[i]), radians(data.horizontal[j])),
        data.intensities[j][i],
      );
  const i = 18,
    j = 3,
    expected =
      (data.intensities[j][i] +
        data.intensities[j][i + 1] +
        data.intensities[j + 1][i] +
        data.intensities[j + 1][i + 1]) /
      4;
  near(curve.intensity(radians(37), radians(35)), expected);
  for (const phi of [35, -35, 145, 215, 325, 395])
    near(curve.intensity(radians(37), radians(phi)), expected);
  let total = 0,
    up = 0;
  const step = radians(0.25);
  // Independent midpoint quadrature over the full sphere, not the implementation's analytic integral.
  for (let i = 0; i < 720; i++)
    for (let j = 0; j < 1440; j++) {
      const theta = (i + 0.5) * step,
        phi = (j + 0.5) * step;
      const flux =
        36 *
        curve.normalizedIntensity(theta, phi) *
        Math.sin(theta) *
        step *
        step;
      total += flux;
      if (i >= 360) up += flux;
    }
  near(total, 36, 0.0002);
  near(up / total, curve.upwardFraction, 0.00001);
  assert.ok(curve.intensity(radians(150), 0) > 0); // The backward lobe was retained.
});

test("IES importer honors multiplier and rejects truncated or unsupported files", () => {
  const text = raw.toString("utf8");
  const twice = parseQuadrantIES(text.replace("1 -1 1 91 10", "1 -1 2 91 10"));
  near(createIESCurve(twice).total, curve.total * 2);
  for (const bad of [
    text.replace("TILT=NONE", "TILT=INCLUDE"),
    text.replace("91 10 1 2", "91 10 2 2"),
    text.replace("91 10 1 2", "91 10 1 1"),
    text.slice(0, text.lastIndexOf(" ")),
  ])
    assert.throws(() => parseQuadrantIES(bad));
});

test("IES point source has correct units, distance law and receiver cosine", () => {
  const point = [{ x: 0, y: 0, z: 0.4, weight: 1 }];
  near(
    photometry.fieldAt(0, 0, point, curve, 0, 36),
    (36 * 10.83) / curve.total / 0.16,
  );
  near(
    photometry.fieldAt(0, 0, [{ ...point[0], z: 0.8 }], curve, 0, 36) * 4,
    photometry.fieldAt(0, 0, point, curve, 0, 36),
  );
  const isotropic = createIESCurve({
    vertical: [0, 90, 180],
    horizontal: [0, 90],
    intensities: [
      [1, 1, 1],
      [1, 1, 1],
    ],
  });
  near(isotropic.total, 4 * Math.PI);
  // A rearward ray can still hit the horizontal receiver when the source tilts.
  const x = -1,
    t = radians(80),
    r2 = x * x + 0.16;
  assert.ok(Math.sin(t) * x + Math.cos(t) * 0.4 < 0);
  near(
    photometry.fieldAt(x, 0, point, isotropic, t, 10),
    ((10 / (4 * Math.PI)) * 0.4) / (r2 * Math.sqrt(r2)),
  );
  near(photometry.fieldAt(x, 0, point, curve, t, 0), 0);
});

test("GREEN LINE uses distributed geometry, converges and approaches whole-fixture far field", () => {
  const groups = eraModel.layout("eraGreen18", 1);
  const normal = eraModel.summarize("eraGreen18", groups, 0.2, radians(20), 36);
  const dense = eraModel.summarize(
    "eraGreen18",
    groups,
    0.2,
    radians(20),
    36,
    2,
  );
  assert.ok(Math.abs(normal.mean / dense.mean - 1) < 0.01);
  assert.ok(Math.abs(normal.center / dense.center - 1) < 0.01);
  const far = eraModel.summarize("eraGreen18", groups, 5, 0, 36);
  assert.ok(Math.abs(far.center / far.pointAlternative.center - 1) < 0.01);
  const nearField = eraModel.summarize("eraGreen18", groups, 0.4, 0, 36);
  assert.ok(
    Math.abs(nearField.center / nearField.pointAlternative.center - 1) > 0.1,
  );
});

test("E27 range varies only assumed beam; PPF stays fixed and base is 120 degrees", () => {
  for (const id of ["eraE27_18", "eraE27_25"]) {
    const m = eraModel.modules[id],
      groups = eraModel.layout(id, 1);
    const result = eraModel.summarize(id, groups, 0.4, 0, m.ppf);
    const base = photometry.summarize(groups, 0.4, 0, 120, m.ppf);
    near(base.mean, result.mean);
    near(base.center, result.center);
    assert.equal(result.scenarios.length, 3);
    for (const s of result.scenarios)
      for (const key of ["mean", "center"])
        assert.ok(
          result.range[key][0] <= s[key] && s[key] <= result.range[key][1],
        );
    const off = eraModel.summarize(id, groups, 0.4, 0, 0);
    near(off.range.mean[1], 0);
  }
});

test("ERA controls cannot silently invent dimming, manual PPF or an unverified driver", () => {
  const calculate = createCalculator();
  for (const [id, m] of Object.entries(eraModel.modules))
    for (const count of [1, 2, 4]) {
      const state = {
        ...defaults,
        source: id,
        count,
        dim: 0,
        dim2: 0,
        ppf: 0,
        angle: 30,
        driver: "lcm25",
        current: 1050,
      };
      const result = calculate(state);
      near(result.flux, m.ppf * count);
      assert.equal(result.dim, 100);
      assert.equal(result.op, null);
      assert.equal(result.ranged, !m.ies);
      assert.equal(result.g.length, count);
      const varied = calculate({
        ...state,
        dim: 50,
        dim2: 95,
        ppf: 400,
        angle: 90,
      });
      near(varied.metrics.mean, result.metrics.mean);
      const higher = calculate({ ...state, height: 80 });
      assert.ok(higher.metrics.mean < result.metrics.mean);
      const tilted = calculate({ ...state, tilt: 20 });
      assert.ok(Number.isFinite(tilted.metrics.mean));
      near(result.daily, result.metrics.mean * 12 * 0.0036);
      assert.equal(
        restoreState({ schema: "phyto-beams-v6", ...state }).source,
        id,
      );
    }
  assert.equal(
    updateState({ ...defaults, count: 4 }, "source", "eraGreen18").count,
    1,
  );
  assert.equal(
    updateState(
      { ...defaults, source: "eraGreen18", count: 4 },
      "source",
      "eraE27_18",
    ).count,
    4,
  );
  assert.equal(
    updateState(
      { ...defaults, source: "eraE27_18", count: 4 },
      "source",
      "mf36",
    ).count,
    1,
  );
});
