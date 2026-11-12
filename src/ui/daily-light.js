import { dailyLeafLight, dailyPercent } from "../models/daily-light.js";

const q = (id) => document.getElementById("lm-daily-" + id);
const titles = {
  off: "Лампа выключена",
  low: "Лампы пока мало",
  enough: "По ориентиру света хватает",
  high: "Света больше ориентира",
  uncertain: "Результат на границе",
};

export function renderDailyLight(state, result, selectedLeaf) {
  const summary = dailyLeafLight(result, state, selectedLeaf);
  q("panel").hidden = false;
  q("switch").hidden = Boolean(summary);
  q("reference").hidden = !summary;
  const fill = summary?.fill ?? 0;
  const angle = 2 * Math.PI * fill;
  const x = 48 + 25 * Math.sin(angle),
    y = 48 - 25 * Math.cos(angle);
  const path =
    fill === 0
      ? ""
      : fill === 1
        ? "M48 23 A25 25 0 1 1 48 73 A25 25 0 1 1 48 23 Z"
        : `M48 48 L48 23 A25 25 0 ${fill > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
  q("fill").setAttribute("d", path);
  if (!summary) {
    q("title").textContent = "Для оценки выбери листья";
    q("amount").textContent =
      "Оболочка кроны показывает распределение, но не свет на конкретном листе.";
    q("context").textContent =
      "Переключись на листья, чтобы сравнить их досветку с ориентиром растения.";
    q("icon").setAttribute(
      "aria-label",
      "Оценка по листьям недоступна в режиме оболочки",
    );
    return null;
  }
  const percentages = summary.ratioRange.map(dailyPercent);
  const amount =
    percentages[0] === percentages[1] ? percentages[0] : percentages.join("–");
  q("title").textContent = titles[summary.kind];
  q("amount").textContent =
    `${amount} от нижнего ориентира · ${state.hours} ч в день`;
  const location = `Лист ${summary.leaf + 1}, более освещённая сторона.`;
  const explanation =
    summary.kind === "uncertain"
      ? " Разные допущения дают разную оценку."
      : summary.kind === "high"
        ? " Выше верхней границы; это не порог ожога."
        : "";
  q("context").textContent =
    `${location}${explanation} Свет окна не учтён. Оценка относится к этому листу.` +
    (summary.sparse
      ? " Мало попаданий лучей: оценка слабого света неточная."
      : "");
  q("icon").setAttribute(
    "aria-label",
    `${titles[summary.kind]}. ${amount} нижнего ориентира на листе ${summary.leaf + 1}`,
  );
  return summary;
}
