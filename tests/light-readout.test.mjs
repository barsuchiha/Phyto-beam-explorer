import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ppfdMapColor,
  ppfdMapPosition,
  surfaceReadout,
  surfaceMetricCards,
  percentText,
  lightMapScales,
  continuousLightColor,
} from "../src/models/light-readout.js";
import { normalizeFitting } from "../src/models/fitting.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import { calculateLuminaire } from "../src/models/luminaire-light.js";
import { calculateReferenceLight } from "../src/models/reference-light.js";
import { cadAssets } from "../src/data/cad-assets.js";

test("the shared PPFD map distinguishes weak side light without redefining its limits", () => {
  assert.equal(ppfdMapPosition(0), 0);
  assert.equal(ppfdMapPosition(300), 1);
  assert.equal(ppfdMapColor(600), ppfdMapColor(300));
  assert.equal(ppfdMapColor(-1), ppfdMapColor(0));
  // All these values fall below the old medium-group blue boundary at 9 h.
  const values = [0, 1, 5, 10, 20, 30];
  assert.equal(new Set(values.map(ppfdMapColor)).size, values.length);
  assert.ok(
    values.every(
      (v, i) => i === 0 || ppfdMapPosition(v) > ppfdMapPosition(values[i - 1]),
    ),
  );
  assert.equal(normalizeFitting({}).colorMetric, "ppfd");
  assert.equal(normalizeFitting({ colorMetric: "dli" }).colorMetric, "dli");
  assert.equal(
    normalizeFitting({ colorMetric: "dli-guide" }).colorMetric,
    "dli-guide",
  );
});

test("DLI uses a fixed logarithmic scale that resolves weak daily doses and includes zero", () => {
  const scale = lightMapScales.dli;
  assert.equal(scale.position(0), 0);
  assert.equal(scale.position(30), 1);
  assert.equal(scale.color(60), scale.color(30));
  assert.equal(scale.color(-1), scale.color(0));
  assert.deepEqual(
    scale.stops.map(([v]) => v),
    [0, 0.1, 0.5, 1, 3, 10, 30],
  );
  const values = [0, 0.01, 0.05, 0.1, 0.2, 0.8, 3, 10];
  assert.equal(new Set(values.map(scale.color)).size, values.length);
  for (const value of values) {
    assert.ok(
      Math.abs(
        scale.position(value) - Math.log1p(value / 0.1) / Math.log(301),
      ) < 1e-12,
    );
  }
  for (const [value, color] of scale.stops)
    assert.equal(scale.color(value), color);
});

test("DLI colours follow daily dose while PPFD colours stay independent of lighting hours", () => {
  // 100 µmol/m²/s for 12 h = 4.32 mol/m²/day; 200 for 6 h is the same dose.
  assert.equal(
    continuousLightColor(100, "dli", 12),
    lightMapScales.dli.color(4.32),
  );
  assert.equal(
    continuousLightColor(100, "dli", 12),
    continuousLightColor(200, "dli", 6),
  );
  assert.notEqual(
    continuousLightColor(100, "dli", 12),
    continuousLightColor(100, "dli", 6),
  );
  assert.equal(
    continuousLightColor(100, "ppfd", 12),
    continuousLightColor(100, "ppfd", 6),
  );
  assert.equal(continuousLightColor(0, "dli", 12), lightMapScales.dli.color(0));
  assert.equal(
    continuousLightColor(100, "dli", 0),
    lightMapScales.dli.color(0),
  );
});

test("surface readout preserves scenario ranges and selects a whole leaf side, not a patch peak", () => {
  const result = {
    range: [4, 8],
    output: { fluxes: [30, 50] },
    metrics: [{ budget: { target: 0.12 } }, { budget: { target: 0.08 } }],
    bins: [{ ppfd: 999 }],
    leaves: [
      {
        id: 0,
        sides: [
          { mean: 9, range: [5, 13] },
          { mean: 1, range: [0, 2] },
        ],
      },
      {
        id: 1,
        sides: [
          { mean: 3, range: [2, 4] },
          { mean: 18, range: [12, 24] },
        ],
      },
    ],
  };
  const r = surfaceReadout(result);
  assert.deepEqual(r.meanRange, [4, 8]);
  assert.deepEqual(r.captureRange, [0.08, 0.12]);
  assert.deepEqual(r.brightest, {
    mean: 18,
    range: [12, 24],
    leaf: 1,
    side: 1,
  });
  assert.equal(r.emitting, true);
  assert.equal(
    surfaceReadout({ ...result, output: { fluxes: [0, 0] } }).emitting,
    false,
  );
  assert.equal(
    surfaceReadout({ ...result, leaves: undefined }).brightest,
    null,
  );
});

