import { bulbScreenNote, minifermerBulbs } from "./data/minifermer-bulbs.js";
import { luminaires, mounts, fittingSources } from "./data/luminaires.js";
import { cadAssets } from "./data/cad-assets.js";
import { plants } from "./data/plants.js";
import { plantShapes } from "./data/plant-shapes.js";
import { plantLightNotes, lightGroupSource } from "./data/plant-light-notes.js";
import {
  normalizeFitting,
  changeFitting,
  compatibleSources,
  sourceFit,
} from "./models/fitting.js";
import {
  buildLuminaireScene,
  flexibleSection,
} from "./models/luminaire-scene.js";
import { calculateLuminaire, lightOutput } from "./models/luminaire-light.js";
import { calculateReferenceLight } from "./models/reference-light.js";
import { createLuminaireView } from "./ui/luminaire-view.js";
import { renderDailyLight } from "./ui/daily-light.js";
import { dailyFaceLight } from "./models/daily-light.js";
import { calculateWindowLight, windowSettings } from "./models/window-light.js";
import { plantModel } from "./models/plants.js";
import { OLIVE_PRESETS, oliveAngles } from "./models/olive.js";
import { lightWorkerFile } from "./data/worker-asset.js";
import {
  surfaceReadout,
  surfaceMetricCards,
  percentText,
  ppfdMapStops,
  ppfdMapPosition,
} from "./models/light-readout.js";

const q = (id) => document.getElementById("lm-" + id),
  key = "phyto-luminaire-fitting-v1";
let state;
try {
  state = normalizeFitting(JSON.parse(localStorage.getItem(key) || "{}"));
} catch {
  state = normalizeFitting();
}
const requestedModel = new URL(location.href).searchParams.get("model");
if (requestedModel && Object.hasOwn(luminaires, requestedModel))
  state = changeFitting(state, "model", requestedModel);
const controls = Object.fromEntries(
  Object.keys(state)
    .map((k) => [k, q(k)])
    .filter(([, el]) => el),
);
const option = (value, label) => new Option(label, value);
for (const family of ["Авторская", "P00", "Soltech"]) {
  const group = document.createElement("optgroup");
  group.label =
    family === "Авторская"
      ? "Твоя оливковая лампа"
      : family === "P00"
        ? "Наши конструкции P00"
        : "Крепления по референсам Soltech";
  for (const [id, m] of Object.entries(luminaires))
    if (m.family === family) group.append(option(id, m.name));
  q("model").append(group);
}
for (const [id, p] of Object.entries(plants))
  q("plant").append(option(id, p.name));
let view,
  latestResult = null,
  latestGeometry = null,
  latestReference = null,
  selectedLeaf = -1;
