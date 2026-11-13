import { plantAdditions } from "./plant-additions.js";
import { plants } from "./plants.js";

// Botanical sources support qualitative habit, not these numerical angles.
// Pitch is the blade midrib angle at its base above the horizontal (degrees).
// Bend is the change of that angle towards the tip. All dimensions and angles
// below are explicit modelling assumptions for a typical indoor specimen.
const profile = (habit, pitch, bend, length, width, note, extra = {}) => ({
  habit,
  pitch,
  bend,
  length,
  width,
  cup: 0.035,
  twist: 5,
  note,
  ...extra,
});
export const plantArchitecture = {
  monstera: profile(
    "climber",
    [-20, 20],
    -25,
    0.33,
    0.3,
    "Крупные листовые пластинки на длинных черешках; листья расходятся от вьющегося стебля.",
    { petiole: 0.14 },
  ),
  elastica: profile(
    "tree",
    [10, 35],
    -18,
    0.24,
    0.15,
    "Плотные овальные листья вокруг ствола, короткие черешки и умеренно опущенные кончики.",
    { petiole: 0.035 },
  ),
  lyrata: profile(
    "tree",
    [30, 55],
    -20,
    0.28,
    0.21,
    "Крупные лировидные листья вокруг прямого стебля, более поднятая пластинка.",
    { petiole: 0.035, cup: 0.07 },
  ),
  strelitzia: profile(
    "fan",
    [35, 65],
    -30,
    0.4,
    0.17,
    "Длинные черешки и банановидные листья в веерной компоновке.",
    { cup: 0.06 },
  ),
  dracaena: profile(
    "canes",
    [35, 70],
    -85,
    0.38,
    0.055,
    "Спиральные пучки лентовидных листьев на верхушках стволиков; наружные листья дугообразно опускаются.",
    { cup: 0.08, twist: 3 },
  ),
  peace: profile(
    "basal",
    [20, 45],
    -35,
    0.4,
    0.22,
    "Прикорневой куст на черешках, ланцетные листья с опускающимися кончиками.",
  ),
  aglaonema: profile(
    "shortCanes",
    [20, 45],
    -25,
    0.35,
    0.22,
    "Несколько коротких облиственных стеблей; листья распределены по узлам, а не выходят все из грунта.",
  ),
  zz: profile(
    "compound",
    [25, 50],
    -8,
    0.16,
    0.09,
    "Прямостоячие сложные листья; парные овальные листочки прикреплены к общей оси.",
    { cup: 0.025 },
  ),
  spider: profile(
    "rosette",
    [65, 85],
    -110,
    0.95,
    0.035,
    "Мягкие ленты из центральной розетки: молодые внутри подняты, наружные выгнуты и свисают.",
    { cup: 0.1, twist: 2 },
  ),
  jade: profile(
    "opposite",
    [15, 40],
    -8,
    0.12,
    0.085,
    "Ветвящийся суккулент; супротивные пары листьев, следующие пары повёрнуты.",
    { cup: 0.025 },
  ),
  pothos: profile(
    "climber",
    [-15, 20],
    -20,
    0.25,
    0.21,
    "Сердцевидные листья на черешках вдоль лианы; здесь выбран экземпляр на опоре.",
    { petiole: 0.09 },
  ),
  philodendron: profile(
    "climber",
    [-20, 15],
    -25,
    0.27,
    0.19,
    "Лиана на опоре с сердцевидными пластинками, слегка поникающими от черешка.",
    { petiole: 0.1 },
  ),
  syngonium: profile(
    "basal",
    [10, 35],
    -20,
    0.34,
    0.27,
    "Кустовая ювенильная форма: стреловидные листья на длинных черешках.",
  ),
  snake: profile(
    "swords",
    [78, 89],
    -7,
    0.92,
    0.12,
    "Жёсткие прямостоячие мечевидные листья из нескольких точек роста; вертикальность сохранена.",
    { cup: 0.09, twist: 3 },
  ),
  palm: profile(
    "palm",
    [5, 25],
    -20,
    0.21,
    0.04,
    "Изогнутые перистые листья: узкие листочки попарно вдоль общей дугообразной оси.",
    { cup: 0.06, twist: 3 },
  ),
  calathea: profile(
    "basal",
    [5, 25],
    -12,
    0.42,
    0.37,
    "Округлые листья на отдельных черешках. Показано дневное раскрытое положение; ночное движение не моделируется.",
    { cup: 0.05 },
  ),
  alocasia: profile(
    "basal",
    [-60, -35],
    -8,
    0.45,
    0.37,
    "Щитовидные пластинки на высоких черешках, вершины направлены наклонно вниз.",
    { cup: 0.08 },
  ),
  anthurium: profile(
    "basal",
    [-25, 10],
    -15,
    0.38,
    0.31,
    "Сердцевидные листья на черешках, от почти горизонтальных до наклонно поникающих.",
  ),
  benjamina: profile(
    "weeping",
    [-10, 25],
    -30,
    0.13,
    0.065,
    "Мелкие заострённые листья на разветвлённой кроне с поникающими ветвями.",
  ),
  peperomia: profile(
    "branched",
    [10, 35],
    -10,
    0.23,
    0.19,
    "Короткие ветвящиеся стебли и чашевидные мясистые листья.",
    { cup: 0.13 },
  ),
};
Object.assign(
  plantArchitecture,
  Object.fromEntries(
    Object.entries(plantAdditions).map(([id, p]) => [
      id,
      ((p) => p.architecture)(p),
    ]),
  ),
);
for (const [id, p] of Object.entries(plantArchitecture)) {
  // Approximate blade-length limits before height fitting; not cultivar maxima.
  p.lengthLimit ??= {
    monstera: 80,
    elastica: 30,
    lyrata: 45,
    strelitzia: 100,
    dracaena: 65,
    peace: 45,
    aglaonema: 30,
    zz: 12,
    spider: 90,
    jade: 7,
    pothos: 30,
    philodendron: 25,
    syngonium: 30,
    snake: 120,
    palm: 30,
    calathea: 35,
    alocasia: 40,
    anthurium: 40,
    benjamina: 12,
    peperomia: 12,
  }[id];
  p.url =
    id === "monstera"
      ? "https://ask.ifas.ufl.edu/publication/hs311"
      : id === "spider"
        ? "https://pza.sanbi.org/chlorophytum-comosum"
        : id === "strelitzia"
          ? "https://plants.ces.ncsu.edu/plants/strelitzia-nicolai/"
          : plants[id].url;
}
