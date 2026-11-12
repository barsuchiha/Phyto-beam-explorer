import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createCalculator } from "../src/calculate.js";
import {
  defaults,
  restoreState,
  updateState,
  loadState,
  saveState,
  storageKey,
} from "../src/state.js";

const fixtures = JSON.parse(
  fs.readFileSync(new URL("./fixtures/baseline.json", import.meta.url)),
);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("every source retains its pre-refactor PPFD, DLI, range and plant assessment", () => {
  const calculate = createCalculator({ geometry: "plane" });
  for (const { overrides, expected } of fixtures) {
    const result = calculate(Object.freeze({ ...defaults, ...overrides }));
    if (expected.error) {
      assert.equal(result.op.reason, expected.error);
      assert.equal(result.metrics, undefined);
      continue;
    }
    near(result.flux, expected.flux);
    near(result.metrics.mean, expected.mean);
    near(result.metrics.center, expected.center);
    near(result.daily, expected.daily);
    assert.deepEqual(result.assessment.percentages, expected.percentages);
    if (expected.range)
      for (const name of ["mean", "center"])
        result.metrics.range[name].forEach((value, i) =>
          near(value, expected.range[name][i]),
        );
  }
});

test("duration and plant changes reuse optics but refresh the assessment", () => {
  const calculate = createCalculator({ geometry: "plane" });
  const initial = calculate(defaults);
  const longer = calculate({ ...defaults, hours: 16, plant: "zz" });
  assert.equal(initial.metrics, longer.metrics);
  near(longer.daily / initial.daily, 16 / 12);
  assert.notEqual(initial.assessment, longer.assessment);
  assert.equal(longer.selected.name, "Замиокулькас");
  const invalid = calculate({ ...defaults, driver: "lcm25" });
  assert.equal(invalid.metrics, undefined);
  near(calculate(defaults).metrics.mean, initial.metrics.mean);
});

test("v1-v6 widget settings and the original storage envelope still load", () => {
  const location = { pathname: "/Phyto-beam-explorer/", search: "" };
  const key =
    'codex:visualization-widget-state-v2:["/Phyto-beam-explorer/",""]';
  assert.equal(storageKey(location), key);
  for (let v = 1; v <= 6; v++) {
    const envelope = {
      modelContent: {
        schema: `phyto-beams-v${v}`,
        ...defaults,
        source: "mf36",
        count: 1,
        dim: 100,
      },
      privateContent: null,
    };
    const storage = new Map([[key, JSON.stringify(envelope)]]);
    const adapter = {
      getItem: (k) => storage.get(k),
      setItem: (k, value) => storage.set(k, value),
    };
    const state = loadState(adapter, location);
    assert.equal(state.source, "mf36");
    assert.equal(state.dim, 100);
    saveState(adapter, location, { ...state, height: 75 });
    assert.equal(loadState(adapter, location).height, 75);
    assert.equal(
      JSON.parse(storage.get(key)).modelContent.schema,
      "phyto-beams-v8",
    );
  }
  assert.notEqual(storageKey({ ...location, search: "?test" }), key);
});

test("missing, corrupt, denied and full storage never break startup or changes", () => {
  const location = { pathname: "/", search: "" };
  assert.deepEqual(loadState(undefined, location), defaults);
  assert.deepEqual(loadState({ getItem: () => "{broken" }, location), defaults);
  assert.deepEqual(
    loadState(
      {
        getItem: () => {
          throw new Error("denied");
        },
      },
      location,
    ),
    defaults,
  );
  assert.doesNotThrow(() =>
    saveState(
      {
        setItem: () => {
          throw new Error("quota");
        },
      },
      location,
      defaults,
    ),
  );
  assert.deepEqual(restoreState({ schema: "unknown" }), defaults);
  const normalized = restoreState({
    schema: "phyto-beams-v6",
    source: "constructor",
    plant: "__proto__",
    driver: "toString",
    height: 500,
    tilt: -90,
    dim: -10,
    hours: 100,
    count: 3,
    current: 999,
  });
  assert.equal(normalized.source, "square50");
  assert.equal(normalized.plant, "monstera");
  assert.equal(normalized.driver, "ldd");
  assert.equal(normalized.height, 100);
  assert.equal(normalized.tilt, -20);
  assert.equal(normalized.dim, 0);
  assert.equal(normalized.hours, 16);
  assert.equal(normalized.count, 2);
  assert.equal(normalized.current, 700);
});

test("source transitions and driver changes preserve control rules", () => {
  const first = updateState(defaults, "source", "mf193");
  assert.equal(first.count, 1);
  assert.equal(updateState({ ...first, count: 4 }, "source", "mf36").count, 4);
  assert.equal(
    updateState({ ...defaults, current: 1000 }, "driver", "lcm40").current,
    700,
  );
  assert.equal(updateState(defaults, "height", "75").height, 75);
});
