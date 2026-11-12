export const formatRange = (values, digits = 0) => {
  const k = 10 ** digits,
    format = (v) =>
      v.toLocaleString("ru-RU", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
  const lo = Math.floor(values[0] * k + 1e-9) / k,
    hi = Math.ceil(values.at(-1) * k - 1e-9) / k;
  return lo === hi ? format(lo) : format(lo) + "–" + format(hi);
};

export const decimal = (v) =>
  v.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
export const number = (v) =>
  v > 0 && v < 1 ? "<1" : Math.round(v).toLocaleString("ru-RU");
