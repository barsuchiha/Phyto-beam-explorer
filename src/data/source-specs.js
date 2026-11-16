// Electrical inputs from plant-lamp-simple.html, imported 2026-11-16.
// PPF for existing sources remains owned by the project's optical models.
export const cobSources = {
  v22d: {
    name: "Bridgelux V22D · 35,6 Вт",
    part: "BXRE-40E65F0-D-93",
    type: "panel",
    technology: "cob",
    size: [28, 28, null],
    watts: 35.6,
    current: 1050,
    ppfLevels: [90, 95, 100],
    angle: 120,
    dimmable: true,
    url: "https://www.bridgelux.com/sites/default/files/DS1310.pdf",
    evidence: "PPF 90 / 95 / 100 мкмоль/с перенесён как оценка по белому свету, не паспортный поток. Пучок 120° — приближение по типовому углу из DS1310. Площадка 28 × 28 мм из исходного расчёта условно светится целиком; толщина и размер активной области здесь не заданы.",
    powerNote: "35,6 Вт на матрице при 1050 мА и тип. 33,9 В: DS1310, таблица 4, 4000 K. Это другая рабочая точка, чем таблица при 85 °C.",
  },
  x2828: {
    name: "X-2828 · 30 Вт",
    part: "ESV X-2828 W68 · ES-56773",
    type: "panel",
    technology: "cob",
    size: [28, 28, 2],
    watts: 30,
    current: 900,
    ppfLevels: [40, 40, 40],
    angle: 120,
    dimmable: true,
    url: "https://elementsv.ru/product/svetodiodnaya-cob-matrica-x-2828-w68-30-33v-30w-900ma-epistar-day-white/",
    evidence: "PPF 40 мкмоль/с — перенесённая оценка по люменам, не измерение. Отсутствие диапазона не означает точности. 120° и 28 × 28 × 2 мм — данные ESV; излучающая область условно заменена всей плоскостью матрицы.",
    powerNote: "Принято 30 Вт на матрице по исходному расчёту; 900 мА × 30–33 В даёт 27–29,7 Вт.",
  },
};

const board = (watts, powerNote) => ({ kind: "board", watts, powerNote });
const fixture = (watts, powerNote, powerLevels) => ({
  kind: "fixture", watts, powerNote, powerLevels,
});
const samsung = {
  kind: "board",
  powerNote: "Мощность платы = выбранный ток × типичное напряжение из таблицы LED-Tech. Потери внешнего питания учитываются отдельно.",
};
export const sourceSpecs = {
  square50: samsung,
  compact21: samsung,
  linear98: samsung,
  mf193: board(57.2, "44 В × 1,3 А = 57,2 Вт на плате. В исходной карточке также 60–62 Вт; расхождение не устранено."),
  mf194: board(57.2, "44 В × 1,3 А = 57,2 Вт на плате. В исходной карточке также 60–62 Вт; расхождение не устранено."),
  mf36: board(11.52, "19,2 В × 0,6 А = 11,52 Вт на плате; в исходной карточке 11–12 Вт."),
  eraGreen18: fixture(18, "Номинальные 18 Вт готового светильника, включая встроенное питание."),
  eraE27_18: fixture(18, "Номинальные 18 Вт готовой лампы, включая встроенное питание."),
  eraE27_25: fixture(25, "Номинальные 25 Вт готовой лампы, включая встроенное питание."),
  mfE27_12: fixture(12.5, "Потребление 10–15 Вт при названии «12 Вт»; база 12,5 Вт — середина диапазона, не замер.", [10, 12.5, 15]),
  mfE27_25: fixture(22.5, "Потребление 20–25 Вт; база 22,5 Вт — середина диапазона, не замер.", [20, 22.5, 25]),
  ...Object.fromEntries(Object.entries(cobSources).map(([id, source]) => [
    id, { kind: "cob", watts: source.watts, powerNote: source.powerNote },
  ])),
};

export const coolingScenarios = {
  "shared-05": { name: "Общий радиатор · 0,5 °C/Вт", resistance: 0.5, separate: false },
  "shared-025": { name: "Усиленный общий · 0,25 °C/Вт", resistance: 0.25, separate: false },
  "shared-125": { name: "Слабый общий · 1,25 °C/Вт", resistance: 1.25, separate: false },
  "separate-05": { name: "Отдельные радиаторы · 0,5 °C/Вт", resistance: 0.5, separate: true },
};
