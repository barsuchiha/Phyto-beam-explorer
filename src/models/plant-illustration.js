import { plantAdditions } from "../data/plant-additions.js";
import { plantShapes } from "../data/plant-shapes.js";

// Visual growth scenarios, not botanical leaf-count measurements or optical meshes.
export const plantArt = {
  monstera: { habit: "climber", leaf: "split", count: [4, 18] },
  elastica: { habit: "tree", leaf: "oval", count: [5, 25] },
  lyrata: { habit: "tree", leaf: "fiddle", count: [4, 20] },
  strelitzia: { habit: "fan", leaf: "banana", count: [4, 15] },
  dracaena: { habit: "canes", leaf: "ribbon", count: [16, 48] },
  peace: { habit: "basal", leaf: "lance", count: [6, 27], flower: "white" },
  aglaonema: {
    habit: "basal",
    leaf: "oval",
    count: [6, 25],
    pattern: "silver",
  },
  zz: { habit: "compound", leaf: "oval", count: [3, 9] },
  spider: { habit: "rosette", leaf: "grass", count: [12, 42] },
  jade: { habit: "succulent", leaf: "round", count: [12, 60] },
  pothos: { habit: "climber", leaf: "heart", count: [5, 27], pattern: "gold" },
  philodendron: { habit: "climber", leaf: "heart-long", count: [5, 25] },
  syngonium: { habit: "basal", leaf: "arrow", count: [5, 25], pattern: "pale" },
  snake: { habit: "swords", leaf: "sword", count: [5, 21], pattern: "bands" },
  palm: { habit: "palm", leaf: "lance", count: [4, 11] },
  calathea: {
    habit: "basal",
    leaf: "round",
    count: [5, 22],
    pattern: "stripes",
  },
  alocasia: {
    habit: "basal",
    leaf: "shield",
    count: [3, 12],
    pattern: "veins",
  },
  anthurium: { habit: "basal", leaf: "heart", count: [5, 22], flower: "red" },
  benjamina: { habit: "weeping", leaf: "pointed", count: [22, 110] },
  peperomia: { habit: "succulent", leaf: "spoon", count: [10, 42] },
};
Object.assign(
  plantArt,
  Object.fromEntries(
    Object.entries(plantAdditions).map(([id, p]) => [id, p.art]),
  ),
);
const mix = (a, b, t) => a + (b - a) * t;
const fraction = (x) => x - Math.floor(x);
const organic = (i) => fraction((i + 1) * 0.61803398875);

