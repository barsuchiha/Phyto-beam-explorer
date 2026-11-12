import { groups, plants, categories } from "../data/plants.js";

// broad light groups, explicit scenario thresholds (not injury limits).
const dli = (ppfd, hours) => ppfd * hours * 0.0036;
function classify(value, group) {
  const { L, U } = groups[group];
  return value < L * 0.5
    ? 0
    : value < L
      ? 1
      : value <= U
        ? 2
        : value < U * 2
          ? 3
          : 4;
}
function evaluate(values, hours, group) {
  const counts = [0, 0, 0, 0, 0],
    classes = values.map((v) => {
      const c = classify(dli(v, hours), group);
      counts[c]++;
      return c;
    });
  return {
    classes,
    counts,
    percentages: counts.map((c) =>
      values.length ? (100 * c) / values.length : 0,
    ),
  };
}

export const plantModel = {
  groups,
  plants,
  categories,
  dli,
  classify,
  evaluate,
};