try {
  view = createLuminaireView(q("view"), (id) => {
    selectedLeaf = id;
    renderLeafDetail();
  });
} catch {
  q("loading").textContent =
    "3D недоступно в этом браузере. Примерка по размерам и расчёт ниже работают; для сцены нужен WebGL 2.";
}
const cache = new Map();
async function getCAD(id) {
  if (!cache.has(id))
    cache.set(
      id,
      fetch(new URL("../data/cad/" + cadAssets[id].file, import.meta.url))
        .then((r) => {
          if (!r.ok) throw Error("CAD " + r.status);
          return r.json();
        })
        .catch((e) => {
          cache.delete(id);
          throw e;
        }),
    );
  return cache.get(id);
}
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {}
}
function hide(id, condition) {
  q(id).hidden = condition;
}
function setOptions(id, items, value) {
  const select = q(id),
    signature = JSON.stringify(items);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...items.map(([v, l]) => option(v, l)));
    select.dataset.options = signature;
  }
  select.value = value;
}
function renderMapLegend() {
  q("continuous-gradient").style.background =
    `linear-gradient(to right,${ppfdMapStops.map(([v, c]) => `${c} ${ppfdMapPosition(v) * 100}%`).join(",")})`;
  q("continuous-ticks").replaceChildren(
    ...ppfdMapStops.map(([value]) => {
      const tick = document.createElement("span");
      tick.style.left = ppfdMapPosition(value) * 100 + "%";
      tick.textContent =
        value.toLocaleString("ru-RU") + (value === 300 ? "+" : "");
      return tick;
    }),
  );
  q("continuous-note").textContent =
    "PPFD от лампы · мкмоль/(м²·с). Свет окна + лампы за день — в значке солнца под сценой. Шкала общая, логарифмическая; 300+ — верхний цвет.";
}
function renderWindowControls(geometry = latestGeometry) {
  for (const name of [
    "windowWeather",
    "windowLevel",
    "daylightHours",
    "sunHours",
  ])
    q(name).value = state[name];
  for (const [name, unit] of [
    ["windowLevel", "%"],
    ["daylightHours", " ч"],
    ["sunHours", " ч"],
  ])
    q(name + "-value").textContent = fmt(state[name]) + unit;
  hide("window-settings", state.windowWeather === "off");
  hide("window-distance-controls", state.windowWeather === "off");
  const aperture = geometry?.window;
  const distance = aperture?.gap ?? (state.windowDistance ?? 100) / 100;
  q("windowDistance").value =
    state.windowWallY != null
      ? Math.round(distance * 20) * 5
      : (state.windowDistance ?? Math.round(distance * 20) * 5);
  q("windowDistance-value").textContent =
    distance.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " м";
  q("window-distance-note").textContent =
    "От ближайшего края растения до стекла. Вплотную — 5 см." +
    (state.windowWallY != null
      ? " После поворота горшка показан текущий зазор; стена осталась на месте."
      : "") +
    (aperture?.limitedByFixture
      ? " Стену удерживает габарит светильника: показано фактическое расстояние."
      : "");
  hide("sun-hours-field", state.windowWeather !== "sunny");
  q("sunHours").max = Math.min(8, state.daylightHours);
  const s = windowSettings(state);
  q("window-assumptions").textContent =
    `Окно 140 × 160 см на задней стене, подоконник 70 см. При 100% яркости: пасмурно — средний рассеянный PPFD 80; солнечно — 200 плюс прямой поток 600 мкмоль/(м²·с). Рассеянный свет задан на вертикальном датчике в 50 см от центра окна, прямой — на перпендикулярной лучу поверхности, оба уже после стекла. Сейчас: рассеянный ${fmt(s.diffuse)} × ${s.hours} ч; прямой ${fmt(s.beam)} × ${s.sunHours} ч. Диапазон яркости 0,6–1,4 от сценария — допущение, не доверительный интервал. Солнце представлено тремя направлениями: высоты 25°/35°/25°, азимуты −15°/0°/15° относительно окна, равные доли времени. Учтены наклоны и взаимные тени листьев. Экраны и корпус затеняют окно как непрозрачные; отражения от комнаты, экрана и листьев, пропускание через листья, оконная рама и движение солнца по дате не рассчитаны. Стена с окном движется по ползунку расстояния; яркость в опорной точке в 50 см от окна сохраняется. Текущая сцена не является обмером квартиры.`;
}
function renderControls(poses, geometry) {
  const m = luminaires[state.model],
    source = fittingSources[state.source],
    spec = plantShapes[state.plant];
  setOptions(
    "pose",
    poses.map((p, i) => [i, p.label]),
    state.pose,
  );
  setOptions(
    "mount",
    m.mounts.map((id) => [id, mounts[id].name]),
    state.mount,
  );
  setOptions(
    "source",
    compatibleSources(state.mount).map((id) => [id, fittingSources[id].name]),
    state.source,
  );
  q("plantSize").min = spec.min;
  q("plantSize").max = spec.max;
  for (const [name, el] of Object.entries(controls)) {
    if (el.type === "checkbox") el.checked = state[name];
    else el.value = state[name];
  }
  renderMapLegend();
  renderWindowControls(geometry);
  const lampGap = geometry.lampPlacement.gap;
  q("lampDistance").value = state.lampDistance ?? Math.round(lampGap * 20) * 5;
  q("lampDistance-value").textContent =
    lampGap.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " м";
  q("lamp-distance-note").textContent =
    "От ближайшей части корпуса до стены. 0 — вплотную, 5 м — в глубине комнаты. Растение остаётся на месте." +
    (["V2", "luna", "archetto", "pinocchio"].includes(state.model)
      ? " Вынос настенного крепления — условная примерка; потребуется отдельная опора."
      : "");
  for (const [name, unit] of [
    ["dim", "%"],
    ["plantSize", " см"],
    ["plantTurn", "°"],
    ["install", " см"],
    ["plantOffset", " см"],
    ["chairOffset", " см"],
    ["hours", " ч"],
    ["flap", "°"],
    ["opening", "°"],
    ["screenLength", " см"],
    ["screenGap", " см"],
    ["reflectance", "%"],
    ["towerTurn", "°"],
    ["jointMiddle", "°"],
    ["jointTop", "°"],
    ["clearTransmission", "%"],
    ["slotTransmission", "%"],
  ])
    q(name + "-value").textContent = fmt(state[name]) + unit;
  hide("olive-controls", state.model !== "olive");
  hide("olive-optics", state.model !== "olive");
  const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  q("olive-directions").textContent = `Направления снизу вверх: ${oliveAngles(
    state,
  )
    .map((a) => fmt(wrap(a)) + "°")
    .join(
      " / ",
    )}. 0° — вправо вдоль комнаты. После перемещения лампы направление блоков можно поправить. Средний поворачивает и верхний блок; верхний ползунок доворачивает его отдельно.`;
  q("focus").textContent =
    state.model === "olive" ? "Блок крупно" : "Головка крупно";
  const plant = plants[state.plant],
    { L, U } = plantModel.groups[plant.group];
  q("plant-light-note").textContent = plantLightNotes[state.plant];
  q("plant-light-target").textContent =
    `Ориентир в калькуляторе: ${L}–${U} моль/м² за день — от окна и лампы вместе.`;
  q("plant-light-source").href = plant.url;
  q("plant-light-source").textContent = plant.url.includes("rhs.org.uk")
    ? "Рекомендации RHS для этого растения"
    : "Рекомендации NC State для этого растения";
  q("plant-light-groups-source").href = lightGroupSource;
  const flex = flexibleSection(state.canopy);
  q("canopy-value").textContent = (flex.gap * 100).toFixed(1) + " см";
  // Slider increases to the right while the CAD's bend decreases.
  q("canopy").value = 210 - state.canopy;
  q("canopy-note").textContent =
    `Проём между краями ${(flex.gap * 1000).toFixed(0)} мм · радиус ${(flex.radius * 1000).toFixed(0)} мм. Длина дуги каждого листа — 165 мм. Это размер купола, не угол светового пучка.`;
  hide("pose-field", poses.length === 1 || m.optic === "flap");
  hide("dim-field", !source.dimmable);
  hide("fixed", source.dimmable);
  hide("install-field", m.install === null);
  q("install-label").textContent =
    state.model === "B3flex"
      ? "Низ жёсткого паза от пола"
      : m.family === "Soltech"
        ? "Подвес: точка крепления головки"
        : "Верхний источник от пола";
  hide("canopy-field", m.optic !== "flex");
  hide("canopy-note", m.optic !== "flex");
  hide("flap-field", m.optic !== "flap");
  hide("screen-field", m.optic !== "cone");
  hide("cone-controls", !state.screen);
  q("screen-label").textContent =
    m.family === "Soltech"
      ? "Выносной экран подвеса · проект"
      : "Добавить экран головки · проект";
  q("screen-note").textContent =
    m.family === "Soltech"
      ? "Экран начинается у светового выхода, верх открыт. Длина измеряется вдоль стенки; зазор — от габарита корпуса. Крепление, нагрев и нагрузка не проверены."
      : "Длина измеряется вдоль стенки; зазор — от габарита корпуса. Геометрический вариант, механизм регулировки не разработан.";
  const size = geometry.screenDimensions;
  q("screen-size").textContent = size
    ? `У лампы Ø${fmt(size.radius * 200)} см · край Ø${fmt(size.mouthRadius * 200)} см · глубина ${fmt(size.depth * 100)} см. Диаметры указаны по полной окружности, даже при неполном секторе.`
    : "";
  if (minifermerBulbs[state.source])
    q("screen-note").textContent += " " + bulbScreenNote;
  hide(
    "material-controls",
    m.optic === "none" || (m.optic === "cone" && !state.screen),
  );
  hide("reflectance-field", state.material === "absorb");
  hide("no-screen", m.optic !== "none");
  q("fit").textContent =
    `${source.size[0]} × ${source.size[1]}${source.size[2] ? " × " + source.size[2] : ""} мм · ${sourceFit(state.mount, state.source).ok ? "входит по посадочному габариту" : "не входит"}${source.size[2] === null ? " · толщина/длина не подтверждена" : ""}`;
  q("model-note").textContent = m.note;
  q("mount-note").textContent = mounts[state.mount].note;
  q("source-note").replaceChildren(
    document.createTextNode(source.evidence + " "),
  );
  const link = document.createElement("a");
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Карточка источника";
  q("source-note").append(link);
  q("fits").replaceChildren(
    ...Object.entries(fittingSources).map(([id, s]) => {
      const fit = sourceFit(state.mount, id),
        tr = document.createElement("tr");
      for (const value of [
        s.name,
        s.type === "bulb"
          ? `Ø${s.size[0]} × ${s.size[2] ?? "?"} мм`
          : s.size.map((x) => x ?? "?").join(" × ") + " мм",
        fit.ok ? "Входит по габариту · проверка сборки впереди" : fit.reason,
      ]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      tr.lastChild.className = fit.ok ? "fit-ok" : "fit-no";
      return tr;
    }),
  );
}
const budgetItems = [
  ["target", "На крону", "#8bb997"],
  ["room", "В комнату", "#c5a571"],
  ["screen", "В экран", "#8c9290"],
  ["housing", "В корпус / источник", "#7584a1"],
  ["residual", "Остаток", "#a47b9d"],
];
const fmt = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const dose = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
function renderLeafDetail() {
  if (!latestResult) return;
  const summary = renderDailyLight(state, latestResult, selectedLeaf);
  const leaf = latestResult.leaves?.find((l) => l.id === summary?.leaf);
  q("leaf-select").value = String(selectedLeaf);
  if (!leaf) {
    view?.selectLeaf(-1);
    q("leaf-detail").textContent = "";
    return;
  }
  view?.selectLeaf(leaf.id);
  const values = leaf.sides.map((side, i) => {
    const day = dailyFaceLight(latestResult, state, leaf, i);
    return `Сторона ${i === 0 ? "A" : "B"}: PPFD лампы ${fmt(side.range[0])}–${fmt(side.range[1])}; DLI окна ${dose(day.window)} + лампы ${dose(day.lamp)} = ${dose(day.value)} (сценарии ${dose(day.range[0])}–${dose(day.range[1])})`;
  });
  q("leaf-detail").textContent =
    `Лист ${leaf.id + 1} · площадь одной стороны ${fmt(leaf.area * 10000)} см². ${values.join(". ")}. PPFD: мкмоль/(м²·с); DLI: моль/(м²·сутки). A — лицевая сторона модели, B — обратная; положение настоящего листа не измерено.` +
    (leaf.sides.some((s) => s.hits === 0)
      ? " Ноль попаданий лучей не доказывает полную темноту: слабый свет может не попасть в выборку."
      : "");
}
function renderSurfaceMetrics(result) {
  q("metrics").replaceChildren(
    ...surfaceMetricCards(result, state).map(([title, value, note]) => {
      const card = document.createElement("div");
      for (const [tag, text] of [
        ["span", title],
        ["strong", value],
        ["small", note],
      ]) {
        const el = document.createElement(tag);
        el.textContent = text;
        card.append(el);
      }
      return card;
    }),
  );
}
function renderResult(result, geometry, reference, updateView = true) {
  latestResult = result;
  latestGeometry = geometry;
  latestReference = reference;
  const leafMode = result.receiver === "leaves";
  hide("leaf-panel", !leafMode);
  if (leafMode) {
    if (!result.leaves.some((l) => l.id === selectedLeaf)) selectedLeaf = -1;
    setOptions(
      "leaf-select",
      [
        [-1, "Всё растение"],
        ...result.leaves.map((l) => [l.id, `Лист ${l.id + 1}`]),
      ],
      String(selectedLeaf),
    );
    renderLeafDetail();
  } else {
    renderDailyLight(state, result, selectedLeaf);
    q("leaf-detail").textContent = "";
  }
  q("receiver-note").textContent = leafMode
    ? `${result.leaves.length} листьев/листочков · площадь обеих сторон ${fmt(result.area)} м². Среднее взвешено по площади и включает теневые стороны: например, 150 сверху и 0 снизу дают 75. Второе число — среднее по самой освещённой стороне одного листа, не точечный пик. Это показатели распределения, не оценка достаточности света. Форма и наклоны — допущения; значения маленьких участков могут быть шумными.`
    : "Среднее включает всю оболочку и её теневую сторону. Это показатель распределения, не оценка достаточности света для растения. Его нельзя напрямую сравнивать с датчиком сверху или средним на первой странице. Рисованные листья в этом режиме не участвуют в расчёте.";
  const { metrics, range, middle } = result,
    b = metrics[middle].budget;
  const ppfRange = [
    Math.min(...result.output.fluxes),
    Math.max(...result.output.fluxes),
  ];
  const ppfText =
    ppfRange[0] === ppfRange[1]
      ? fmt(metrics[middle].flux)
      : fmt(ppfRange[0]) + "–" + fmt(ppfRange[1]);
  const rangeText = (values, format = fmt) =>
    Math.abs(values[1] - values[0]) > 0.05
      ? format(values[0]) + "–" + format(values[1])
      : format((values[0] + values[1]) / 2);
  const dliRange = (values) =>
    values.map((v) => plantModel.dli(v, state.hours));
  const readout = surfaceReadout(result),
    best = readout.brightest;
  renderSurfaceMetrics(result);
  q("source-summary").textContent =
    `PPF источников: ${ppfText} мкмоль/с · ${geometry.sources.length} шт. Это поток до взаимодействия с корпусом и растением.`;
  q("reference-metrics").textContent =
    `PPFD сверху: ${rangeText(reference.range)} мкмоль/(м²·с). DLI на этом датчике за ${state.hours} ч: ${rangeText(dliRange(reference.range), dose)} моль/(м²·сутки).`;
  const target = plantModel.groups[plants[state.plant].group];
  q("reference-note").textContent =
    `Светлый круг в 3D — горизонтальный датчик на высоте ${fmt(reference.center[2] * 100)} см от пола, над центром растения. Считается только верхняя сторона, отдельно от листьев. Свет снизу на обратную сторону не входит в показание. При боковой подсветке ноль здесь не означает нулевой свет на листьях.` +
    (reference.lowSample && ppfRange[1] > 0
      ? " Мало попаданий в датчик: значение нестабильно, ноль не доказывает отсутствия света."
      : "");
  q("daily-note").textContent =
    `Условный ориентир выбранной световой группы: DLI ${target.L}–${target.U} моль/(м²·сутки) за весь день. Солнце и оценка листа учитывают окно + лампу. Карта PPFD, датчик сверху и баланс ниже относятся к лампе. Диапазон суммарного DLI учитывает сценарии лампы и яркости окна, но не все ошибки модели. Дозы складываются независимо от совпадения часов работы; режим дня и ночи отдельно не оценивается.`;
  q("surface-summary").textContent = leafMode
    ? `DLI от лампы за ${state.hours} ч: ${rangeText(dliRange(range), dose)} в среднем по обеим сторонам листьев; ${rangeText(dliRange(best.range), dose)} на самой освещённой стороне листа. Единица: моль/(м²·сутки).`
    : `Среднее по всей оболочке включает её теневую сторону.`;
  const bar = document.createElement("div");
  bar.className = "model-budget";
  const labels = document.createElement("div");
  labels.className = "budget-labels";
  for (const [id, label, color] of budgetItems) {
    const part = document.createElement("div");
    part.style.cssText = `width:${b[id] * 100}%;background:${color}`;
    bar.append(part);
    const text = document.createElement("span");
    text.innerHTML = `<i style="background:${color}"></i>${id === "target" && leafMode ? "На листья" : id === "screen" && state.model === "olive" ? "В панелях" : label} ${percentText(b[id])}`;
    labels.append(text);
  }
  q("budget").replaceChildren(bar, labels);
  hide("budget", !readout.emitting);
  q("status").textContent = readout.emitting
    ? `Всего на ${leafMode ? "листья" : "крону"}: ${percentText(b.target)} исходного PPF; в том числе после отражений: ${percentText(b.returned)} исходного PPF. Баланс: ${fmt(budgetItems.reduce((s, [id]) => s + b[id], 0) * 100)}%. ${result.rayCount.toLocaleString("ru-RU")} лучей.`
    : "Лампа выключена: её вклад в PPFD и DLI равен нулю. Доля попавшего света не определяется без исходного потока.";
  q("trace-note").textContent = q("status").textContent;
  const room = result.room;
  hide("room-report", !room);
  if (room) {
    q("room-report").replaceChildren(
      ...[
        ["chair", "Кресло"],
        ["cat", "Кошка"],
      ].map(([id, label]) => {
        const values = room.fractions[id],
          reaches = readout.emitting && Math.max(...values) > 0;
        const el = document.createElement("p");
        el.className = reaches ? "room-hit" : "";
        const title = document.createElement("strong");
        title.textContent = label;
        const text = document.createElement("span");
        text.textContent = !readout.emitting
          ? "Лампа выключена"
          : reaches
            ? "Свет попадает"
            : "Нет попаданий в выборке";
        el.append(title, text);
        return el;
      }),
    );
    q("room-numbers").textContent = !readout.emitting
      ? "Лампа выключена: свет от неё на кресло и кошку не поступает."
      : [
          ["chair", "Кресло"],
          ["cat", "Кошка"],
          ["walls", "Стены"],
          ["floor", "Пол"],
          ["escape", "За границы сцены"],
        ]
          .map(([id, label]) => {
            const values = room.fractions[id];
            return `${label}: ${percentText(Math.min(...values))}–${percentText(Math.max(...values))} исходного PPF`;
          })
          .join(". ") +
        ". Это части категории «В комнату», не дополнительные потоки. Ноль попаданий не доказывает отсутствие слабого света. Повторные отражения от комнаты не учтены; яркость дымки и пятен условная.";
  }
  hide("status", true);
  if (updateView) view?.light(state, result);
}
let serial = 0,
  timer,
  lightWorker;
async function render() {
  const run = ++serial;
  clearTimeout(timer);
  lightWorker?.terminate();
  lightWorker = null;
  latestResult = null;
  hide("leaf-panel", true);
  hide("daily-panel", true);
  hide("room-report", true);
  hide("status", false);
  q("status").textContent = "Обновляю сцену и считаю свет…";
  try {
    const poses = await getCAD(state.model);
    if (run !== serial) return;
    state.pose = Math.min(state.pose, poses.length - 1);
    const pose = poses[state.pose],
      geometry = buildLuminaireScene(state, pose);
    latestGeometry = geometry;
    renderControls(poses, geometry);
    view?.update(state, pose, geometry);
    if (view) q("loading").hidden = true;
    q("caption").textContent =
      `${luminaires[state.model].name} · угол комнаты · ${geometry.sources.length} источник(а)${geometry.source.type === "bulb" ? " · форма колбы условная" : ""}`;
    q("driver-note").textContent = lightOutput(
      state,
      geometry.sources.length,
    ).note;
    hide("collision", !geometry.collision && !geometry.roomCollision);
    q("collision").textContent =
      "Крона или листья пересекают источник или экран. Измени расстояние лампы от стены, подними конструкцию или сдвинь растение: расчёт для этого положения остановлен.";
    if (geometry.roomCollision)
      q("collision").textContent =
        geometry.roomCollision === "boundary"
          ? "Растение выходит за границы комнаты. Уменьши или сдвинь его: расчёт для этого положения остановлен."
          : "Листья пересекают кресло или кошку. Сдвинь кресло вправо или растение влево: расчёт для этого положения остановлен.";
    q("metrics").replaceChildren();
    q("budget").replaceChildren();
    for (const id of [
      "reference-note",
      "reference-metrics",
      "source-summary",
      "daily-note",
      "surface-summary",
      "receiver-note",
      "room-numbers",
    ])
      q(id).textContent = "";
    if (geometry.collision || geometry.roomCollision) {
      q("status").textContent =
        "Показана геометрическая примерка; PPFD для пересечения не рассчитывается.";
      return;
    }
    q("status").textContent = "Считаю свет для текущего положения…";
    timer = setTimeout(() => {
      if (run !== serial) return;
      try {
        if (typeof Worker !== "undefined") {
          lightWorker = new Worker(
            new URL("../data/workers/" + lightWorkerFile, import.meta.url),
            { type: "module" },
          );
          const worker = lightWorker;
          worker.onmessage = ({ data }) => {
            if (run !== serial) return;
            worker.terminate();
            lightWorker = null;
            if (data.error) {
              q("status").textContent =
                "Не удалось рассчитать свет для этой конфигурации.";
              console.error(data.error);
            } else renderResult(data.result, geometry, data.reference);
          };
          worker.onerror = (error) => {
            worker.terminate();
            if (run === serial) {
              lightWorker = null;
              q("status").textContent =
                "Не удалось загрузить расчёт. Обнови страницу.";
              console.error(error);
            }
          };
          worker.postMessage({ state, pose });
          return;
        }
        const result = {
          ...calculateLuminaire(state, geometry),
          windowLight: calculateWindowLight(geometry),
        };
        const reference = calculateReferenceLight(state, geometry);
        if (run === serial) renderResult(result, geometry, reference);
      } catch (error) {
        q("status").textContent =
          "Не удалось рассчитать свет для этой конфигурации.";
        console.error(error);
      }
    }, 180);
  } catch (error) {
    q("loading").hidden = false;
    q("loading").textContent =
      "Не удалось загрузить модель. Проверь соединение и обнови страницу.";
    console.error(error);
  }
}
for (const [name, control] of Object.entries(controls))
  control.addEventListener("input", () => {
    let value = control.type === "checkbox" ? control.checked : control.value;
    if (name === "canopy") value = 210 - Number(value);
    if (name === "plantTurn" && latestGeometry)
      state = { ...state, windowWallY: latestGeometry.window.y };
    state = changeFitting(state, name, value);
    if (
      [
        "hours",
        "windowWeather",
        "windowLevel",
        "daylightHours",
        "sunHours",
      ].includes(name)
    ) {
      // Duration changes DLI only. Keep the sun and slider visible while dragging,
      // and reuse the current PPFD rather than restarting the ray calculation.
      q("hours-value").textContent = fmt(state.hours) + " ч";
      renderWindowControls();
      view?.daylight(state);
      if (
        name === "windowWeather" &&
        state.windowWeather !== "off" &&
        state.receiver !== "leaves"
      ) {
        state = changeFitting(state, "receiver", "leaves");
        save();
        render();
        return;
      }
      save();
      if (latestResult)
        renderResult(latestResult, latestGeometry, latestReference, false);
      return;
    }
    if (name === "plant" || name === "model") selectedLeaf = -1;
    if (name === "model") {
      const url = new URL(location.href);
      url.searchParams.set("model", state.model);
      history.replaceState(null, "", url);
    }
    save();
    render();
  });
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll("[data-view]"))
      other.setAttribute("aria-pressed", String(other === button));
    view?.setMode(button.dataset.view);
    hide("map-controls", button.dataset.view !== "map");
    hide("ray-controls", button.dataset.view !== "rays");
  });
