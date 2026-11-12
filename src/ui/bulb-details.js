import {
  minifermerBulbs,
  bulbManual,
  bulbAssumptions,
  bulbScreenNote,
} from "../data/minifermer-bulbs.js";
import { formatRange } from "./format.js";

export function renderBulbDetails(q, state, scene) {
  const m = minifermerBulbs[state.source],
    out = scene.estimate;
  q("pbe-operating").textContent =
    `MiniFermer E27 · ${state.count} ламп(ы) · встроенное сетевое питание · 100%. Диммирование не подтверждено; регулируй расстояние, положение и часы работы.`;
  q("pbe-estimate-description").textContent =
    `${m.name}. Белый + красный видимый свет; 660 нм — не ИК. Расчёт относится только к варианту Фулл Комфорт, не к другим спектрам этой карточки.`;
  const rows = [
    ["Мощность · карточка", m.powerNote],
    ["LED · карточка", m.ledNote],
    [
      "Эффективность · наше допущение",
      "1,5 / 1,9 / 2,3 мкмоль/Дж на всю лампу, включая встроенный драйвер и нагрев. Это выбранные инженерные сценарии, не паспортные значения и не вывод из названия диода. Отдельная поправка на температуру не добавляется.",
    ],
    [
      "PPF одной лампы · расчёт",
      `${formatRange(out.base, 1)} мкмоль/с; база ${out.base[1].toLocaleString("ru-RU")}. PPF = потребляемые ватты × принятая эффективность. Пары Вт × мкмоль/Дж: ${m.watts.map((w, i) => `${w} × ${bulbAssumptions.efficacy[i]}`).join("; ")}. Полный поток изделия не опубликован.`,
    ],
    [
      "Пучок · наше допущение",
      "IES не найден. Равномерный светящийся диск и cosⁿ-профиль с полными углами 110° / 120° / 130° по половине максимума. База 120°. Все девять сочетаний PPF и угла участвуют в диапазоне; он не гарантирует охват реального значения.",
    ],
    [
      "Габарит и масса · карточка",
      `${m.dimensionsNote} Масса ${m.mass.toLocaleString("ru-RU")} кг; нагрузка на подвес не проверена. Оптический диск принят равным большему диаметру корпуса; реальная светящаяся площадь неизвестна.`,
    ],
    [
      "PPFD · замеры продавца",
      `На 20 / 30 / 40 / 50 см: ${m.vendorPPFD.join(" / ")} мкмоль/(м²·с). Подпись: гроубокс 40 × 40 см, Mylar. Отражающие стенки влияют на результат; расположение датчика подробно не задано. Это не средний PPFD комнатной кроны и не измерение PPF. На эти точки модель не подгонялась.`,
    ],
    [
      "Драйвер и экран",
      `Драйвер внутри лампы; LDD/LCM и программный PWM к ней не применены. ${bulbScreenNote}`,
    ],
    [
      "Несколько ламп · компоновка",
      "Одна — по центру; две — центры через 360 мм; четыре — квадрат 360 × 360 мм. Это наша компоновка. Каждая получает полный поток своего сценария.",
    ],
  ];
  q("pbe-estimate-table").replaceChildren(
    ...rows.map(([a, b]) => {
      const tr = document.createElement("tr");
      for (const value of [a, b]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      return tr;
    }),
  );
  q("pbe-estimate-link").href = m.url;
  q("pbe-estimate-limits").textContent =
    "Для уточнения нужны PPF готовой прогретой лампы и измеренная угловая диаграмма/IES. Предполагаемая эффективность не подтверждена паспортом Samsung. Свет окна, внутренние листья, отражения комнаты и нагрев не рассчитаны.";
  q("pbe-estimate-sources").replaceChildren();
  for (const [label, url] of [
    ["Замеры MiniFermer", m.measurementURL],
    ["Инструкция E27", bulbManual],
    ["Допущения расчёта", "./MINIFERMER_BULBS.md"],
  ]) {
    const a = document.createElement("a");
    a.textContent = label;
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    q("pbe-estimate-sources").append(" · ", a);
  }
}
