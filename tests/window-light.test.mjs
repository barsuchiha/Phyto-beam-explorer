import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WINDOW,
  calculateWindowLight,
  windowDose,
  windowSettings,
} from "../src/models/window-light.js";
import { dailyPlantLight, dailyLeafLight } from "../src/models/daily-light.js";
import { normalizeFitting } from "../src/models/fitting.js";
const near = (a, b, e = 1e-5) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
function receiver(y = WINDOW.reference[1], size = 0.002) {
  const [x, , z] = WINDOW.reference;
  const triangles = [
    [
      [x - size, y, z - size],
      [x - size, y, z + size],
      [x + size, y, z + size],
    ],
    [
      [x - size, y, z - size],
      [x + size, y, z + size],
      [x + size, y, z - size],
    ],
  ];
  const area = 4 * size * size;
  return {
    leafGeometry: {
      leaves: [{ id: 0, area, patches: [0] }],
      patches: [{ id: 0, leaf: 0, area, triangles }],
      triangles: triangles.map((points) => ({ points, leaf: 0, patch: 0 })),
    },
  };
}
const state = {
  plant: "lyrata",
  hours: 10,
  windowWeather: "sunny",
  windowLevel: 100,
  daylightHours: 10,
  sunHours: 3,
};
const face = (dose) => ({
  mean: dose / 0.036,
  values: [dose / 0.036],
  range: [dose / 0.036, dose / 0.036],
  hits: 500,
});
const result = (a, b, windowA = 0, windowB = 0) => ({
  receiver: "leaves",
  middle: 0,
  output: { fluxes: [a || b ? 10 : 0] },
  leaves: [{ id: 0, area: 1, sides: [face(a), face(b)] }],
  windowLight: {
    leaves: [
      {
        id: 0,
        sides: [
          { diffuse: windowA / 7.2, beam: 0 },
          { diffuse: windowB / 7.2, beam: 0 },
        ],
      },
    ],
  },
});

test("window flux is calibrated to a facing reference and reaches only the exposed face", () => {
  const r = calculateWindowLight(receiver());
  near(r.leaves[0].sides[0].diffuse, 1, 0.002);
  near(r.leaves[0].sides[1].diffuse, 0);
  assert.ok(r.leaves[0].sides[0].beam > 0.8);
  near(r.leaves[0].sides[1].beam, 0);
});
test("diffuse window transport falls with distance and converges with aperture sampling", () => {
  const close = calculateWindowLight(receiver()).leaves[0].sides[0].diffuse;
  const scene = receiver(-0.5);
  const rough = calculateWindowLight(scene).leaves[0].sides[0].diffuse;
  const finer = calculateWindowLight(scene, {
    patchSamples: 24,
    columns: 12,
    rows: 12,
  }).leaves[0].sides[0].diffuse;
  assert.ok(rough < close * 0.3);
  near(rough, finer, 0.01);
});
test("opaque geometry blocks both skylight and direct sun before reaching the receiver", () => {
  const scene = receiver();
  scene.surfaces = [
    { a: [-2, 1, 0], b: [2, 1, 0], c: [2, 1, 3], d: [-2, 1, 3] },
  ];
  const r = calculateWindowLight(scene).leaves[0].sides[0];
  near(r.diffuse, 0);
  near(r.beam, 0);
});
test("another leaf casts a window shadow, using the same two-sided leaf geometry", () => {
  const scene = receiver(),
    blocker = receiver(1, 1.5).leafGeometry;
  scene.leafGeometry.triangles.push(
    ...blocker.triangles.map((t) => ({ ...t, leaf: 99, patch: 99 })),
  );
  const r = calculateWindowLight(scene).leaves[0].sides[0];
  near(r.diffuse, 0);
  near(r.beam, 0);
});
test("lamp and window durations are independent; sunny, cloudy and off have distinct doses", () => {
  const r = result(2, 0, 3, 0);
  near(dailyPlantLight(r, state).mean, 5);
  const moreLamp = dailyPlantLight(r, { ...state, hours: 16 });
  near(moreLamp.window, 3);
  near(moreLamp.lamp, 3.2);
  const moreDay = dailyPlantLight(r, { ...state, daylightHours: 16 });
  near(moreDay.window, 4.8);
  near(moreDay.lamp, 2);
  assert.ok(
    dailyPlantLight(r, { ...state, windowWeather: "cloudy" }).window < 3,
  );
  near(dailyPlantLight(r, { ...state, windowWeather: "off" }).mean, 2);
  near(windowDose({ diffuse: 1, beam: 1 }, { ...state, windowLevel: 0 }), 0);
  near(windowDose({ diffuse: 0, beam: 1 }, { ...state, sunHours: 0 }), 0);
});
test("a window works with the lamp off, and the sun uses total light on one physical face", () => {
  const r = result(4, 0, 0, 6);
  const plant = dailyPlantLight(r, state),
    leaf = dailyLeafLight(r, state, 0);
  near(plant.mean, 6);
  near(plant.lamp, 0);
  near(plant.window, 6);
  near(leaf.value, 6);
  assert.equal(leaf.side, 1);
  assert.notEqual(dailyPlantLight(result(0, 0, 6, 0), state).kind, "off");
  assert.notEqual(dailyLeafLight(result(0, 0, 6, 0), state, 0).kind, "off");
});
test("window uncertainty is correlated over the plant and adds to independent lamp scenarios", () => {
  const r = result(2, 0, 3, 0);
  near(dailyPlantLight(r, state).meanRange[0], 3.8);
  near(dailyPlantLight(r, state).meanRange[1], 6.2);
  assert.equal(dailyPlantLight(r, state).kind, "uncertain");
  const copy = JSON.stringify(r);
  dailyLeafLight(r, state, 0);
  dailyPlantLight(r, state);
  assert.equal(JSON.stringify(r), copy);
});
test("saved window controls migrate safely and sunlight duration cannot exceed daylight", () => {
  assert.equal(normalizeFitting().windowWeather, "off");
  const s = normalizeFitting({
    windowWeather: "alien",
    windowLevel: -2,
    daylightHours: 4,
    sunHours: 20,
  });
  assert.equal(s.windowWeather, "off");
  assert.equal(s.windowLevel, 0);
  assert.equal(s.sunHours, 4);
  assert.equal(
    windowSettings({ ...state, daylightHours: 4, sunHours: 7 }).sunHours,
    4,
  );
});

test("fully shaded foliage is low light, not a claim that an active window is switched off", () => {
  const r = result(0, 0, 0, 0);
  assert.equal(dailyPlantLight(r, state).kind, "low");
  assert.equal(dailyLeafLight(r, state, 0).kind, "low");
  assert.equal(
    dailyPlantLight(r, { ...state, windowWeather: "off" }).kind,
    "off",
  );
});
