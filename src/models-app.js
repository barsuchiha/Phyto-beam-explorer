import { bulbScreenNote, minifermerBulbs } from "./data/minifermer-bulbs.js";
import { luminaires, mounts, fittingSources } from "./data/luminaires.js";
import { cadAssets } from "./data/cad-assets.js";
import { plants } from "./data/plants.js";
import { plantShapes } from "./data/plant-shapes.js";
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
import { createLuminaireView } from "./ui/luminaire-view.js";
import { plantModel } from "./models/plants.js";

const q = (id) => document.getElementById("lm-" + id),
  key = "phyto-luminaire-fitting-v1";
let state;
try {
  state = normalizeFitting(JSON.parse(localStorage.getItem(key) || "{}"));
} catch {
  state = normalizeFitting();
}
const controls = Object.fromEntries(
  Object.keys(state)
    .map((k) => [k, q(k)])
    .filter(([, el]) => el),
);
const option = (value, label) => new Option(label, value);
for (const family of ["P00", "Soltech"]) {
  const group = document.createElement("optgroup");
  group.label =
    family === "P00"
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
  selectedLeaf = 0;
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
  for (const [name, unit] of [
    ["dim", "%"],
    ["plantSize", " см"],
    ["install", " см"],
    ["plantOffset", " см"],
    ["hours", " ч"],
    ["flap", "°"],
    ["opening", "°"],
    ["screenLength", " см"],
    ["screenGap", " см"],
    ["reflectance", "%"],
  ])
    q(name + "-value").textContent = fmt(state[name]) + unit;
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
  ["housing", "В источник", "#7584a1"],
  ["residual", "Остаток", "#a47b9d"],
];
const fmt = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const dose = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
function renderLeafDetail() {
  const leaf = latestResult?.leaves?.[selectedLeaf];
  if (!leaf) return;
  q("leaf-select").value = String(selectedLeaf);
  view?.selectLeaf(selectedLeaf);
  const values = leaf.sides.map(
    (side, i) =>
      `Сторона ${i === 0 ? "A" : "B"}: PPFD ${fmt(side.range[0])}–${fmt(side.range[1])}, DLI ${dose(plantModel.dli(side.range[0], state.hours))}–${dose(plantModel.dli(side.range[1], state.hours))}`,
  );
  q("leaf-detail").textContent =
    `Лист ${selectedLeaf + 1} · площадь одной стороны ${fmt(leaf.area * 10000)} см². ${values.join(". ")}. PPFD: мкмоль/(м²·с); DLI: моль/(м²·сутки). A/B — стороны нарисованной сетки, не измеренные верх/низ живого листа.` +
    (leaf.sides.some((s) => s.hits === 0)
      ? " Ноль попаданий лучей не доказывает полную темноту: слабый свет может не попасть в выборку."
      : "");
}
function renderResult(result, geometry) {
  latestResult = result;
  const leafMode = result.receiver === "leaves";
  hide("leaf-panel", !leafMode);
  if (leafMode) {
    if (!result.leaves[selectedLeaf]) selectedLeaf = 0;
    setOptions(
      "leaf-select",
      result.leaves.map((l) => [l.id, `Лист ${l.id + 1}`]),
      String(selectedLeaf),
    );
    renderLeafDetail();
  }
  q("receiver-note").textContent = leafMode
    ? `${result.leaves.length} листьев/листочков · площадь обеих сторон ${fmt(result.area)} м². PPFD усреднён по обеим поверхностям, включая теневые участки. Цвет — по четырём участкам на каждой стороне; листья затеняют друг друга. Форма и наклоны условные, пропускание и переотражения листьев не рассчитаны. Карта с ограниченной выборкой: цвет маленьких участков может быть шумным. Это другая модель, её среднее нельзя напрямую сравнивать со средним по оболочке.`
    : "PPFD усредняется по всей внешней оболочке кроны, включая теневую сторону. Это другая область усреднения, чем на первой странице. Рисованные листья не участвуют в расчёте.";
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
  const ranged = range[1] - range[0] > 0.05;
  q("metrics").innerHTML =
    `<div><span>Средний PPFD</span><strong>${ranged ? fmt(range[0]) + "–" + fmt(range[1]) : fmt(result.mean)}</strong><small>мкмоль/(м²·с) · ${leafMode ? "обе стороны листьев" : "вся крона"}</small></div><div><span>DLI за ${state.hours} ч</span><strong>${ranged ? dose(plantModel.dli(range[0], state.hours)) + "–" + dose(plantModel.dli(range[1], state.hours)) : dose(plantModel.dli(result.mean, state.hours))}</strong><small>моль/(м²·сутки)</small></div><div><span>PPF источников</span><strong>${ppfText}</strong><small>мкмоль/с · ${geometry.sources.length} шт.</small></div>`;
  const bar = document.createElement("div");
  bar.className = "model-budget";
  const labels = document.createElement("div");
  labels.className = "budget-labels";
  for (const [id, label, color] of budgetItems) {
    const part = document.createElement("div");
    part.style.cssText = `width:${b[id] * 100}%;background:${color}`;
    bar.append(part);
    const text = document.createElement("span");
    text.innerHTML = `<i style="background:${color}"></i>${id === "target" && leafMode ? "На листья" : label} ${fmt(b[id] * 100)}%`;
    labels.append(text);
  }
  q("budget").replaceChildren(bar, labels);
  q("status").textContent =
    `Из всего PPF на ${leafMode ? "листья" : "крону"} после отражений вернулось ${fmt(b.returned * 100)}%. Баланс: ${fmt(budgetItems.reduce((s, [id]) => s + b[id], 0) * 100)}%. ${result.rayCount.toLocaleString("ru-RU")} лучей.`;
  view?.light(state, result);
}
let serial = 0,
  timer;
