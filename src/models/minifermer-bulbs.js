import { minifermerBulbs, bulbAssumptions } from "../data/minifermer-bulbs.js";
import { estimateModel } from "./minifermer.js";

function output(id, count = 1) {
  const m = minifermerBulbs[id];
  const base = m.watts.map((watts, i) => watts * bulbAssumptions.efficacy[i]);
  const full = base.map((f) => f * count);
  // Built-in mains driver: no confirmed DIM; ignore requested dim percentages.
  return { base, full, fluxes: full, flux: full[1] };
}
function layout(id, count = 1) {
  const d = minifermerBulbs[id].size[0] / 1000;
  return Array.from({ length: count }, (_, i) => ({
    x: count === 1 ? 0 : i % 2 === 0 ? -0.18 : 0.18,
    y: count === 4 ? (i < 2 ? -0.18 : 0.18) : 0,
    w: d,
    d,
    disc: true,
  }));
}
export const bulbModel = {
  modules: minifermerBulbs,
  angles: bulbAssumptions.angles,
  output,
  layout,
  // All nine combinations: three PPF hypotheses × three independent beam shapes.
  summarize: estimateModel.summarize,
};
