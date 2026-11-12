import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { lightWorkerFile } from "../src/data/worker-asset.js";
import { cadAssets } from "../src/data/cad-assets.js";
import {
  normalizeFitting,
  changeFitting,
  compatibleSources,
} from "../src/models/fitting.js";
import { buildLuminaireScene } from "../src/models/luminaire-scene.js";
import { oliveAngles, olivePoint, OLIVE_PRESETS } from "../src/models/olive.js";
import {
  calculateLuminaire,
  lightOutput,
  tracePath,
} from "../src/models/luminaire-light.js";
const pose = JSON.parse(
  readFileSync(new URL("../data/cad/" + cadAssets.olive.file, import.meta.url)),
)[0];
const state = (patch = {}) =>
  normalizeFitting({
    model: "olive",
    receiver: "leaves",
    towerTurn: 0,
    jointMiddle: 0,
    jointTop: 0,
    ...patch,
  });
const close = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test("olive joints accumulate, keep heights and rigid frames, and only accept the proposed strip cassette", () => {
  assert.deepEqual(compatibleSources("oliveCassette"), ["compact21"]);
  const old = normalizeFitting({});
  const s = changeFitting(old, "model", "olive");
  assert.equal(s.receiver, "leaves");
  assert.equal(s.source, "compact21");
  assert.deepEqual(oliveAngles(s), [0, 45, 90]);
  const a = buildLuminaireScene(state(), pose),
    b = buildLuminaireScene(
      state({ towerTurn: -50, jointMiddle: 90, jointTop: -125 }),
      pose,
    );
  assert.equal(a.sources.length, 6);
  assert.equal(a.collision, false);
  assert.deepEqual(
    oliveAngles(state({ towerTurn: -50, jointMiddle: 90, jointTop: -125 })),
    [-50, 40, -85],
  );
  for (let i = 0; i < 6; i++) {
    close(a.sources[i].p[2], b.sources[i].p[2]);
    close(
      Math.hypot(...a.sources[i].p.slice(0, 2)),
      Math.hypot(...b.sources[i].p.slice(0, 2)),
    );
    close(a.sources[i].w, 0.149);
    close(a.sources[i].d, 0.024);
    close(
      b.sources[i].u.reduce((s, v, j) => s + v * b.sources[i].v[j], 0),
      0,
    );
    close(Math.hypot(...b.sources[i].n), 1);
  }
  assert.deepEqual(
    lightOutput(state(), 6).fluxes,
    lightOutput(state({ jointMiddle: 150 }), 6).fluxes,
  );
  close(lightOutput(state({ dim: 100 }), 6).fluxes[1], 54.06);
  assert.deepEqual(OLIVE_PRESETS.alternate, [0, 120, -120]);
});

test("olive optical skin preserves clear front, frosted slots and reflective metal in rotated poses", () => {
  for (const turn of [-175, 0, 125]) {
    const g = buildLuminaireScene(state({ towerTurn: turn }), pose);
    const ray = (p, d) =>
      g.fixture.hit(olivePoint(p, turn), olivePoint(d, turn));
    const clear = ray([0, 0, 0.254], [0, -1, 0]);
    assert.equal(clear.kind, "clear");
    close(clear.transmission, 0.92);
    // Side A is the original front panel rotated -120 degrees. Its central
    // long capsule in odd row 2 is at local z=39 mm (plus pedestal 54 mm).
    const direction = [-Math.sqrt(3) / 2, 0.5, 0];
    const frost = ray([0, 0, 0.093], direction);
    const metal = ray([0, 0, 0.1], direction);
    assert.equal(frost.kind, "frost");
    close(frost.transmission, 0.75);
    assert.equal(metal.kind, "screen");
    const outside = g.fixture.hit(
      olivePoint(
        direction.map((v, i) => (i === 2 ? 0.1 : v * 0.2)),
        turn,
      ),
      olivePoint(
        direction.map((v) => -v),
        turn,
      ),
    );
    assert.equal(outside.kind, "housing");
  }
});

test("one transparent skin attenuates once and forward scattering does not count as returned reflection", () => {
  const fixture = {
    hit(o, d, limit) {
      const distance = (1 - o[0]) / d[0];
      return distance > 1e-7 && distance < limit
        ? { distance, kind: "clear", transmission: 0.4, n: [-1, 0, 0] }
        : null;
    },
  };
  const geometry = {
    crown: { center: [0, 10, 0], rx: 1, ry: 1, rz: 1 },
    triangles: [],
    fixture,
  };
  const r = tracePath(geometry, [0, 0, 0], [1, 0, 0], "mirror", 0.9);
  assert.equal(r.kind, "room");
  close(r.weight, 0.4);
  close(r.absorbed, 0.6);
  assert.equal(r.bounces, 0);
});

test("olive rotations change plant delivery while conserving PPF, and capture converges", () => {
  const results = [];
  for (const s of [
    state(),
    state({ towerTurn: 180 }),
    state({ material: "absorb" }),
    state({ material: "diffuse", clearTransmission: 0, slotTransmission: 0 }),
  ]) {
    const g = buildLuminaireScene(s, pose),
      r = calculateLuminaire(s, g, 32768);
    results.push(r);
    for (const m of r.metrics) {
      const b = m.budget;
      close(b.target + b.room + b.screen + b.housing + b.residual, 1, 1e-8);
      assert.ok(b.returned <= b.target + 1e-9);
    }
  }
  assert.ok(results[0].mean > results[1].mean * 10);
  assert.deepEqual(results[0].output.fluxes, results[1].output.fluxes);
  const high = calculateLuminaire(
    state(),
    buildLuminaireScene(state(), pose),
    65536,
  );
  close(
    high.metrics[1].budget.target,
    results[0].metrics[1].budget.target,
    0.004,
  );
  assert.ok(Math.abs(high.mean / results[0].mean - 1) < 0.035);
  assert.equal(
    buildLuminaireScene(state({ plantOffset: -50 }), pose).collision,
    true,
  );
});

test("published worker is versioned and produces the same result as the shared calculator", async () => {
  const url = new URL("../data/workers/" + lightWorkerFile, import.meta.url);
  const hash = createHash("sha256")
    .update(readFileSync(url))
    .digest("hex")
    .slice(0, 12);
  assert.equal(lightWorkerFile, `light-${hash}.js`);
  const s = state(),
    expected = calculateLuminaire(s, buildLuminaireScene(s, pose), 2048);
  const code = `import {parentPort,workerData} from 'node:worker_threads';
    globalThis.self={postMessage:data=>parentPort.postMessage(data)};
    await import(${JSON.stringify(url.href)});self.onmessage({data:workerData});`;
  const worker = new Worker(
    new URL("data:text/javascript," + encodeURIComponent(code)),
    {
      workerData: { state: s, pose, rayCount: 2048, referenceRayCount: 2048 },
    },
  );
  try {
    const data = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    assert.ok(!data.error, data.error);
    close(data.result.mean, expected.mean);
    assert.deepEqual(data.result.metrics, expected.metrics);
    assert.deepEqual(data.result.leaves, expected.leaves);
    assert.ok(Number.isFinite(data.reference.mean));
  } finally {
    await worker.terminate();
  }
});