test("small nonzero reflected fractions do not display as zero", () => {
  assert.equal(percentText(0), "0%");
  assert.equal(percentText(0.000387570071), "0,04%");
  assert.equal(percentText(0.000001), "<0,01%");
  assert.equal(percentText(0.08553674592), "8,6%");
});

test("both DLI maps switch leaf metrics and units, preserving scenarios and photon capture", () => {
  const result = {
    receiver: "leaves",
    range: [4, 8],
    middle: 0,
    output: { fluxes: [30, 50] },
    metrics: [{ budget: { target: 0.08 } }, { budget: { target: 0.08 } }],
    leaves: [
      {
        id: 7,
        sides: [
          { mean: 1, range: [0, 2] },
          { mean: 18, range: [12, 24] },
        ],
      },
    ],
  };
  const original = JSON.stringify(result);
  const ppfd = surfaceMetricCards(result, { colorMetric: "ppfd", hours: 9 });
  assert.equal(ppfd[0][1], "4–8");
  assert.equal(ppfd[1][1], "12–24");
  for (const colorMetric of ["dli", "dli-guide"]) {
    const dli = surfaceMetricCards(result, { colorMetric, hours: 9 });
    assert.equal(dli[0][1], "0,13–0,26");
    assert.equal(dli[1][1], "0,39–0,78");
    for (const card of dli.slice(0, 2)) {
      assert.ok(card[0].startsWith("DLI"));
      assert.match(card[2], /моль\/\(м²·сутки\).*9 ч\/день/);
      assert.ok(!card.join(" ").includes("PPFD"));
    }
    assert.deepEqual(dli[2], ppfd[2]);
    const longer = surfaceMetricCards(result, { colorMetric, hours: 12 });
    assert.equal(longer[0][1], "0,17–0,35");
    assert.equal(longer[1][1], "0,52–1,04");
    const crown = surfaceMetricCards(
      { ...result, receiver: "crown", leaves: undefined },
      { colorMetric, hours: 9 },
    );
    assert.equal(crown[0][1], dli[0][1]);
    assert.ok(!crown.flat().join(" ").includes("PPFD"));
  }
  assert.equal(JSON.stringify(result), original);
  assert.deepEqual(
    surfaceMetricCards(result, { colorMetric: "ppfd", hours: 12 }),
    ppfd,
  );
});

test("DLI metric formatting keeps narrow scenario ranges and zero flux", () => {
  const result = {
    receiver: "leaves",
    range: [0.1, 1],
    middle: 0,
    output: { fluxes: [1] },
    metrics: [{ budget: { target: 0.1 } }],
    leaves: [{ id: 0, sides: [{ mean: 1, range: [0.1, 1] }] }],
  };
  const state = { colorMetric: "dli", hours: 9 };
  assert.equal(surfaceMetricCards(result, state)[0][1], "0–0,03");
  const off = {
    ...result,
    range: [0, 0],
    output: { fluxes: [0] },
    leaves: [{ id: 0, sides: [{ mean: 0, range: [0, 0] }] }],
  };
  const cards = surfaceMetricCards(off, state);
  assert.equal(cards[0][1], "0");
  assert.equal(cards[1][1], "0");
  assert.equal(cards[2][1], "—");
});

test("the screenshot's side-lit olive case has illuminated leaves despite a zero top detector", () => {
  const state = normalizeFitting({
    model: "olive",
    plant: "lyrata",
    plantSize: 105,
    hours: 9,
    dim: 100,
    receiver: "leaves",
    towerTurn: 0,
    jointMiddle: 0,
    jointTop: 0,
  });
  const pose = JSON.parse(
    readFileSync(
      new URL("../data/cad/" + cadAssets.olive.file, import.meta.url),
    ),
  )[0];
  const scene = buildLuminaireScene(state, pose);
  assert.equal(scene.collision, false);
  const result = calculateLuminaire(state, scene, 16384);
  const readout = surfaceReadout(result);
  const reference = calculateReferenceLight(state, scene, 16384);
  assert.equal(reference.mean, 0);
  assert.ok(readout.meanRange[0] > 5 && readout.meanRange[1] < 8);
  assert.ok(readout.brightest.mean > 20);
  assert.ok(readout.captureRange[0] > 0.07 && readout.captureRange[1] < 0.1);
  const b = result.metrics[result.middle].budget;
  assert.ok(
    Math.abs(
      (b.target * result.metrics[result.middle].flux) / result.area -
        readout.meanRange[0],
    ) < 1e-9,
  );
});