export function plantIllustration(id, heightCm) {
  const spec = plantShapes[id],
    art = plantArt[id];
  const growth = Math.max(
    0,
    Math.min(1, (heightCm - spec.min) / (spec.max - spec.min)),
  );
  const count = Math.floor(mix(...art.count, growth) + 1e-8);
  const leaves = [],
    stems = [],
    flowers = [];
  const stem = (x, y, tx, ty, width = 1, bend = 0) =>
    stems.push({
      d: `M${x} ${y} Q${mix(x, tx, 0.5) + bend} ${mix(y, ty, 0.62)} ${tx} ${ty}`,
      width,
    });
  const leaf = (x, y, tx, ty, w, extra = {}) =>
    leaves.push({
      x,
      y,
      tx,
      ty,
      w,
      kind: art.leaf,
      pattern: art.pattern,
      ...extra,
    });
  const ribbon = (x, y, tx, ty, arch, w, extra = {}) =>
    leaves.push({
      kind: art.leaf,
      pattern: "stripe",
      x,
      y,
      tx,
      ty,
      w,
      path: `M${x} ${y} C${x + (tx - x) * 0.14 - w} ${arch} ${tx * 0.82 - w} ${arch} ${tx} ${ty} C${tx * 0.82 + w} ${arch * 0.99} ${x + (tx - x) * 0.14 + w} ${arch * 0.95} ${x} ${y}Z`,
      vein: `M${x} ${y} C${x + (tx - x) * 0.14} ${arch} ${tx * 0.82} ${arch} ${tx} ${ty}`,
      bounds: [Math.min(x, tx) - w * 2, Math.max(x, tx) + w * 2, 0, arch],
      ...extra,
    });
  if (art.habit === "palmate") {
    for (let i = 0; i < count; i++) {
      const x = (organic(i) - 0.5) * 0.7,
        y = 0.3 + 0.5 * organic(i + 3);
      stem(0, 0, x, y);
      for (let j = 0; j < art.leaflets; j++) {
        const a = (2 * Math.PI * j) / art.leaflets;
        leaf(x, y, x + 0.25 * Math.cos(a), y + 0.25 * Math.sin(a), 0.15);
      }
    }
  } else if (art.habit === "rosette") {
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? -1 : 1,
        q = (Math.floor(i / 2) + 1) / (Math.ceil(count / 2) + 1);
      ribbon(
        side * 0.025,
        0.025,
        side * (0.12 + 0.88 * q),
        0.18 + 0.65 * (1 - q) + 0.06 * organic(i),
        0.86 + 0.18 * organic(i + 4),
        0.022 + 0.018 * (1 - q),
      );
    }
  } else if (art.habit === "canes") {
    const canes = [
      [-0.24, 0.62],
      [0.1, 0.8],
      [0.36, 0.49],
    ];
    canes.forEach(([x, y]) => stem(x * 0.4, 0, x, y, 3));
    for (let i = 0; i < count; i++) {
      const [x, y] = canes[i % 3],
        side = i % 2 ? -1 : 1,
        q = organic(i),
        reach = 0.27 + 0.4 * q;
      ribbon(
        x,
        y,
        x + side * reach,
        y - 0.17 + 0.22 * organic(i + 5),
        y + 0.22,
        0.016,
      );
    }
  } else if (art.habit === "swords") {
    for (let i = 0; i < count; i++) {
      const q = organic(i),
        x = (q - 0.5) * 0.7,
        top = 0.55 + 0.45 * organic(i + 7);
      leaf(x, 0.02, x + (q - 0.5) * 0.35, top, 0.15 + 0.05 * organic(i + 3));
    }
  } else if (
    art.habit === "compound" ||
    art.habit === "palm" ||
    art.habit === "fern"
  ) {
    const fern = art.habit === "fern",
      palm = art.habit === "palm" || fern;
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? -1 : 1,
        q = (Math.floor(i / 2) + 0.3) / Math.ceil(count / 2),
        endX = side * (palm ? 0.3 + 0.85 * q : 0.12 + 0.55 * q),
        endY = palm ? 1 - 0.48 * q : 1 - 0.22 * q;
      const baseX = side * 0.04,
        baseY = palm ? 0.25 : 0,
        cx = endX * (palm ? 0.35 : 0.45),
        cy = palm ? 1.12 : endY * 0.55;
      stem(baseX * 0.4, 0, baseX, baseY, 1.4);
      stems.push({
        d: `M${baseX} ${baseY}Q${cx} ${cy} ${endX} ${endY}`,
        width: palm ? 0.85 : 1.4,
      });
      const pairs =
        (fern ? 14 : palm ? 7 : 3) +
        Math.floor(growth * (fern ? 10 : palm ? 4 : 3));
      for (let j = 0; j < pairs; j++) {
        const t = 0.23 + (0.7 * (j + 0.5)) / pairs,
          x = (1 - t) ** 2 * baseX + 2 * (1 - t) * t * cx + t * t * endX,
          y = (1 - t) ** 2 * baseY + 2 * (1 - t) * t * cy + t * t * endY;
        let dx = 2 * ((1 - t) * (cx - baseX) + t * (endX - cx)),
          dy = 2 * ((1 - t) * (cy - baseY) + t * (endY - cy));
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        const span = (palm ? 0.27 : 0.2) * Math.sin(Math.PI * t);
        for (const side of [-1, 1])
          leaf(
            x,
            y,
            x + side * dy * span + dx * 0.06,
            y - side * dx * span + dy * 0.07,
            palm ? 0.045 : 0.14,
            { kind: palm ? "lance" : "oval", delicate: palm },
          );
      }
      leaf(endX, endY - 0.07, endX * 1.05, endY + 0.05, palm ? 0.045 : 0.13, {
        kind: palm ? "lance" : "oval",
      });
    }
  } else if (art.habit === "climber" || art.habit === "tree") {
    const climbing = art.habit === "climber",
      monstera = id === "monstera",
      tree = !climbing;
    if (climbing && !monstera)
      stems.push({ d: "M0 0V.94", width: 3, support: true });
    stem(0, 0, 0.02, 0.96, tree ? 2 : 1.2, climbing ? 0.08 : 0);
    for (let i = 0; i < count; i++) {
      const q = (i + 0.5) / count,
        y = 0.22 + q * 0.68,
        side = i % 2 ? -1 : 1,
        spread = 0.7 + 0.3 * organic(i + 3);
      const x = side * (tree ? 0.07 : monstera ? 0.28 : 0.2) * spread;
      stem(
        0.03 * Math.sin(q * 10),
        Math.max(0.08, y - (tree ? 0.03 : 0.2)),
        x,
        y,
        monstera ? 1.1 : 0.7,
      );
      if (tree)
        leaf(
          x,
          y,
          side * (id === "lyrata" ? 0.48 : 0.62) * spread,
          y + (id === "lyrata" ? 0.2 : 0.1) * (1.1 - 0.3 * q),
          id === "lyrata" ? 0.39 : 0.29,
        );
      else
        leaf(
          x,
          y,
          x + side * (monstera ? 0.36 : 0.28) * spread,
          y - (monstera ? 0.21 : 0.16) * (1 + 0.25 * organic(i)),
          monstera ? 0.48 : 0.38,
        );
    }
  } else if (art.habit === "weeping") {
    stem(0, 0, 0.04, 0.93, 3);
    const branches = [];
    for (let b = 0; b < 9; b++) {
      const side = b % 2 ? -1 : 1,
        y = 0.35 + b * 0.055,
        tx =
          side * 0.85 * Math.sqrt(Math.max(0.12, 1 - ((y - 0.62) / 0.37) ** 2)),
        ty = y + 0.15;
      stem(0, y * 0.88, tx, ty, 1.1, -side * 0.12);
      branches.push([tx, ty, y, side]);
    }
    for (let i = 0; i < count; i++) {
      const [tx, ty, y, side] = branches[i % branches.length],
        q = 0.18 + 0.82 * organic(i + 3),
        x = tx * q,
        z = mix(y, ty, q);
      leaf(
        x,
        z,
        x + side * (0.09 + 0.06 * organic(i)),
        z - 0.1 + 0.18 * organic(i + 5),
        0.13,
      );
    }
  } else if (art.habit === "succulent") {
    const jade = id === "jade",
      branches = jade
        ? [
            [-0.6, 0.65],
            [-0.32, 0.91],
            [0.12, 0.98],
            [0.6, 0.72],
            [0.45, 0.91],
          ]
        : [
            [-0.5, 0.75],
            [0, 0.98],
            [0.5, 0.83],
          ];
    stem(0, 0, 0, jade ? 0.6 : 0.7, jade ? 3 : 1.5);
    branches.forEach(([x, y]) =>
      stem(0, jade ? 0.22 : 0.06, x, y, jade ? 1.8 : 1.1),
    );
    for (let i = 0; i < count; i++) {
      const [bx, by] = branches[Math.floor(i / 2) % branches.length],
        t =
          0.4 +
          0.55 *
            organic(
              Math.floor(i / (2 * branches.length)) + Math.floor(i / 2) * 3,
            ),
        x = bx * t,
        y = mix(jade ? 0.22 : 0.06, by, t),
        side = i % 2 ? -1 : 1;
      leaf(
        x,
        y,
        x + side * (jade ? 0.18 : 0.23),
        y + 0.07 + (jade ? 0.035 : 0.055) * organic(i),
        jade ? 0.16 : 0.25,
      );
    }
  } else {
    // Basal petioles and the strelitzia fan have no fictional central tree trunk.
    const fan = art.habit === "fan";
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? -1 : 1,
        spread = organic(i + 2);
      const x = side * (0.12 + 0.58 * spread),
        y = 0.32 + 0.3 * (1 - spread) + 0.06 * organic(i + 6);
      const hanging = id === "alocasia" || id === "anthurium";
      const rootY = hanging ? y + 0.25 : y;
      const tipX = x + side * (fan ? 0.25 : 0.27) * (0.5 + organic(i + 7)),
        tipY = hanging
          ? rootY - 0.3
          : rootY + (fan ? 0.34 : 0.27) + 0.08 * (1 - spread);
      stem(side * 0.025, 0, x, rootY, fan ? 1.5 : 0.9, side * 0.06);
      leaf(
        x,
        rootY,
        tipX,
        tipY,
        fan
          ? 0.24
          : id === "alocasia"
            ? 0.55
            : id === "calathea"
              ? 0.42
              : id === "peace"
                ? 0.26
                : 0.32,
      );
    }
    if (art.flower) {
      const n = 1 + Math.floor(growth * 2);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.45,
          y = 0.78 + 0.06 * organic(i);
        stem(x * 0.2, 0, x, y, 1);
        flowers.push({
          x,
          y,
          tx: x + 0.04,
          ty: y + 0.18,
          w: art.flower === "white" ? 0.11 : 0.23,
          kind: art.flower === "white" ? "lance" : "heart",
          color: art.flower,
        });
      }
    }
  }
  // Conservative bounds include the leaf blade, not only its tip/attachment.
  let radius = 0.1,
    top = ["climber", "tree", "weeping", "succulent"].includes(art.habit)
      ? 0.97
      : 0.1;
  for (const l of [...leaves, ...flowers]) {
    if (l.bounds) {
      radius = Math.max(radius, Math.abs(l.bounds[0]), Math.abs(l.bounds[1]));
      top = Math.max(top, l.bounds[3]);
    } else {
      const len = Math.hypot(l.tx - l.x, l.ty - l.y),
        nx = (l.ty - l.y) / len,
        ny = -(l.tx - l.x) / len;
      radius = Math.max(
        radius,
        Math.abs(l.x) + Math.abs(nx * l.w * 0.55),
        Math.abs(l.tx) + Math.abs(nx * l.w * 0.55),
      );
      top = Math.max(
        top,
        l.y + Math.abs(ny * l.w * 0.55),
        l.ty + Math.abs(ny * l.w * 0.55),
      );
    }
  }
  return {
    id,
    heightCm,
    growth,
    habit: art.habit,
    leaves,
    stems,
    flowers,
    radius,
    top,
  };
}
