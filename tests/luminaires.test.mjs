import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { luminaires } from "../src/data/luminaires.js";
import { cadAssets } from "../src/data/cad-assets.js";
import {
  normalizeFitting,
  changeFitting,
  compatibleSources,
  sourceFit,
} from "../src/models/fitting.js";
import {
  buildLuminaireScene,
  flexibleSection,
  quad,
} from "../src/models/luminaire-scene.js";
import {
  calculateLuminaire,
  scatter,
  tracePath,
  triangles,
} from "../src/models/luminaire-light.js";
const cad = (id) =>
  JSON.parse(
    readFileSync(new URL("../data/cad/" + cadAssets[id].file, import.meta.url)),
  );
test("fits enforce dimensions, clearance and mount type on every model switch", () => {
  assert.deepEqual(compatibleSources("original"), ["square50"]);
  assert.deepEqual(compatibleSources("large"), [
    "square50",
    "compact21",
    "mf36",
  ]);
  assert.deepEqual(compatibleSources("e27"), ["eraE27_18", "eraE27_25"]);
  assert.equal(sourceFit("original", "compact21").ok, false);
  assert.equal(sourceFit("e27", "square50").ok, false);
  const initial = normalizeFitting({
    model: "A2",
    mount: "large",
    source: "mf36",
    screen: true,
  });
  for (const model of Object.keys(luminaires)) {
    const next = changeFitting(initial, "model", model);
    assert.ok(luminaires[model].mounts.includes(next.mount));
    assert.ok(compatibleSources(next.mount).includes(next.source));
    if (luminaires[model].optic !== "cone") assert.equal(next.screen, false);
  }
  const bulb = normalizeFitting({
    model: "luna",
    mount: "e27",
    source: "eraE27_25",
    dim: 5,
    screen: true,
  });
  assert.equal(bulb.dim, 100);
  assert.equal(bulb.screen, true);
});
test("every CAD pose has emitters with valid dimensions and orthogonal unit frames", () => {
  for (const model of Object.keys(luminaires))
    for (const [pose, data] of cad(model).entries()) {
      const s = normalizeFitting({ model, pose, install: 180, plantSize: 40 });
      const scene = buildLuminaireScene(s, data);
      assert.ok(scene.sources.length > 0, model);
      assert.ok(
        data.meshes.every((m) => m.t.length % 3 === 0 && m.v.length % 3 === 0),
      );
      for (const src of scene.sources) {
        assert.ok(src.w > 0 && src.d > 0);
        assert.ok(src.p.every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(...src.n) - 1) < 1e-9);
        assert.ok(
          Math.abs(src.n.reduce((a, x, i) => a + x * src.u[i], 0)) < 1e-9,
        );
      }
    }
});
test("Soltech screens fit both bulb sizes and panel heads without enclosing the body", () => {
  for (const model of ["luna", "stello", "archetto", "pinocchio"])
    for (const [pose, data] of cad(model).entries())
      for (const [mount, source] of [
        ["e27", "eraE27_18"],
        ["e27", "eraE27_25"],
        ["pendantPanel", "mf36"],
      ])
        for (const opening of [0, 120]) {
          const state = normalizeFitting({
            model,
            pose,
            mount,
            source,
            screen: true,
            opening,
            sector: 360,
          });
          const on = buildLuminaireScene(state, data);
          const off = buildLuminaireScene({ ...state, screen: false }, data);
          assert.deepEqual(on.sources, off.sources);
          assert.equal(off.surfaces.length, 0);
          assert.equal(off.screenSupports.length, 0);
          assert.equal(on.screenSupports.length, 3);
          const emitter = on.sources[0];
          const radius =
            (mount === "e27"
              ? emitter.w / 2
              : Math.hypot(...on.mount.body.slice(0, 2)) / 2000) + 0.01;
          for (const face of on.surfaces)
            for (const p of [face.a, face.b, face.c, face.d]) {
              assert.ok(p.every(Number.isFinite));
              assert.ok(
                p[2] <= emitter.p[2] + 1e-10,
                "screen stays forward of the light exit",
              );
              assert.ok(
                Math.hypot(p[0] - emitter.p[0], p[1] - emitter.p[1]) >=
                  radius - 1e-10,
              );
            }
        }
});
test("Soltech screen changes photon paths while preserving PPF and the complete balance", () => {
  const data = cad("luna")[0];
  const state = normalizeFitting({
    model: "luna",
    mount: "e27",
    source: "eraE27_25",
    screen: true,
    opening: 0,
    sector: 360,
    plantSize: 50,
  });
  const bare = calculateLuminaire(
    state,
    buildLuminaireScene({ ...state, screen: false }, data),
    16384,
  );
  for (const material of ["absorb", "mirror", "diffuse"]) {
    const s = { ...state, material },
      scene = buildLuminaireScene(s, data);
    assert.equal(scene.collision, false);
    const result = calculateLuminaire(s, scene, 16384);
    assert.equal(result.metrics[1].flux, bare.metrics[1].flux);
    const b = result.metrics[1].budget;
    assert.ok(
      Math.abs(b.target + b.room + b.screen + b.housing + b.residual - 1) <
        1e-9,
    );
    assert.ok(b.screen > 0);
    assert.ok(b.returned <= b.target);
    if (material === "absorb") assert.ok(b.room < bare.metrics[1].budget.room);
  }
});
test("flexible canopy preserves arc length, published edge gaps and fixed emitter positions", () => {
  const data = cad("B3flex")[0];
  let positions;
  for (const [turn, gap] of [
    [140, 0.1468],
    [105, 0.2339],
    [70, 0.3138],
  ]) {
    const f = flexibleSection(turn);
    assert.ok(Math.abs(f.radius * f.angle - 0.165) < 1e-12);
    assert.ok(Math.abs(f.gap - gap) < 0.00015);
    const scene = buildLuminaireScene(normalizeFitting({ canopy: turn }), data);
    const current = scene.sources.map((s) => s.p);
    if (positions) assert.deepEqual(current, positions);
    positions = current;
  }
  assert.equal(buildLuminaireScene(normalizeFitting(), data).collision, false);
  assert.equal(
    buildLuminaireScene(normalizeFitting({ install: 130 }), data).collision,
    true,
  );
});
test("mirror follows reflection law, including a horizontal normal for diffuse scattering", () => {
  const n = [Math.SQRT1_2, 0, Math.SQRT1_2];
  const out = scatter([1, 0, 0], n, "mirror", 0.5, 0.5);
  assert.ok(Math.abs(out[0]) < 1e-10);
  assert.ok(Math.abs(out[2] + 1) < 1e-10);
  const diffuse = scatter([0, 0, -1], [0, 0, 1], "diffuse", 0.7, 0.2);
  assert.ok(diffuse.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...diffuse) - 1) < 1e-9);
  assert.ok(diffuse[2] > 0);
  const g = {
    crown: { center: [0, 0, -1], rx: 0.5, ry: 0.5, rz: 0.5 },
    triangles: triangles([
      quad([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]),
    ]),
  };
  const r = tracePath(g, [0, 0, 1], [0, 0, -1], "mirror", 0.9);
  assert.equal(r.kind, "room");
  assert.ok(Math.abs(r.absorbed + 0.9 - 1) < 1e-10);
});
test("Lambertian point-source sphere capture agrees with R²/D²", () => {
  const state = normalizeFitting({
    model: "A2",
    mount: "large",
    source: "mf36",
    material: "absorb",
  });
  const scene = {
    sources: [
      {
        p: [0, 0, 2],
        n: [0, 0, -1],
        u: [1, 0, 0],
        v: [0, 1, 0],
        w: 1e-7,
        d: 1e-7,
      },
    ],
    surfaces: [],
    boards: [],
    crown: { center: [0, 0, 0], rx: 0.5, ry: 0.5, rz: 0.5 },
  };
  const r = calculateLuminaire(state, scene, 16384);
  assert.ok(Math.abs(r.metrics[1].budget.target - 0.5 ** 2 / 2 ** 2) < 0.001);
  assert.ok(Math.abs(r.mean - r.metrics[1].flux / (16 * Math.PI)) < 0.01);
});
test("B3 balances all photon endpoints and converges across ray counts", () => {
  const data = cad("B3flex")[0];
  for (const material of ["absorb", "mirror", "diffuse"]) {
    const s = normalizeFitting({ material, install: 150 }),
      g = buildLuminaireScene(s, data);
    const lo = calculateLuminaire(s, g, 16384),
      hi = calculateLuminaire(s, g, 65536);
    const b = hi.metrics[1].budget;
    assert.ok(
      Math.abs(b.target + b.room + b.screen + b.housing + b.residual - 1) <
        1e-9,
    );
    assert.ok(b.returned <= b.target);
    assert.ok(b.residual < 0.001);
    assert.ok(
      Math.abs(lo.mean - hi.mean) / hi.mean < 0.04,
      `${material}: ${lo.mean} / ${hi.mean}`,
    );
  }
});
