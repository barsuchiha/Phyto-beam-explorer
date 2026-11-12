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
};
export const categories = [
  { label: "Света не хватает", color: "var(--pbe-blue)" },
  { label: "Условно хватает", color: "var(--pbe-yellow)" },
  { label: "Оптимально*", color: "var(--pbe-green)" },
  { label: "Слишком много*", color: "var(--pbe-red)" },
  { label: "Опасно*", color: "var(--pbe-burgundy)" },
];
