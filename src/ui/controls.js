import { hardware } from "../models/hardware.js";
import { formatRange } from "./format.js";

export function renderControls(q, controls, state, scene) {
  const { p, catalog, estimated, mini36, dim, op, estimate, angle, base } =
    scene;
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
  for (const [key, c] of Object.entries(controls)) c.value = String(state[key]);
  controls.dim.disabled = !!p.fixed;
  controls.angle.disabled = catalog || estimated;
  controls.ppf.disabled = catalog || estimated;
  controls.angle.step = catalog ? "any" : "5";
  controls.ppf.step = catalog || estimated ? "any" : "5";
  q("pbe-hardware").hidden = !catalog && !estimated;
  q("pbe-data-details").hidden = !catalog;
  controls.driver.parentElement.hidden = !catalog;
  controls.current.parentElement.hidden = !catalog;
  q("pbe-estimate-details").hidden = !estimated;
  q("pbe-estimate-notice").hidden = !estimated;
  q("pbe-vendor-comparison").hidden = !mini36;
  q("pbe-channel2").hidden =
    !catalog || state.driver !== "ldd" || state.count === 1;

  if (catalog || estimated) controls.angle.value = String(angle);
  q("pbe-validation").hidden = !catalog || op.ok;
  q("pbe-validation").textContent = catalog && !op.ok ? op.reason : "";
  q("pbe-height-value").textContent = state.height + " см";
  q("pbe-angle-label").textContent = catalog
    ? "Пучок LM301B · без оптики"
    : estimated
      ? "Пучок · принятый базовый сценарий"
      : "Условный полный угол пучка";
  q("pbe-angle-value").textContent = catalog
    ? "≈ " + Math.round(angle) + "° · фиксирован"
    : mini36
      ? "120° · приближение без линз"
      : estimated
        ? "120° · сценарии 110–130°"
        : state.angle + "°";
  q("pbe-ppf-value").textContent =
    (estimated
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
  q("pbe-hours-value").textContent = state.hours + " ч";
  q("pbe-tilt-value").textContent =
    (state.tilt > 0 ? "+" : "") + state.tilt + "°";
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
  q("pbe-dim-value").textContent = p.fixed ? "Не подтверждено" : dim + "%";
  q("pbe-dim2-value").textContent = state.dim2 + "%";
  q("pbe-capability").textContent = p.cap;
  q("pbe-method").textContent =
    (mini36
      ? "PPF — сумма белых Seoul и красного Osram с приближёнными поправками по графикам. Состав белых LED и их ток — гипотеза; температуры заданы сценариями. Кривые обоих пучков приближены ламбертовыми. "
      : estimated
        ? "PPF и PPFD оценены при принятых спектральных, тепловых и угловых сценариях. Каталожный поток отдельного LED не является измерением платы. Поправка на нагрев условная; теплового расчёта нет. "
        : catalog
          ? "PPF (400–700 нм) — по току выбранной платы; ниже опубликованного диапазона экстраполяции нет. Диаграмма диода нормирована на PPF; её перенос на плату — допущение. "
          : "PPF задан вручную и сохраняется при смене условного источника. Угол — по уровню 50% силы излучения; за контуром тоже есть свет. ") +
    "Купол, отражения и затенение листьями не учтены. Карта — расчёт на плоскости, не измерения листьев.";
}
