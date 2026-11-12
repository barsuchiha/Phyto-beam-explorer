import {
  dailyLeafLight,
  dailyPlantLight,
  dailyPercent,
} from "../models/daily-light.js";

const q = (id) => document.getElementById("lm-daily-" + id);
const titles = {
  off: "Лампа выключена",
  low: "Лампы пока мало",
  enough: "По ориентиру света хватает",
  high: "Света больше ориентира",
  uncertain: "Результат на границе",
  partial: "Части листвы света мало",
  mixed: "Есть яркие и затенённые листья",
};
function paintSun(prefix, fill, label) {
  const angle = 2 * Math.PI * fill;
  const x = 48 + 25 * Math.sin(angle),
    y = 48 - 25 * Math.cos(angle);
  const path =
    fill === 0
      ? ""
      : fill === 1
        ? "M48 23 A25 25 0 1 1 48 73 A25 25 0 1 1 48 23 Z"
        : `M48 48 L48 23 A25 25 0 ${fill > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
  document.getElementById(prefix + "-fill").setAttribute("d", path);
  document.getElementById(prefix + "-icon").setAttribute("aria-label", label);
}
function percentRange(values) {
  const text = values.map(dailyPercent);
  return text[0] === text[1] ? text[0] : text.join("–");
}
export function renderDailyLight(state, result, selectedLeaf) {
  const summary = dailyPlantLight(result, state);
  q("panel").hidden = false;
  q("switch").hidden = Boolean(summary);
  q("reference").hidden = !summary;
  q("coverage").hidden = !summary;
  q("tip").hidden = !summary;
  document.getElementById("lm-leaf-day-panel").hidden = true;
  paintSun("lm-daily", summary?.fill ?? 0, "Досветка всего растения");
  if (!summary) {
    q("calculation").textContent =
      "Общее солнце требует геометрии листьев; оболочка не заменяет листву.";
    q("title").textContent = "Для оценки выбери листья";
    q("amount").textContent = "Для общего солнца нужен расчёт по всей листве.";
    q("context").textContent =
      "Переключись на листья, чтобы сравнить их досветку с ориентиром растения.";
    q("icon").setAttribute(
      "aria-label",
      "Оценка по листьям недоступна в режиме оболочки",
    );
    return null;
  }
  const amount = percentRange(summary.ratioRange);
  const title =
    summary.kind === "high"
      ? "Есть листья выше ориентира"
      : titles[summary.kind];
  q("title").textContent = title;
  q("amount").textContent =
    `Общая досветка: ${amount} · ${state.hours} ч в день`;
  q("coverage").textContent =
    `Нижний ориентир достигнут у ${percentRange(summary.reachedRange)} листвы — по площади.` +
    (summary.aboveRange[1] > 0
      ? ` Выше верхнего ориентира: ${percentRange(summary.aboveRange)}.`
      : "");
  const doses = summary.meanRange.map((v) =>
    v.toLocaleString("ru-RU", { maximumFractionDigits: 2 }),
  );
  q("calculation").textContent =
    `Общее солнце — условный индикатор по площади листьев: вклад каждого ограничен 100% нижнего ориентира, поэтому избыток не компенсирует тень. Берём более освещённую сторону каждого целого листа. Средний DLI этих сторон: ${doses[0] === doses[1] ? doses[0] : doses.join("–")} моль/(м²·сутки); условный ориентир ${summary.lower}–${summary.upper}. Это не процент потребности в росте и не прогноз здоровья.`;
  q("context").textContent =
    "Свет окна не учтён. Это условная оценка досветки, а не здоровья растения." +
    (summary.kind === "uncertain"
      ? " Допущения источника меняют результат."
      : "") +
    (summary.aboveRange[1] > 0 ? " Верхняя граница не означает ожог." : "") +
    (summary.sparse
      ? " На части листвы мало попаданий лучей; оценка слабого света неточная."
      : "");
  paintSun("lm-daily", summary.fill, `${title}. Общая досветка ${amount}`);

  // Clicking a leaf adds a local readout; the whole-plant sun stays unchanged.
  if (selectedLeaf < 0 || !result.leaves.some((l) => l.id === selectedLeaf))
    return null;
  const leaf = dailyLeafLight(result, state, selectedLeaf);
  const local = (id) => document.getElementById("lm-leaf-day-" + id);
  local("panel").hidden = false;
  local("heading").textContent =
    `Лист ${leaf.leaf + 1} · более освещённая сторона`;
  local("title").textContent = titles[leaf.kind];
  local("amount").textContent =
    `${percentRange(leaf.ratioRange)} от нижнего ориентира`;
  paintSun(
    "lm-leaf-day",
    leaf.fill,
    `Лист ${leaf.leaf + 1}: ${titles[leaf.kind]}, ${percentRange(leaf.ratioRange)} от ориентира`,
  );
  return leaf;
}
