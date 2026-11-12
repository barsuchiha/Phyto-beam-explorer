import { plantModel } from "../models/plants.js";
import { formatRange, decimal, number } from "./format.js";

function scenarioStatus(dailyRange, group) {
  const lo = plantModel.classify(dailyRange[0], group),
    hi = plantModel.classify(dailyRange[1], group);
  return {
    label:
      lo === hi
        ? plantModel.categories[lo].label + " во всех сценариях"
        : plantModel.categories[lo].label +
          " → " +
          plantModel.categories[hi].label +
          " · зависит от сценария",
    color:
      lo === hi ? plantModel.categories[lo].color : "var(--muted-foreground)",
  };
}

export function createResults(q) {
  const legendItems = plantModel.categories.map((c) => {
    const item = document.createElement("span");
    item.className = "beam-key";
    const dot = document.createElement("span");
    dot.className = "plant-dot";
    dot.style.background = c.color;
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    item.append(dot, label);
    q("pbe-legend").appendChild(item);
    return label;
  });
  const comparisonRows = Object.entries(plantModel.plants).map(([id, p]) => {
    const tr = document.createElement("tr"),
      name = document.createElement("td"),
      range = document.createElement("td"),
      status = document.createElement("td");
    const title = document.createElement("div");
    title.textContent = p.name;
    name.appendChild(title);
    const size = document.createElement("div");
    size.className = "text-small";
    size.textContent = p.size;
    name.appendChild(size);
    const { L, U } = plantModel.groups[p.group];
    range.textContent = L + "–" + U;
    range.className = "tabular-nums";
    const wrap = document.createElement("span");
    wrap.className = "beam-key";
    const dot = document.createElement("span");
    dot.className = "plant-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    wrap.append(dot, label);
    status.appendChild(wrap);
    tr.append(name, range, status);
    q("pbe-comparison").appendChild(tr);
    return { id, p, tr, dot, label };
  });

  return function renderResults(state, scene) {
    const {
      catalog,
      estimated,
      era,
      ranged,
      mini36,
      op,
      estimate,
      metrics,
      selected,
      target,
      daily,
      meanClass,
      assessment,
      dailyRange,
      flux,
      g,
    } = scene;

    if (catalog && !op.ok) {
      for (const id of ["pbe-mean", "pbe-center", "pbe-dli"])
        q(id).textContent = "—";
      q("pbe-status").textContent = "Расчёт недоступен для этой комбинации";
      q("pbe-status-dot").style.background = "var(--muted)";
      for (const id of ["pbe-flow", "pbe-target"]) q(id).textContent = "";
      for (let i = 0; i < legendItems.length; i++)
        legendItems[i].textContent = plantModel.categories[i].label + " · —";
      for (const row of comparisonRows) {
        row.dot.style.background = "var(--muted)";
        row.label.textContent = "Нет расчёта";
      }
      return;
    }
    q("pbe-mean").textContent =
      "≈ " + (ranged ? formatRange(metrics.range.mean) : number(metrics.mean));
    q("pbe-center").textContent =
      "≈ " +
      (ranged ? formatRange(metrics.range.center) : number(metrics.center));
    q("pbe-dli").textContent =
      "≈ " + (ranged ? formatRange(dailyRange, 1) : decimal(daily));
    const status = ranged
      ? scenarioStatus(dailyRange, selected.group)
      : {
          label: plantModel.categories[meanClass].label + " по среднему DLI",
          color: plantModel.categories[meanClass].color,
        };
    q("pbe-status").textContent = selected.name + " · " + status.label;
    q("pbe-status-dot").style.background = status.color;
    if (estimated)
      q("pbe-estimate-notice").textContent =
        (mini36
          ? "Гипотеза Seoul + Osram: диапазон по 3 сценариям температуры и потока; пучок принят 120°. "
          : "Оценка с допущениями: диапазон по 9 сочетаниям потока и пучка. ") +
        `Это не измерение и не доверительный интервал. Карта и проценты площади — базовый сценарий: средний PPFD ≈ ${number(metrics.mean)} мкмоль/(м²·с), DLI ≈ ${decimal(daily)}.`;
    q("pbe-target").textContent =
      `Зелёная цель: ${target.L}–${target.U} моль/(м²·сут) · при ${state.hours} ч: средний PPFD ${Math.round(target.L / (state.hours * 0.0036))}–${Math.round(target.U / (state.hours * 0.0036))} мкмоль/(м²·с)`;
    q("pbe-plant-source").href = selected.url;
    for (let i = 0; i < legendItems.length; i++)
      legendItems[i].textContent =
        plantModel.categories[i].label +
        " · " +
        decimal(assessment.percentages[i]) +
        "%";
    for (const row of comparisonRows) {
      const c = ranged
        ? scenarioStatus(dailyRange, row.p.group)
        : plantModel.categories[plantModel.classify(daily, row.p.group)];
      row.dot.style.background = c.color;
      row.label.textContent = c.label;
    }
    q("pbe-flow").textContent =
      `Общий поток сейчас: ${estimated ? "≈ " + formatRange(estimate.fluxes) : Number(flux.toFixed(1)).toLocaleString("ru-RU")} мкмоль/с · ${era ? `${g.length} светильник(а)` : g.length === 1 ? "одна плата" : `${g.length} плат(ы)`}` +
      (catalog || estimated || era
        ? " · без купола"
        : " · при смене угла поток постоянный");
  };
}
