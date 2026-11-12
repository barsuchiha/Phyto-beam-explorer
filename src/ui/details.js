import { hardware } from "../models/hardware.js";
import { estimateModel } from "../models/minifermer.js";
import { mini36Model } from "../models/mini36.js";
import { formatRange } from "./format.js";
import { renderEraDetails } from "./era-details.js";

function hardwareDetails(q, state, op) {
  const m = hardware.modules[state.source],
    d = hardware.drivers[state.driver],
    pwm = state.driver === "ldd";
  q("pbe-module-description").textContent =
    `${m.name} · ${m.size} · ${m.cct} K · белые LED без отдельных УФ/ИК. ${m.price} за плату на 12.11.2026; заказ у LED-TECH, доставка в РФ не проверена.`;
  q("pbe-evidence").textContent =
    "PPF: таблица изготовителя платы. Пучок: оцифрованная диаграмма отдельного LM301B, не измерение готового светильника. Плата заменена равномерно светящейся поверхностью; спектр по углам считается неизменным.";
  q("pbe-circuit").textContent = pwm
    ? `Питание: 230 В → GST60A24-P1J (24 В, 60 Вт) → ${state.count} × LDD-${state.current}H → по одной плате на канал. Бюджет БП: P_LED / 0,85 + 2 Вт; КПД 85% и 2 Вт контроллера — проектные допущения.`
    : `Питание: 230 В → ${d.name} → ${state.count} плат последовательно. Драйвер напрямую питает LED; дополнительный токовый драйвер в эту цепь не добавляется.`;
  q("pbe-controller").textContent = pwm
    ? "Наш блок: питание контроллера через DC/DC 24 → 3,3 В; MCU → PWM 500 Гц → DIM каждого LDD. Логический HIGH 3,3 В, LOW <0,8 В относительно −Vin; при старте DIM удерживается в LOW. Отдельные каналы позволяют разделить яркость двух групп. Это архитектура, не готовая электрическая схема."
    : "Наш блок: MCU → изолированный интерфейс 0–10 В (или 10 В PWM 500 Гц) → DIM+/DIM−. GPIO 3,3 В напрямую не подходит; DIM− не соединяется с −V LED. Питание контроллера — отдельное. LCM изменяет ток: 70% DIM не означает ровно 70% PPF. Это архитектура, не готовая электрическая схема.";
  q("pbe-driver-comparison").innerHTML = Object.entries(hardware.drivers)
    .map(([id, driver]) => {
      const f = hardware.fit(state.source, id, state.current, state.count);
      return `<tr><td>${driver.name}${id === "ldd" ? " × " + state.count : ""}</td><td>${driver.size}</td><td>${f.ok ? "В пределах по тип. данным. " : ""}${f.reason}</td></tr>`;
    })
    .join("");
  q("pbe-ppf-table").innerHTML = m.rows
    .map(
      (r) =>
        `<tr><td>${r[0]}</td><td>${r[1].toLocaleString("ru-RU")}</td><td>${r[2].toLocaleString("ru-RU")}</td></tr>`,
    )
    .join("");
  q("pbe-module-link").href = m.url;
  q("pbe-driver-link").href = d.url;
  q("pbe-operating").textContent = op.ok
    ? `${pwm ? "LDD-" + state.current + "H · импульсный ток" : "LCM · ток сейчас"} ${Math.round(op.current)} мА · ${op.voltage.toFixed(2)} В ${pwm ? "на плату" : "цепочка"} · ≈ ${op.watts.toFixed(1)} Вт на LED. ${op.exact ? "Опорная точка PPF" : "PPF интерполирован по току"}. Совместимость предварительная: типичный Vf, без проверки нагрева и разброса.`
    : "";
}
function estimateDetails(q, state, output) {
  if (state.source === "mf36") {
    mini36Details(q, state, output);
    return;
  }
  const m = estimateModel.modules[state.source];
  q("pbe-estimate-description").textContent =
    `${m.name} · ${m.cct} K. По карточке продавца: 320 Samsung LM281B+ Pro; плата 390 × 180 мм; 44 В, 1,3 А. Полный артикул и бин текущей партии неизвестны.`;
  const rows = [
    [
      "Исполнение LED · допущение",
      `CRI 80, группы VK–VL. Каталожный поток при 65 мА и 25 °C: ${m.lumens[0]}–${m.lumens[2]} лм/LED. База: ${m.lumens[1]} лм/LED. Наличие именно этих исполнений на плате не подтверждено.`,
    ],
    [
      "Ток · допущение",
      "16 LED последовательно × 20 параллельных ветвей; равномерное деление 1,3 А → 65 мА/LED. Ток не варьируется внутри диапазона; схема платы пока не подтверждена.",
    ],
    [
      "Спектр → PPF · допущение",
      "0,013 / 0,015 / 0,017 мкмоль/с на люмен для трёх сценариев. Это выбранный диапазон чувствительности, не пересчёт измеренного спектра Samsung. PPF: 400–700 нм.",
    ],
    [
      "Нагрев · допущение",
      "Сохраняется 85% / 92,5% / 100% потока относительно каталожных условий. Рабочая температура неизвестна; поправки выбраны для сценариев и не являются температурной кривой LED.",
    ],
    [
      "PPF одной платы · расчёт",
      `${formatRange(output.base)} мкмоль/с при 100%; база ≈ ${Math.round(output.base[1])}. Формула: 320 × лм/LED × пересчёт в фотоны × поправка на нагрев.`,
    ],
    [
      "Пучок · допущение",
      "Осесимметричный cosⁿ-профиль; полные углы 110° / 120° / 130° по половине максимума. База — 120°. Каждый профиль нормирован на тот же PPF. Это не измеренная диаграмма LM281B+ Pro.",
    ],
    [
      "Геометрия · допущение",
      "Равномерно светящаяся поверхность 390 × 180 мм; точная раскладка LED не моделируется. Несколько плат — параллельные ряды с зазором 40 мм. Высота — от центра платы до горизонтальной кроны.",
    ],
    [
      "Яркость · допущение",
      "Идеальный PWM при фиксированных 65 мА/LED: PPF пропорционален проценту яркости; отдельного эффекта охлаждения при DIM нет. Конкретный драйвер не выбран и не проверен. LCM/LDD из другого режима сюда не перенесены.",
    ],
    [
      "Границы диапазона",
      "Минимум и максимум среднего и центрального PPFD среди 3 уровней PPF × 3 углов. Не доверительный интервал и не гарантия покрытия всех реальных значений. Купол, отражения комнаты, свет окна и затенение листьями не учтены.",
    ],
  ];
  q("pbe-estimate-table").replaceChildren(
    ...rows.map(([a, b]) => {
      const tr = document.createElement("tr");
      for (const value of [a, b]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      return tr;
    }),
  );
  q("pbe-estimate-link").href = m.url;
  q("pbe-estimate-limits").textContent =
    "Диапазон условен: CRI 80, выбранные группы потока и 65 мА на LED ещё не подтверждены. Другая партия, схема питания или оптика могут дать результат за его пределами. Карты MiniFermer в отражающем гроубоксе не использованы как замер света в комнате.";
  q("pbe-estimate-sources").innerHTML =
    ' · <a href="https://www1.futureelectronics.com/doc/Samsung%20LED/SPHWHAHDNG28YZR2D2.pdf" target="_blank" rel="noopener noreferrer">Каталог Samsung · LM281B+ Pro</a> · <a href="https://minifermer.ru/page_422.html" target="_blank" rel="noopener noreferrer">Измерения MiniFermer в гроубоксе</a>';
  q("pbe-operating").textContent =
    `MiniFermer · ${state.count} плат(ы) · принято CRI 80 и 65 мА/LED в импульсе · условный PWM ${state.dim}%. Драйвер требует отдельного подбора.`;
}
function mini36Details(q, state, output) {
  const m = mini36Model,
    c = output.components[1],
    decimal = (v) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  q("pbe-estimate-description").textContent =
    "По MiniFermer: 24 Sunlike 4000 K + 1 Osram GH CSSRM3.24 660 нм; 120 × 120 × 2 мм, 19,2 В, 600 мА, 11–12 Вт. Производитель и артикул белого LED не указаны. В расчёте вместо него принят Seoul SunLike STWSC12S-E1H10000, 4000 K, CRI ≥95.";
  const rows = [
    [
      "Белый LED · гипотеза Seoul",
      "Паспорт E1, стр. 3: типичный PPF 1,78 мкмоль/с при 300 мА, Tj = 25 °C. Это данные отдельного Seoul, не готовой платы MiniFermer. E2 с меньшим допустимым током здесь не используется.",
    ],
    [
      "Ток · гипотеза схемы",
      "24 белых: 6 последовательно × 4 параллельные ветви; общий ток 600 мА делится поровну → 150 мА/белый LED. Один красный последовательно с этим блоком → 600 мА. Внутренняя схема платы не подтверждена.",
    ],
    [
      "Красный LED · паспорт Osram",
      "GH CSSRM3.24: типичный PPF 5,42 мкмоль/с при 700 мА, Tj = 25 °C. Для крайних сценариев приняты 5,05–5,65 мкмоль/с группы V5–V7; фактический бин неизвестен.",
    ],
    [
      "Поправка на ток · оценка по графикам",
      "Seoul 150/300 мА: коэффициенты 0,50 / 0,51 / 0,52; Osram 600/700 мА: 0,85 / 0,86 / 0,87. Средние — приближённое чтение графиков; ±0,01 — выбранная чувствительность к чтению, не паспортный допуск.",
    ],
    [
      "Температура · три сценария",
      "Нижний / базовый / верхний поток: Tj = 85 / 55 / 25 °C. Поправки Seoul: 0,87 / 0,94 / 1; Osram: 0,94 / 0,98 / 1, приблизительно по графикам. Это температура кристалла, не воздуха; теплового расчёта платы нет.",
    ],
    [
      "Перенос кривых · допущение",
      "Относительные световые/радиометрические поправки перенесены на PPF при неизменном спектре. Температурные кривые сняты при паспортном токе, а здесь применены к 150/600 мА.",
    ],
    [
      "PPF одной платы · расчёт",
      `${formatRange(output.base, 1)} мкмоль/с; база ${decimal(output.base[1])} = белые ${decimal(c.white)} + красный ${decimal(c.red)}. Красный даёт ≈ ${Math.round((100 * c.red) / output.base[1])}% фотонов базы. PPF: 400–700 нм; люмены в PPF не переводятся.`,
    ],
    [
      "Пучок и геометрия · допущение",
      "Оба типа LED заменены ламбертовыми источниками 120°, каждый нормирован на свой PPF. Это приближение паспортных диаграмм, не их точная оцифровка. 24 точки по иллюстрации платы + красный в центре. Несколько плат — ряды с зазором 40 мм. Линзы и отражения не учтены.",
    ],
    [
      "Яркость · допущение",
      "Общий идеальный PWM: оба цвета меняются пропорционально яркости, ток в импульсе фиксирован. Охлаждение при снижении яркости не моделируется. Драйвер и раздельное управление цветами не подтверждены.",
    ],
    [
      "Границы диапазона",
      "Три совместных сценария температуры, чтения кривых и бина красного. Типичный PPF Seoul фиксирован: неизвестный разброс белых LED, их возможная замена и ошибка формы пучка в диапазон не включены. Он не гарантирует охват реальной платы.",
    ],
  ];
  q("pbe-estimate-table").replaceChildren(
    ...rows.map(([a, b]) => {
      const tr = document.createElement("tr");
      for (const value of [a, b]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      return tr;
    }),
  );
  q("pbe-estimate-link").href = m.url;
  q("pbe-estimate-limits").textContent =
    "Seoul — согласованное допущение. Сравнение с замерами не подтверждает производителя белых LED, схему платы или точность модели. Отличия условий измерения пока не позволяют выделить причину расхождения.";
  q("pbe-estimate-sources").innerHTML =
    ` · <a href="${m.seoulURL}" target="_blank" rel="noopener noreferrer">Seoul E1 · PPF и графики</a> · <a href="${m.osramURL}" target="_blank" rel="noopener noreferrer">Osram · паспорт</a>`;
  q("pbe-operating").textContent =
    `MiniFermer 3.6 · ${state.count} плат(ы) · гипотеза: Seoul 150 мА + Osram 600 мА · базовая Tj 55 °C · условный PWM ${state.dim}%. Драйвер требует отдельного подбора.`;
  const comparison = m.comparison();
  q("pbe-vendor-rows").innerHTML = comparison
    .map(
      (row) =>
        `<tr><td>${row.height}</td><td class="tabular-nums">${row.ppfd}</td><td class="tabular-nums">≈ ${Math.round(row.calculated)}<div class="text-small">${formatRange(row.range)}</div></td><td class="tabular-nums">${row.delta > 0 ? "+" : ""}${Math.round(row.delta)}%</td></tr>`,
    )
    .join("");
  const differences = comparison.map((row) => Math.abs(row.delta));
  q("pbe-vendor-result").textContent =
    `Базовый расчёт ниже замеров примерно на ${Math.round(Math.min(...differences))}–${Math.round(Math.max(...differences))}%. Все четыре замера выше выбранного диапазона. Гипотеза Seoul и принятые условия пока не воспроизводят замеры продавца. Разница: (расчёт − замер) / замер.`;
  q("pbe-vendor-model-check").textContent =
    `Проверка гипотезы: при неизменных пучке и долях цветов для совпадения на 20 см потребовалось бы ≈ ${Math.round(comparison[0].equivalentPPF)} мкмоль/с, а на 50 см — ≈ ${Math.round(comparison[3].equivalentPPF)}. Одной заменой PPF все точки не совместить. Эти значения не использованы в расчёте и не являются измерением полного потока.`;
}

export function renderDetails(q, state, scene) {
  const { catalog, estimated, era, op, estimate } = scene;
  if (era) {
    renderEraDetails(q, state, scene);
    return;
  }
  if (catalog) hardwareDetails(q, state, op);
  else if (estimated) estimateDetails(q, state, estimate);
  else q("pbe-operating").textContent = "";
}
