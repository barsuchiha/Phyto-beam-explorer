import { luminaires, mounts, fittingSources } from "../data/luminaires.js";
import { plantShapes } from "../data/plant-shapes.js";

export function sourceFit(mountId, sourceId) {
  const mount = mounts[mountId],
    source = fittingSources[sourceId];
  if (!mount || !source || mount.type !== source.type)
    return { ok: false, reason: "Другой тип крепления" };
  if (mount.type === "bulb")
    return {
      ok: source.size[0] <= mount.maxDiameter,
      reason:
        source.size[0] <= mount.maxDiameter
          ? "Открытый подвес E27; высота и масса проверяются отдельно"
          : `Диаметр ${source.size[0]} мм превышает габарит примерки ${mount.maxDiameter} мм`,
      rotated: false,
    };
  const [w, d] = source.size,
    [a, b] = mount.opening.map((x) => x - 2 * mount.margin);
  const straight = w <= a && d <= b,
    rotated = d <= a && w <= b;
  return {
    ok: straight || rotated,
    rotated: !straight && rotated,
    reason:
      straight || rotated
        ? "Входит в окно с заданным зазором"
        : `Не входит в окно ${mount.opening.join(" × ")} мм с зазором ${mount.margin} мм`,
  };
}
export const compatibleSources = (mount) =>
  Object.keys(fittingSources).filter((id) => sourceFit(mount, id).ok);
export const modelDefaults = {
  model: "B3flex",
  pose: 0,
  mount: "original",
  source: "square50",
  plant: "monstera",
  plantSize: 100,
  install: 150,
  plantOffset: 0,
  dim: 70,
  hours: 12,
  canopy: 105,
  flap: 45,
  screen: false,
  opening: 60,
  sector: 180,
  material: "mirror",
  reflectance: 90,
};
const clamp = (v, lo, hi, fallback) =>
  Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback;
export function normalizeFitting(input = {}) {
  const s = { ...modelDefaults, ...input };
  if (!Object.hasOwn(luminaires, s.model)) s.model = modelDefaults.model;
  const m = luminaires[s.model];
  if (!m.mounts.includes(s.mount)) s.mount = m.mounts[0];
  const allowed = compatibleSources(s.mount);
  if (!allowed.includes(s.source)) s.source = allowed[0];
  if (!Object.hasOwn(plantShapes, s.plant)) s.plant = "monstera";
  const p = plantShapes[s.plant];
  s.plantSize = clamp(s.plantSize, p.min, p.max, p.initial);
  s.pose = Math.round(
    clamp(
      s.pose,
      0,
      ["B2", "B3", "G2", "pinocchio"].includes(s.model)
        ? 2
        : ["luna", "archetto", "B3flex"].includes(s.model)
          ? 0
          : 1,
      0,
    ),
  );
  s.install = clamp(s.install, 50, 250, m.install ?? 130);
  s.plantOffset = clamp(s.plantOffset, -60, 60, 0);
  s.dim = fittingSources[s.source].dimmable ? clamp(s.dim, 0, 100, 70) : 100;
  s.hours = clamp(s.hours, 6, 16, 12);
  s.canopy = clamp(s.canopy, 70, 140, 105);
  s.flap = clamp(s.flap, 25, 65, 45);
  s.screen = m.optic === "cone" && s.screen === true;
  s.opening = clamp(s.opening, 0, 120, 60);
  s.sector = [90, 180, 270, 360].includes(Number(s.sector))
    ? Number(s.sector)
    : 180;
  s.material = ["absorb", "mirror", "diffuse"].includes(s.material)
    ? s.material
    : "mirror";
  s.reflectance = clamp(s.reflectance, 0, 100, 90);
  return s;
}
export function changeFitting(state, key, value) {
  const next = { ...state, [key]: value };
  if (key === "model" && luminaires[value]) {
    next.pose = 0;
    next.install = luminaires[value].install ?? 130;
    next.mount = luminaires[value].mounts[0];
  }
  if (key === "plant" && plantShapes[value])
    next.plantSize = plantShapes[value].initial;
  const normalized = normalizeFitting(next);
  if (
    normalized.source.startsWith("mfE27_") &&
    normalized.source !== state.source
  )
    normalized.screen = false;
  return normalized;
}
