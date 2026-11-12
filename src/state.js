import { profiles } from "./data/profiles.js";
import { drivers } from "./data/hardware.js";
import { plants } from "./data/plants.js";
import { plantShapes } from "./data/plant-shapes.js";

export const defaults = Object.freeze({
  source: "square50",
  angle: 60,
  height: 40,
  tilt: 0,
  dim: 70,
  dim2: 70,
  ppf: 50,
  plant: "monstera",
  hours: 12,
  count: 2,
  driver: "ldd",
  current: 700,
  plantSize: 100,
  orbit: 0,
  screenSector: 0,
  screenDepth: 15,
  screenOpening: 0,
  screenTurn: 0,
  screenMode: "absorb",
  reflectance: 90,
});
const bounded = (v, a, b, f) =>
  Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : f;
export function restoreState(value) {
  const saved = value?.modelContent ?? value;
  if (
    !saved ||
    ![
      "phyto-beams-v1",
      "phyto-beams-v2",
      "phyto-beams-v3",
      "phyto-beams-v4",
      "phyto-beams-v5",
      "phyto-beams-v6",
      "phyto-beams-v7",
      "phyto-beams-v8",
      "phyto-beams-v9",
    ].includes(saved.schema)
  )
    return { ...defaults };
  const driver = Object.hasOwn(drivers, saved.driver) ? saved.driver : "ldd";
  const plant = Object.hasOwn(plants, saved.plant) ? saved.plant : "monstera";
  const shape = plantShapes[plant];
  const height = bounded(saved.height, 20, 100, 40);
  return {
    source: Object.hasOwn(profiles, saved.source) ? saved.source : "square50",
    angle: bounded(saved.angle, 30, 120, 60),
    height,
    tilt: bounded(saved.tilt, -20, 20, 0),
    dim: bounded(saved.dim, 0, 100, 70),
    dim2: bounded(saved.dim2, 0, 100, 70),
    ppf: bounded(saved.ppf, 0, 400, 50),
    plant,
    plantSize: bounded(saved.plantSize, shape.min, shape.max, shape.initial),
    orbit: bounded(saved.orbit, 0, 90, 0),
    screenSector: [0, 90, 180, 270, 360].includes(Number(saved.screenSector))
      ? Number(saved.screenSector)
      : 0,
    screenDepth: bounded(saved.screenDepth, 5, Math.min(40, height - 5), 15),
    screenOpening: bounded(saved.screenOpening, 0, 120, 0),
    screenTurn: bounded(saved.screenTurn, 0, 360, 0),
    screenMode: ["absorb", "mirror", "diffuse"].includes(saved.screenMode)
      ? saved.screenMode
      : "absorb",
    reflectance: bounded(saved.reflectance, 0, 100, 90),
    hours: bounded(saved.hours, 6, 16, 12),
    count: [1, 2, 4].includes(Number(saved.count)) ? Number(saved.count) : 2,
    driver,
    current: drivers[driver].currents.includes(Number(saved.current))
      ? Number(saved.current)
      : 700,
  };
}

export function updateState(state, key, value) {
  const next = { ...state };
  if (key === "plant" && value !== state.plant && plantShapes[value])
    next.plantSize = plantShapes[value].initial;
  if (
    key === "source" &&
    ["estimate", "era"].includes(profiles[value]?.kind) &&
    profiles[state.source].kind !== profiles[value]?.kind
  )
    next.count = 1;
  next[key] = ["source", "plant", "driver", "screenMode"].includes(key)
    ? value
    : Number(value);
  return restoreState({ schema: "phyto-beams-v9", ...next });
}

// Keep the exported widget's key and envelope so existing visitors retain their
// settings on the same Pages URL, including the previous query-string scope.
export function storageKey(location) {
  return `codex:visualization-widget-state-v2:${JSON.stringify([location.pathname, location.search])}`;
}
export function loadState(storage, location) {
  try {
    return restoreState(
      JSON.parse(storage?.getItem(storageKey(location)) ?? "null"),
    );
  } catch {
    return { ...defaults };
  }
}
export function saveState(storage, location, state) {
  try {
    storage?.setItem(
      storageKey(location),
      JSON.stringify({
        modelContent: { schema: "phyto-beams-v9", ...state },
        privateContent: null,
      }),
    );
  } catch {
    /* Denied or full storage must not interrupt the calculator. */
  }
}
