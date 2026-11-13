import { plantAdditions } from "./plant-additions.js";
export const groups = {
  low: { L: 3, U: 6 },
  medium: { L: 6, U: 10 },
  high: { L: 12, U: 16 },
};
export const plants = {
  monstera: {
    name: "Монстера деликатесная",
    size: "крупномер",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/monstera-deliciosa/",
  },
  elastica: {
    name: "Фикус эластика",
    size: "крупномер",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/ficus-elastica/",
  },
  lyrata: {
    name: "Фикус лирата",
    size: "крупномер",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/ficus-lyrata/",
  },
  strelitzia: {
    name: "Стрелиция Николая",
    size: "крупномер",
    group: "high",
    url: "https://www.rhs.org.uk/plants/82161/strelitzia-nicolai/details",
  },
  dracaena: {
    name: "Драцена душистая",
    size: "крупномер",
    group: "low",
    url: "https://plants.ces.ncsu.edu/plants/dracaena-fragrans/",
  },
  peace: {
    name: "Спатифиллум",
    size: "среднее",
    group: "low",
    url: "https://plants.ces.ncsu.edu/plants/spathiphyllum/",
  },
  aglaonema: {
    name: "Аглаонема",
    size: "среднее",
    group: "low",
    url: "https://plants.ces.ncsu.edu/plants/aglaonema/",
  },
  zz: {
    name: "Замиокулькас",
    size: "среднее",
    group: "low",
    url: "https://plants.ces.ncsu.edu/plants/zamioculcas-zamiifolia/",
  },
  spider: {
    name: "Хлорофитум",
    size: "среднее",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/chlorophytum-comosum/",
  },
  jade: {
    name: "Толстянка овальная",
    size: "среднее",
    group: "high",
    url: "https://plants.ces.ncsu.edu/plants/crassula-ovata/",
  },
  pothos: {
    name: "Эпипремнум золотистый",
    size: "лиана на опоре",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/epipremnum-aureum/",
  },
  philodendron: {
    name: "Филодендрон сердцелистный",
    size: "лиана на опоре",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/philodendron-hederaceum/",
  },
  syngonium: {
    name: "Сингониум ножколистный",
    size: "среднее",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/syngonium-podophyllum/",
  },
  snake: {
    name: "Сансевиерия · щучий хвост",
    size: "среднее",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/dracaena-trifasciata/",
  },
  palm: {
    name: "Хамедорея изящная",
    size: "крупномер",
    group: "low",
    url: "https://plants.ces.ncsu.edu/plants/chamaedorea-elegans/",
  },
  calathea: {
    name: "Калатея орбифолия",
    size: "среднее",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/goeppertia-orbifolia/",
  },
  alocasia: {
    name: "Алоказия Polly",
    size: "среднее",
    group: "medium",
    url: "https://www.rhs.org.uk/plants/372528/alocasia-polly/details",
  },
  anthurium: {
    name: "Антуриум Андре",
    size: "среднее",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/anthurium-andraeanum/",
  },
  benjamina: {
    name: "Фикус Бенджамина",
    size: "крупномер",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/ficus-benjamina/",
  },
  peperomia: {
    name: "Пеперомия туполистная",
    size: "среднее",
    group: "medium",
    url: "https://plants.ces.ncsu.edu/plants/peperomia-obtusifolia/",
  },
};
export const categories = [
  { label: "Значительно ниже ориентира", color: "var(--pbe-blue)" },
  { label: "Ниже ориентира", color: "var(--pbe-yellow)" },
  { label: "В диапазоне ориентира", color: "var(--pbe-green)" },
  { label: "Выше ориентира", color: "var(--pbe-red)" },
  { label: "Значительно выше ориентира", color: "var(--pbe-burgundy)" },
];

Object.assign(
  plants,
  Object.fromEntries(
    Object.entries(plantAdditions).map(([id, p]) => [
      id,
      (({ name, size, group, url }) => ({ name, size, group, url }))(p),
    ]),
  ),
);