async function render() {
  const run = ++serial;
  clearTimeout(timer);
  latestResult = null;
  hide("leaf-panel", true);
  try {
    const poses = await getCAD(state.model);
    if (run !== serial) return;
    state.pose = Math.min(state.pose, poses.length - 1);
    const pose = poses[state.pose],
      geometry = buildLuminaireScene(state, pose);
    renderControls(poses, geometry);
    view?.update(state, pose, geometry);
    if (view) q("loading").hidden = true;
    q("caption").textContent =
      `${luminaires[state.model].name} · сетка пола 20 см · ${geometry.sources.length} источник(а)${geometry.source.type === "bulb" ? " · форма колбы условная" : ""}`;
    q("driver-note").textContent = lightOutput(
      state,
      geometry.sources.length,
    ).note;
    hide("collision", !geometry.collision);
    q("collision").textContent =
      "Габарит кроны пересекает источник или экран. Подними конструкцию, сдвинь растение или выбери меньший размер: расчёт для этого положения остановлен.";
    q("metrics").replaceChildren();
    q("budget").replaceChildren();
    if (geometry.collision) {
      q("status").textContent =
        "Показана геометрическая примерка; PPFD для пересечения не рассчитывается.";
      return;
    }
    q("status").textContent = "Считаю свет для текущего положения…";
    timer = setTimeout(() => {
      if (run !== serial) return;
      try {
        const result = calculateLuminaire(state, geometry);
        if (run === serial) renderResult(result, geometry);
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
    state = changeFitting(state, name, value);
    save();
    render();
  });
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll("[data-view]"))
      other.setAttribute("aria-pressed", String(other === button));
    view?.setMode(button.dataset.view);
  });
q("leaf-select").addEventListener("input", () => {
  selectedLeaf = Number(q("leaf-select").value);
  renderLeafDetail();
});
q("focus").addEventListener("click", () => view?.fit(true));
q("reset-view").addEventListener("click", () => view?.fit());
render();
