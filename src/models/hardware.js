import { modules, drivers } from "../data/hardware.js";

// manufacturer-declared module PPF; no low-current extrapolation.
function point(id, current) {
  const rows = modules[id].rows;
  if (current < rows[0][0] - 1e-8 || current > rows.at(-1)[0] + 1e-8)
    return null;
  const hi = rows.findIndex((r) => r[0] >= current - 1e-8),
    r = rows[hi];
  if (hi === 0 || Math.abs(current - r[0]) < 1e-8)
    return { voltage: r[1], ppf: r[2], exact: true };
  const l = rows[hi - 1],
    f = (current - l[0]) / (r[0] - l[0]);
  return {
    voltage: l[1] + f * (r[1] - l[1]),
    ppf: l[2] + f * (r[2] - l[2]),
    exact: false,
  };
}
function fit(id, driver, current, count) {
  const d = drivers[driver],
    i = d.currents.indexOf(current),
    p = point(id, current);
  if (i < 0)
    return { ok: false, reason: "Такой номинальный ток не поддерживается" };
  if (!p) return { ok: false, reason: "Нет данных платы для этого тока" };
  const ldd = driver === "ldd",
    voltage = p.voltage * (ldd ? 1 : count),
    maxV = ldd ? 24 * 0.97 - 3 : d.maxV[i];
  const watts = ((p.voltage * current) / 1000) * count;
  if (voltage < d.minV || voltage > maxV)
    return {
      ok: false,
      reason: `Нужно ${voltage.toFixed(2)} В; диапазон ${d.minV}–${maxV.toFixed(2)} В`,
      voltage,
      watts,
    };
  // LDD PSU budget is a declared design allowance, not measured efficiency.
  const budget = ldd ? watts / 0.85 + 2 : watts;
  if (budget > d.power + 1e-8)
    return {
      ok: false,
      reason: ldd
        ? "Нужен более мощный БП: бюджет с запасом >60 Вт"
        : "Превышена мощность драйвера",
      voltage,
      watts,
      budget,
    };
  return {
    ok: true,
    voltage,
    watts,
    budget,
    headroom: maxV - voltage,
    reason: `По тип. Vf: ${voltage.toFixed(2)} В · запас сверху ${(maxV - voltage).toFixed(2)} В`,
  };
}
function operate(s) {
  const m = modules[s.source],
    d = drivers[s.driver],
    base = point(s.source, s.current),
    check = fit(s.source, s.driver, s.current, s.count);
  if (!check.ok) return { ok: false, reason: check.reason, check };
  const pwm = s.driver === "ldd",
    current = pwm ? s.current : (s.current * s.dim) / 100;
  if (!pwm && s.dim > 0 && s.dim < 6)
    return {
      ok: false,
      reason: "LCM: ток при DIM между 0 и 6% не определён паспортом",
      check,
    };
  const actual =
    current === 0
      ? { ppf: 0, voltage: 0, exact: true }
      : point(s.source, current);
  if (!actual)
    return {
      ok: false,
      reason: `Нет PPF при ${current.toFixed(0)} мА. Для этой платы расчёт от ${m.rows[0][0]} мА; увеличь DIM или выбери LDD.`,
      check,
    };
  const totalV = actual.voltage * s.count;
  if (
    !pwm &&
    current > 0 &&
    (totalV < d.minV || totalV > d.maxV[d.currents.indexOf(s.current)])
  )
    return {
      ok: false,
      reason: "Напряжение при уменьшенном токе вне диапазона LCM",
      check,
    };
  const duties = Array.from({ length: s.count }, (_, i) =>
    pwm ? (i % 2 === 0 ? s.dim : s.dim2) / 100 : 1,
  );
  const fluxes = duties.map((duty) => actual.ppf * duty),
    flux = fluxes.reduce((a, b) => a + b, 0);
  const watts =
    ((actual.voltage * current) / 1000) * duties.reduce((a, b) => a + b, 0);
  return {
    ok: true,
    flux,
    fluxes,
    watts,
    current,
    voltage: pwm ? actual.voltage : totalV,
    basePPF: base.ppf * s.count,
    exact: actual.exact,
    pwm,
    check,
  };
}

export const hardware = { modules, drivers, point, fit, operate };
