import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { plants, groups } from "../src/data/plants.js";
import { plantShapes } from "../src/data/plant-shapes.js";
import {
  plantIllustration,
  plantArt,
} from "../src/models/plant-illustration.js";
import { defaults, restoreState, updateState } from "../src/state.js";
import { createCalculator } from "../src/calculate.js";

test("all 20 plants have matching art, geometry, working light groups and selectable options", () => {
  const ids = Object.keys(plants).sort();
  assert.equal(ids.length, 20);
  assert.deepEqual(Object.keys(plantShapes).sort(), ids);
  assert.deepEqual(Object.keys(plantArt).sort(), ids);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const select = html.match(/<select[^>]*id="pbe-plant"[\s\S]*?<\/select>/)[0];
  const options = [...select.matchAll(/<option value="([^"]+)"/g)]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(options, ids);
  for (const id of ids) {
    const p = plants[id],
      s = plantShapes[id];
    assert.ok(groups[p.group]);
    assert.ok(p.url.startsWith("https://"));
    assert.ok(s.min < s.initial && s.initial < s.max);
    assert.equal(
      updateState(defaults, "plant", id).plantSize,
      id === "monstera" ? defaults.plantSize : s.initial,
    );
    assert.equal(
      restoreState({ schema: "phyto-beams-v9", ...defaults, plant: id }).plant,
      id,
    );
  }
});

test("visual leaf and leaflet counts grow monotonically within every species range", () => {
  for (const [id, s] of Object.entries(plantShapes)) {
    let previous = 0;
    for (let height = s.min; height <= s.max; height += 5) {
      const art = plantIllustration(id, height);
      assert.ok(
        art.leaves.length >= previous,
        `${id} at ${height} became sparser`,
      );
      previous = art.leaves.length;
      assert.ok(
        Number.isFinite(art.radius) &&
          art.radius > 0 &&
          Number.isFinite(art.top) &&
          art.top > 0,
      );
      for (const l of art.leaves) {
        for (const key of ["x", "y", "tx", "ty", "w"])
          assert.ok(Number.isFinite(l[key]), `${id} ${key}`);
        assert.ok(l.w > 0 && Math.hypot(l.tx - l.x, l.ty - l.y) > 0);
      }
      assert.ok(!JSON.stringify(art).includes("NaN"));
    }
    assert.ok(
      plantIllustration(id, s.max).leaves.length >
        plantIllustration(id, s.min).leaves.length,
    );
    assert.deepEqual(
      plantIllustration(id, s.initial),
      plantIllustration(id, s.initial),
    );
  }
});

test("every added plant calculates finite PPFD, retains its height bounds and preserves source flux", () => {
  const calculate = createCalculator();
  for (const id of Object.keys(plants).slice(10)) {
    const spec = plantShapes[id];
    let flux;
    for (const height of [spec.min, spec.initial, spec.max]) {
      const state = restoreState({
        schema: "phyto-beams-v9",
        ...defaults,
        plant: id,
        plantSize: height,
        count: 1,
        orbit: 45,
      });
      const r = calculate(state);
      assert.ok(Number.isFinite(r.metrics.mean) && r.metrics.mean > 0);
      assert.equal(state.plantSize, height);
      if (flux !== undefined) assert.equal(r.flux, flux);
      flux = r.flux;
      assert.equal(r.assessment.percentages.length, 5);
    }
  }
});
