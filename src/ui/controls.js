import { hardware } from "../models/hardware.js";
import { formatRange } from "./format.js";
import { plantShapes } from "../data/plant-shapes.js";

export function renderControls(q, controls, state, scene) {
  const {
    p,
    catalog,
    estimated,
    mini36,
    dim,
    op,
    estimate,
    angle,
    base,
    era,
    eraData,
    flux,
  } = scene;
  const driver = hardware.drivers[state.driver];
  if (controls.current.dataset.driver !== state.driver) {
    controls.current.replaceChildren(
      ...driver.currents.map((i) => {
        const o = document.createElement("option");
        o.value = i;
        o.textContent =
          state.driver === "ldd" ? `LDD-${i}H · ${i} мА` : `${i} мА`;
        return o;
      }),
    );
    controls.current.dataset.driver = state.driver;
  }
  const shape = plantShapes[state.plant];
  controls.plantSize.min = shape.min;
  controls.plantSize.max = shape.max;
  controls.screenDepth.max = Math.min(40, state.height - 5);
  for (const [key, c] of Object.entries(controls)) c.value = String(state[key]);
  q("pbe-plantSize-value").textContent = state.plantSize + " см";
  q("pbe-orbit-value").textContent =
    state.orbit +
    "°" +
    (state.orbit === 0 ? " · сверху" : state.orbit === 90 ? " · сбоку" : "");
  q("pbe-screenDepth-value").textContent = state.screenDepth + " см";
  q("pbe-screenOpening-value").textContent =
    `${state.screenOpening}°` +
    (state.screenOpening === 0 ? " · прямые стенки" : "");
  q("pbe-screen-note").hidden = !state.screenSector;
  const rig = scene.metrics?.rig;
  q("pbe-screen-note").textContent =
    `Каждая стенка отклонена наружу на ${(state.screenOpening / 2).toLocaleString("ru-RU")}° от оси лампы. Длина стенки постоянна; меняется форма отражателя, а не исходный пучок LED.` +
    (rig
      ? ` Глубина по оси ≈ ${(rig.depth * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} см, диаметр выходного края ≈ ${Math.round(rig.mouthRadius * 200)} см. Форма — условный ${state.screenOpening === 0 ? "цилиндр" : "усечённый конус"} с открытым торцом.`
      : "");
  q("pbe-screenTurn-value").textContent = state.screenTurn + "°";
  q("pbe-screen-controls").hidden = !state.screenSector;
  q("pbe-material-controls").hidden = !state.screenSector;
  q("pbe-reflectance-value").textContent =
    state.reflectance +
    "%" +
    (state.reflectance === 100 ? " · идеальный предел" : " · допущение");
  controls.screenTurn.disabled = state.screenSector === 360;
  q("pbe-size-note").textContent =
    `Для этого вида: ${shape.min}–${shape.max} см от грунта. Это диапазон комнатных экземпляров для моделирования; пропорции и густота условные. С высотой на рисунке прибавляются листья. PPFD считается по оболочке кроны. ${shape.note ?? ""}`;
  controls.dim.disabled = !!p.fixed;
  controls.angle.disabled = catalog || estimated || era;
  controls.ppf.disabled = catalog || estimated || era;
  controls.angle.step = catalog || era ? "any" : "5";
  controls.ppf.step = catalog || estimated || era ? "any" : "5";
  q("pbe-hardware").hidden = !catalog && !estimated && !era;
  q("pbe-data-details").hidden = !catalog;
  controls.driver.parentElement.hidden = !catalog;
  controls.current.parentElement.hidden = !catalog;
  q("pbe-estimate-details").hidden = !estimated;
  q("pbe-estimate-notice").hidden = !estimated && !era;
  q("pbe-era-details").hidden = !era;
  q("pbe-count-label").textContent = era
    ? "Количество светильников"
    : "Количество плат";
  for (const o of controls.count.options)
    o.textContent = era
      ? { 1: "1 светильник", 2: "2 светильника", 4: "4 светильника" }[o.value]
      : { 1: "1 плата", 2: "2 платы", 4: "4 платы" }[o.value];
  q("pbe-vendor-comparison").hidden = !mini36;
  q("pbe-channel2").hidden =
    !catalog || state.driver !== "ldd" || state.count === 1;

  if (catalog || estimated || era) controls.angle.value = String(angle);
  if (era) controls.dim.value = "100";
  q("pbe-validation").hidden = !catalog || op.ok;
  q("pbe-validation").textContent = catalog && !op.ok ? op.reason : "";
  q("pbe-height-value").textContent = state.height + " см";
  q("pbe-angle-label").textContent = era
    ? eraData.ies
      ? "Пучок · IES ЭРА"
      : "Пучок · допущение"
    : catalog
      ? "Пучок LM301B · без оптики"
      : estimated
        ? "Пучок · принятый базовый сценарий"
        : "Условный полный угол пучка";
  q("pbe-angle-value").textContent = era
    ? eraData.ies
      ? "≈ 116–117° · IES"
      : "120° · сценарии 110–130°"
    : catalog
      ? "≈ " + Math.round(angle) + "° · фиксирован"
      : mini36
        ? "120° · приближение без линз"
        : estimated
          ? "120° · сценарии 110–130°"
          : state.angle + "°";
  q("pbe-ppf-value").textContent =
    (era
      ? flux
      : estimated
        ? "≈ " + formatRange(estimate.full)
        : catalog
          ? (base.ppf * state.count).toLocaleString("ru-RU", {
              maximumFractionDigits: 2,
            })
          : state.ppf) + " мкмоль/с";
  controls.ppf.max = String(
    estimated ? Math.max(400, Math.ceil(estimate.full[2])) : 400,
  );
  if (catalog) controls.ppf.value = String(base.ppf * state.count);
  if (estimated) controls.ppf.value = String(estimate.full[1]);
  if (era) controls.ppf.value = String(flux);
  q("pbe-hours-value").textContent = state.hours + " ч";
  q("pbe-dim-label").textContent = estimated
    ? "Яркость · условный PWM"
    : catalog
      ? state.driver === "ldd"
        ? state.count > 1
          ? state.source === "linear98"
            ? "Нечётные ряды · PWM"
            : "Левые платы · PWM"
          : "Яркость · PWM"
        : "DIM · доля номинального тока"
      : "Яркость источника";
  q("pbe-dim2-label").textContent =
    state.source === "linear98" ? "Чётные ряды · PWM" : "Правые платы · PWM";
  q("pbe-dim-value").textContent = era
    ? "100% · без диммирования"
    : p.fixed
      ? "Не подтверждено"
      : dim + "%";
  q("pbe-dim2-value").textContent = state.dim2 + "%";
  q("pbe-capability").textContent = p.cap;
  q("pbe-method").textContent =
    (era
      ? eraData.ies
        ? "PPF ЭРА и опубликованный IES; распределённая геометрия линейки и перенос диаграммы на её элементы — допущения ближнего поля. "
        : "PPF ЭРА; геометрия и форма пучка E27 предположены. Диапазон — чувствительность к углу, не измеренная погрешность. "
      : mini36
        ? "PPF — сумма белых Seoul и красного Osram с приближёнными поправками по графикам. Состав белых LED и их ток — гипотеза; температуры заданы сценариями. Кривые обоих пучков приближены ламбертовыми. "
        : estimated
          ? "PPF и PPFD оценены при принятых спектральных, тепловых и угловых сценариях. Каталожный поток отдельного LED не является измерением платы. Поправка на нагрев условная; теплового расчёта нет. "
          : catalog
            ? "PPF (400–700 нм) — по току выбранной платы; ниже опубликованного диапазона экстраполяции нет. Диаграмма диода нормирована на PPF; её перенос на плату — допущение. "
            : "PPF задан вручную и сохраняется при смене условного источника. Угол — по уровню 50% силы излучения; за контуром тоже есть свет. ") +
    "Карта — на обращённой к лампе поверхности эллипсоидной кроны. Экран: поглощающий, идеализированный зеркальный или матовый ламбертов; отражение задано пользователем. Учтены повторные отражения и возврат на поглощающие платы. Свет окна, внутренние листья, отражения комнаты и нагрев не рассчитаны. Это модель, не измерение.";
}
