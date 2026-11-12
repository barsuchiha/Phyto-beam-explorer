import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ppfdMapColor,
  ppfdMapPosition,
  surfaceReadout,
  percentText,
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
  assert.equal(normalizeFitting({ colorMetric: "dli" }).colorMetric, "ppfd");
  assert.equal(
    normalizeFitting({ colorMetric: "dli-guide" }).colorMetric,
    "ppfd",
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
