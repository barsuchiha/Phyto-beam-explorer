import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { plants, groups } from "../src/data/plants.js";
import { plantShapes } from "../src/data/plant-shapes.js";
import {
  plantIllustration,
  plantArt,
} from "../src/models/plant-illustration.js";
import { normalizeFitting, changeFitting } from "../src/models/fitting.js";
import { plantLightNotes } from "../src/data/plant-light-notes.js";
import { buildLeafGeometry } from "../src/models/leaf-geometry.js";
import { crownGeometry } from "../src/models/crown.js";
import { calculateLuminaire } from "../src/models/luminaire-light.js";

test("all 40 plants have matching art, geometry, working light groups and selectable options", () => {
  const ids = Object.keys(plants).sort();
  assert.equal(ids.length, 40);
  assert.deepEqual(Object.keys(plantShapes).sort(), ids);
  assert.deepEqual(Object.keys(plantArt).sort(), ids);
  assert.deepEqual(Object.keys(plantLightNotes).sort(), ids);
  const app = readFileSync(
    new URL("../src/models-app.js", import.meta.url),
    "utf8",
  );
  assert.match(app, /Object.entries\(plants\)/);
  for (const id of ids) {
    const p = plants[id],
      s = plantShapes[id];
    assert.ok(groups[p.group]);
    assert.ok(p.url.startsWith("https://"));
    assert.ok(s.min < s.initial && s.initial < s.max);
    assert.equal(
      changeFitting(normalizeFitting({}), "plant", id).plantSize,
      s.initial,
    );
    assert.equal(normalizeFitting({ plant: id }).plant, id);
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

test("all 20 additions calculate leaf PPFD at three sizes without changing source PPF", () => {
  for (const id of Object.keys(plants).slice(20)) {
    const spec = plantShapes[id];
    let flux;
    for (const height of [spec.min, spec.initial, spec.max]) {
      const state = normalizeFitting({
        model: "A2",
        mount: "large",
        source: "mf36",
        plant: id,
        plantSize: height,
        dim: 100,
      });
      const crown = crownGeometry(state);
      crown.soil = [0, 0, 0.2];
      const leafGeometry = buildLeafGeometry(crown, id, height);
      const scene = {
        crown,
        leafGeometry,
        surfaces: [],
        boards: [],
        sources: [
          {
            p: [0, 0, leafGeometry.bounds.max[2] + 0.25],
            n: [0, 0, -1],
            u: [1, 0, 0],
            v: [0, 1, 0],
            w: 1e-9,
            d: 1e-9,
          },
        ],
      };
      const r = calculateLuminaire(state, scene, 4096);
      assert.ok(Number.isFinite(r.mean) && r.mean > 0, id + " PPFD");
      assert.equal(state.plantSize, height);
      const m = r.metrics[r.middle];
      if (flux !== undefined) assert.equal(m.flux, flux);
      flux = m.flux;
      const incident = r.leaves.reduce(
        (sum, leaf) =>
          sum +
          leaf.area *
            leaf.sides.reduce((s, side) => s + side.values[r.middle], 0),
        0,
      );
      assert.ok(
        Math.abs(incident - m.budget.target * m.flux) < 1e-9,
        id + " flux conservation",
      );
    }
  }
});
