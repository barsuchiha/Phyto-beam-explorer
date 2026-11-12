import { reflectionNames } from "../models/reflections.js";

const number = (v) => v.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
export function renderScreenComparison(q, state, scene) {
  q("pbe-screen-comparison").hidden = !state.screenSector || !scene.metrics;
  if (!scene.metrics || !state.screenSector) return;
  const variants = scene.metrics.screenComparison,
    base = variants.absorb,
    mode = state.screenMode ?? "absorb",
    chosen = variants[mode];
  q("pbe-screen-assumption").textContent =
    `Поглощающий: 0% отражения. Зеркальный и матовый: ${state.reflectance}% на каждом отражении — допущение, не паспорт материала. Платы поглощают вернувшийся на них свет. Карта отражённого света имеет ограниченное пространственное разрешение.`;
  q("pbe-screen-rows").replaceChildren(
    ...Object.entries(variants).map(([key, r]) => {
      const row = document.createElement("tr");
      if (key === mode) row.className = "selected-screen";
      const title = document.createElement("td"),
        button = document.createElement("button");
      button.type = "button";
      button.dataset.screenMode = key;
      button.className = "screen-choice";
      button.textContent = reflectionNames[key];
      button.setAttribute("aria-pressed", String(key === mode));
      title.append(button);
      row.append(title);
      for (const value of [
        `≈ ${number(r.mean)}`,
        `${number(r.budget.target * 100)}%`,
        `${number(r.budget.room * 100)}%`,
        `${number((r.budget.screen + (r.budget.housing ?? 0)) * 100)}%`,
      ]) {
        const td = document.createElement("td");
        td.className = "tabular-nums";
        td.textContent = value;
        row.append(td);
      }
      return row;
    }),
  );
  const deltaRoom = (chosen.budget.room - base.budget.room) * 100;
  q("pbe-screen-gain").textContent =
    mode === "absorb"
      ? `Добавка к среднему PPFD от отражения: зеркало +${number(variants.mirror.mean - base.mean)}, матовый +${number(variants.diffuse.mean - base.mean)} мкмоль/(м²·с).`
      : `Отражения добавляют ≈ ${number(chosen.mean - base.mean)} мкмоль/(м²·с) к среднему PPFD. После отражений до оболочки доходит ${number(chosen.budget.returned * 100)}% исходного потока. В комнату: ${deltaRoom >= 0 ? "+" : ""}${number(deltaRoom)} п.п. относительно поглощающего экрана.`;
  if (chosen.budget.residual > 1e-5)
    q("pbe-screen-gain").textContent +=
      ` Не завершено после 64 отражений: ${number(chosen.budget.residual * 100)}% потока; эта доля не приписана растению.`;
}
