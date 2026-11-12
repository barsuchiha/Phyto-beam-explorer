// Product cards and their technical images checked 2026-11-12.
// These are Full Comfort variants, not Sunlike or bicolor variants of the same SKU.
export const bulbManual =
  "https://minifermer.ru/data/doc/pamyatka-po-ispolzovaniyu-fitolamp-e27-ot-minifermer31.pdf";
export const bulbScreenNote =
  "MiniFermer запрещает накрывать эти лампы плафоном или отражателем и рекомендует открытый патрон. Экран здесь — только оптическая гипотеза: даже при открытом радиаторе совместимость не подтверждена; нагрев не рассчитан.";
export const bulbAssumptions = {
  efficacy: [1.5, 1.9, 2.3], // Whole lamp µmol/J, including driver/heat; assumed, not a datasheet.
  angles: [110, 120, 130],
};
export const minifermerBulbs = {
  mfE27_12: {
    name: "MiniFermer E27 · 12 Вт · Фулл Комфорт 4000 K + 660 нм",
    watts: [10, 12.5, 15],
    size: [100, 100, 100],
    mass: 0.45,
    dimensionsNote:
      "В тексте Ø95 × 100 мм, на фото Ø100 × 100 мм; для примерки принят больший диаметр 100 мм.",
    powerNote:
      "Название — 12 Вт, в характеристиках номинальные 15 Вт и потребление 10–15 Вт. База 12,5 Вт — середина этого диапазона, не замер.",
    ledNote:
      "В тексте Samsung SMD; полный артикул, число LED и ток не установлены.",
    vendorPPFD: [230, 125, 100, 89],
    url: "https://minifermer.ru/product_2786.html",
    measurementURL: "https://minifermer.ru/data/11/e27-12w-4k.jpg",
  },
  mfE27_25: {
    name: "MiniFermer E27 · 25 Вт · Фулл Комфорт 4000 K + 660 нм",
    watts: [20, 22.5, 25],
    size: [130, 130, 130],
    mass: 0.5,
    dimensionsNote:
      "В тексте Ø124 × 130 мм, на схеме Фулл Комфорт Ø130 мм; для примерки принят больший диаметр 130 мм.",
    powerNote:
      "Потребление 20–25 Вт по карточке. База 22,5 Вт — середина диапазона, не замер.",
    ledNote:
      "На схеме Фулл Комфорт: 105 Samsung LM281B+ Pro и 15 Epileds 660 нм. Бин, ток и текущая комплектация партии не подтверждены.",
    vendorPPFD: [485, 287, 216, 180],
    url: "https://minifermer.ru/product_2549.html",
    measurementURL:
      "https://minifermer.ru/data/11/e27-specs-25w-fullcomfort.jpg",
  },
};
