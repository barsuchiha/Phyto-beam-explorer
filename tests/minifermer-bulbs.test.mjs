import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bulbModel } from "../src/models/minifermer-bulbs.js";
import { createCalculator } from "../src/calculate.js";
import { defaults, updateState, restoreState } from "../src/state.js";
import {
  normalizeFitting,
  changeFitting,
  sourceFit,
} from "../src/models/fitting.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import {
  lightOutput,
  calculateLuminaire,
} from "../src/models/luminaire-light.js";
import { cadAssets } from "../src/data/cad-assets.js";

test("MiniFermer bulbs share assumed PPF, ignore unconfirmed DIM and restore saved choices", () => {
  for (const source of Object.keys(bulbModel.modules)) {
    const state = updateState(
      { ...defaults, screenSector: 180 },
      "source",
      source,
    );
    assert.equal(state.count, 1);
    assert.equal(state.screenSector, 0);
    assert.equal(
      restoreState({ ...state, schema: "phyto-beams-v9" }).source,
      source,
    );
    const scene = createCalculator()({ ...state, dim: 10 });
    assert.equal(scene.dim, 100);
    assert.ok(scene.bulb && scene.ranged);
    assert.equal(scene.flux, source === "mfE27_12" ? 23.75 : 42.75);
    assert.ok(scene.metrics.range.mean[0] < scene.metrics.mean);
    assert.ok(scene.metrics.range.mean[1] > scene.metrics.mean);
    const fitOutput = lightOutput({ source, dim: 0 }, 1);
    assert.equal(fitOutput.fluxes.length, 9);
    assert.equal(fitOutput.fluxes[4], scene.flux);
    assert.deepEqual(
      [...new Set(fitOutput.fluxes)],
      bulbModel.output(source).fluxes,
    );
    const groups = bulbModel.layout(source, 4);
    assert.equal(groups.length, 4);
    assert.ok(groups.every((g) => g.disc && g.w >= 0.1));
    assert.equal(bulbModel.output(source, 4).flux, 4 * scene.flux);
    assert.equal(sourceFit("e27", source).ok, true);
    assert.equal(sourceFit("large", source).ok, false);
    const changed = changeFitting(
      normalizeFitting({ model: "luna", screen: true, source: "eraE27_18" }),
      "source",
      source,
    );
    assert.equal(changed.screen, false);
    assert.equal(changed.dim, 100);
    assert.equal(normalizeFitting(changed).source, source);
  }
});

test("all nine bulb scenarios conserve photons with screens, and the map uses the central scenario", () => {
  const data = JSON.parse(
    readFileSync(
      new URL("../data/cad/" + cadAssets.luna.file, import.meta.url),
    ),
  )[0];
  for (const source of Object.keys(bulbModel.modules))
    for (const material of ["absorb", "mirror", "diffuse"]) {
      const state = normalizeFitting({
        model: "luna",
        source,
        plantSize: 50,
        screen: true,
        sector: 360,
        opening: 30,
        material,
      });
      const geometry = buildLuminaireScene(state, data);
      assert.equal(geometry.collision, false);
      const result = calculateLuminaire(state, geometry, 8192);
      assert.equal(result.middle, 4);
      assert.equal(result.metrics.length, 9);
      assert.equal(result.mean, result.metrics[4].mean);
      const integrated = result.bins.reduce(
        (sum, bin) => sum + bin.ppfd * bin.area,
        0,
      );
      assert.ok(Math.abs(integrated - result.mean * result.area) < 1e-8);
      for (const metric of result.metrics) {
        const b = metric.budget;
        assert.ok(
          Math.abs(b.target + b.room + b.screen + b.housing + b.residual - 1) <
            1e-9,
        );
        assert.ok(b.returned <= b.target);
        assert.ok(
          metric.mean >= result.range[0] && metric.mean <= result.range[1],
        );
      }
    }
});
