import {
  dailyLeafLight,
  dailyPlantLight,
  dailyPercent,
} from "../models/daily-light.js";
import { windowSettings } from "../models/window-light.js";

const q = (id) => document.getElementById("lm-daily-" + id);
const titles = {
  off: "Источники света выключены",
  low: "Света пока мало",
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
const dose = (value) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
function shares(lamp, window) {
  const total = lamp + window;
  if (!total) return "Окно 0 · лампа 0";
  const w = Math.round((100 * window) / total);
  return `Вклад в свет за день: окно ${w}% · лампа ${100 - w}%`;
}
export function renderDailyLight(state, result, selectedLeaf) {
  const summary = dailyPlantLight(result, state);
  q("panel").hidden = false;
  q("reference").hidden = !summary;
  q("coverage").hidden = !summary;
  q("tip").hidden = !summary;
  q("sources").hidden = !summary;
  document.getElementById("lm-leaf-day-panel").hidden = true;
  paintSun(
    "lm-daily",
    summary?.fill ?? 0,
    "Суммарный свет за день для растения",
  );
  if (!summary) {
    q("calculation").textContent =
      "Для оценки нужны данные освещения листьев.";
    q("title").textContent = "Нет данных по листьям";
    q("amount").textContent = "Не удалось получить расчёт по всей листве.";
    q("context").textContent =
      "Попробуй изменить положение светильника или растения.";
    q("icon").setAttribute(
      "aria-label",
      "Нет данных для оценки света на листьях",
    );
    return null;
  }
  const amount = percentRange(summary.ratioRange);
  const title =
    summary.kind === "high"
      ? "Есть листья выше ориентира"
      : titles[summary.kind];
  q("title").textContent = title;
  q("amount").textContent = `Свет за день: ${amount} ориентира`;
  q("sources").textContent = shares(summary.lamp, summary.window);
  q("coverage").textContent =
    `Нижний ориентир достигнут у ${percentRange(summary.reachedRange)} листвы — по площади.` +
    (summary.aboveRange[1] > 0
      ? ` Выше верхнего ориентира: ${percentRange(summary.aboveRange)}.`
      : "");
  const doses = summary.meanRange.map((v) =>
    v.toLocaleString("ru-RU", { maximumFractionDigits: 2 }),
  );
  q("calculation").textContent =
    `Общее солнце — условный индикатор по площади листьев: вклад каждого ограничен 100% нижнего ориентира, поэтому избыток не компенсирует тень. Сначала складываем окно и лампу на одной стороне листа, затем выбираем сторону с большим суммарным DLI. Средний DLI этих сторон: окно ${dose(summary.window)} + лампа ${dose(summary.lamp)} = ${dose(summary.mean)} моль/(м²·сутки). Диапазон сценариев: ${doses[0] === doses[1] ? doses[0] : doses.join("–")}; ориентир ${summary.lower}–${summary.upper}. Проценты вклада окна и лампы относятся к этому среднему, а не к заполнению солнца. Это не прогноз здоровья.`;
  const daylight = windowSettings(state);
  q("context").textContent =
    (state.windowWeather !== "off"
      ? `${daylight.label}: окно + лампа. Свет окна задан условно — его можно уточнить в настройках.`
      : "Свет окна выключен в расчёте — показана только лампа.") +
    (summary.kind === "uncertain"
      ? " Диапазон допущений пересекает ориентир."
      : "") +
    (summary.aboveRange[1] > 0 ? " Верхняя граница не означает ожог." : "") +
    (summary.sparse
      ? " На части листвы мало попаданий лучей; оценка слабого света неточная."
      : "");
  paintSun(
    "lm-daily",
    summary.fill,
    `${title}. Суммарный свет за день ${amount} ориентира`,
  );

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
  local("sources").textContent = shares(leaf.lamp, leaf.window);
  paintSun(
    "lm-leaf-day",
    leaf.fill,
    `Лист ${leaf.leaf + 1}: ${titles[leaf.kind]}, ${percentRange(leaf.ratioRange)} от ориентира`,
  );
  return leaf;
}
