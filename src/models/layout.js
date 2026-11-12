import { profiles } from "../data/profiles.js";
import { estimateModel } from "./minifermer.js";
import { mini36Model } from "./mini36.js";
import { eraModel } from "./era.js";

export function layout(state) {
  const p = profiles[state.source];
  if (p.kind === "era") return eraModel.layout(state.source, state.count);
  if (p.kind === "estimate")
    return (state.source === "mf36" ? mini36Model : estimateModel).layout(
      state.count,
    );
  if (p.kind === "catalog") {
    if (state.source === "linear98")
      return Array.from({ length: state.count }, (_, i) => ({
        x: 0,
        y: (i - (state.count - 1) / 2) * 0.12,
        w: p.w,
        d: p.d,
      }));
    if (state.count === 1) return [{ x: 0, y: 0, w: p.w, d: p.d }];
    return Array.from({ length: state.count }, (_, i) => ({
      x: i % 2 === 0 ? -0.18 : 0.18,
      y: state.count === 4 ? (i < 2 ? -0.06 : 0.06) : 0,
      w: p.w,
      d: p.d,
    }));
  }
  if (p.kind === "pair")
    return [
      { x: -0.18, y: 0, w: p.w, d: p.d },
      { x: 0.18, y: 0, w: p.w, d: p.d },
    ];
  if (p.kind === "petal")
    return Array.from({ length: p.n }, (_, i) => {
      const a = (i * 2 * Math.PI) / p.n;
      return {
        x: 0.085 * Math.cos(a),
        y: 0.085 * Math.sin(a),
        w: 0.075,
        d: 0.06,
      };
    });
  return [{ x: 0, y: 0, w: p.w, d: p.d, disc: p.kind === "disc" }];
}
