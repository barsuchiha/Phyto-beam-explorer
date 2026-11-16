import { sourceBudget } from "../models/source-budget.js";

const q = (id) => document.getElementById("lm-" + id);
const fmt = (v, digits = 1) => v.toLocaleString("ru-RU", { maximumFractionDigits: digits });
export function renderSourceBudget(state, geometry, result = null) {
  if (!geometry) return;
  const budget = result?.metrics[result.middle]?.budget;
  const absorbed = budget ? budget.screen + budget.housing : null;
  const r = sourceBudget(state, geometry.sources.length, absorbed);
  const ready = r.point.ready;
  q("budget-power").textContent = `≈ ${fmt(r.wallW)} Вт`;
  q("budget-power-note").textContent = `${r.count} источн. · ${fmt(r.inputW)} Вт ${ready ? "с питанием" : "на LED"}`;
  q("budget-cost").textContent = `≈ ${fmt(r.monthRub, 0)} ₽`;
  q("budget-energy").textContent = `${fmt(r.monthKWh)} кВт·ч за 30 дней`;
  q("budget-temp-title").textContent = ready ? "Корпус лампы" : "Радиатор · сценарий";
  q("budget-temp").textContent = r.sinkC == null ? "Нет данных" : `≈ ${fmt(r.sinkC, 0)} °C`;
  q("budget-temp-note").textContent = ready ? "Нужен замер корпуса лампы"
    : r.sinkC == null ? "Нужен расчёт света без пересечений"
    : r.inputW === 0 ? "После остывания до комнатной температуры"
    : r.sinkC <= 45 ? "В пределах цели проекта ≤45 °C"
    : r.sinkC <= 60 ? "Горячий · сценарий радиатора"
    : "Сценарий требует лучшего охлаждения";
  q("budget-context").textContent = `${state.hours} ч/день · ${fmt(state.tariff, 2)} ₽/кВт·ч · ${state.enabled ? "лампа включена" : "питание выключено"}`;
  q("budget-day").textContent = `${fmt(r.dayKWh, 3)} кВт·ч · ${fmt(r.dayRub, 2)} ₽`;
  const [lo, hi] = r.monthRubRange;
  q("budget-cost-range").textContent = Math.abs(hi - lo) > 0.01
    ? `${fmt(lo, 0)}–${fmt(hi, 0)} ₽/месяц по диапазону мощности источника`
    : "Диапазон потребления в исходных данных не задан";
  q("budget-heat").textContent = r.fixtureHeatW == null ? "Нет данных" : `≈ ${fmt(r.fixtureHeatW)} Вт`;
  q("budget-temperature-range").textContent = r.sinkRange == null ? "Нет данных"
    : `${fmt(r.sinkRange[0])}–${fmt(r.sinkRange[1])} °C по сценариям PPF; неопределённость теплоотвода в этот диапазон не входит`;
  q("budget-power-evidence").textContent = r.point.powerNote;
  q("budget-electricity").textContent = ready
    ? "Мощность готовой лампы уже включает её питание. Дополнительный КПД не применяется."
    : `Мощность из розетки = мощность LED / ${fmt(state.driverEfficiency)}%. КПД всей цепочки питания задан как допущение, не измерен. Внешний драйвер в нагрев радиатора не входит. Потребление в ожидании не учитывается.`;
  q("budget-thermal").textContent = ready
    ? "Температура готового изделия не выводится из сценария радиатора для плат: конструкция и охлаждение неизвестны."
    : `Стационарная оценка после прогрева: тепло = мощность LED − PPF × 0,22 Дж/мкмоль × (1 − доля поглощения корпусом и экраном). ${absorbed == null ? "Доля поглощения пока недоступна." : `Из текущей 3D-сцены: ${fmt(absorbed * 100)}%.`} Всё излучение условно отнесено к PAR; 0,22 Дж/мкмоль — принятое среднее. Температура = воздух + тепло × тепловое сопротивление. При отдельных радиаторах тепло делится поровну между источниками; это не расчёт отдельных деталей CAD или температуры кристалла.`;
  for (const id of ["cooling-field", "ambient-field", "efficiency-field"])
    q(id).hidden = ready;
  q("ambient-value").textContent = `${fmt(state.ambient)} °C`;
  q("driverEfficiency-value").textContent = `${fmt(state.driverEfficiency)}%`;
}