q("ray-paths").addEventListener("change", () =>
  view?.setPaths(q("ray-paths").checked),
);
q("reference-details").addEventListener("toggle", () =>
  view?.setReferenceVisible(q("reference-details").open),
);
q("leaf-select").addEventListener("input", () => {
  selectedLeaf = Number(q("leaf-select").value);
  renderLeafDetail();
});
q("leaf-clear").addEventListener("click", () => {
  selectedLeaf = -1;
  renderLeafDetail();
});
q("daily-switch").addEventListener("click", () => {
  selectedLeaf = -1;
  state = changeFitting(state, "receiver", "leaves");
  save();
  render();
});
q("focus").addEventListener("click", () => view?.fit(true));
q("reset-view").addEventListener("click", () => view?.fit());
q("lamp-reset").addEventListener("click", () => {
  state = changeFitting(state, "lampDistance", null);
  save();
  render();
});
for (const button of document.querySelectorAll("[data-olive-preset]"))
  button.addEventListener("click", () => {
    let [towerTurn, jointMiddle, jointTop] =
      OLIVE_PRESETS[button.dataset.olivePreset];
    if (button.dataset.olivePreset === "toward" && latestGeometry) {
      const [x, y] = latestGeometry.crown.soil;
      towerTurn =
        Math.round(
          (Math.atan2(y - latestGeometry.lampPlacement.y, x) * 180) /
            Math.PI /
            5,
        ) * 5;
    }
    state = normalizeFitting({ ...state, towerTurn, jointMiddle, jointTop });
    save();
    render();
  });
render();
