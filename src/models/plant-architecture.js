import { plantArchitecture } from "../data/plant-architecture.js";
import { plantIllustration, plantArt } from "./plant-illustration.js";

const mix = (a, b, t) => a + (b - a) * t;
const rad = (a) => (a * Math.PI) / 180;
const golden = Math.PI * (3 - Math.sqrt(5));
// Stable variation, deliberately independent of the azimuth's golden angle.
// Correlating the two would put all tall/large blades on one side of a rosette.
const organic = (i) => {
  let x = (i + 1) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
const add = (a, b) => a.map((v, i) => v + b[i]);
const polar = (angle, r, z) => [r * Math.cos(angle), r * Math.sin(angle), z];
const bezier = (a, b, c, t) =>
  a.map((v, i) => (1 - t) ** 2 * v + 2 * t * (1 - t) * b[i] + t * t * c[i]);
const attachment = {
  split: 0.08,
  heart: 0.14,
  "heart-long": 0.18,
  arrow: 0.24,
  shield: 0.2,
};

// Reproducible architecture in normalized units. Independent of lamp settings.
export function plantLayout(id, heightCm) {
  const p = plantArchitecture[id],
    art = plantIllustration(id, heightCm),
    count = art.leaves.length,
    leaves = [],
    stems = [],
    flowers = [];
  const stem = (a, b, c = b, width = 1) =>
    stems.push({
      points: Array.from({ length: 17 }, (_, j) => bezier(a, b, c, j / 16)),
      width,
    });
  const leaf = (base, azimuth, index, extra = {}) => {
    const size = 0.85 + 0.3 * organic(index + 3),
      kind = plantArt[id].leaf;
    const entry = {
      base,
      azimuth,
      kind,
      pattern: plantArt[id].pattern,
      length: p.length * size,
      width: p.width * size,
      pitch: mix(...p.pitch, organic(index + 5)),
      bend: p.bend,
      twist: (organic(index + 7) - 0.5) * 2 * p.twist,
      cup: p.cup,
      ...extra,
    };
    entry.attach = attachment[entry.kind] ?? 0;
    const bladeScale = Math.min(
      1,
      p.lengthLimit / (heightCm * entry.length * 1.15),
    );
    entry.length *= bladeScale;
    entry.width *= bladeScale;
    leaves.push(entry);
  };
  const habit = p.habit;
  if (habit === "tree" || habit === "climber") {
    const spine = (z) => [0.015 * Math.sin(z * 7), 0.012 * Math.sin(z * 11), z];
    stem([0, 0, 0], spine(0.45), spine(0.96), 2);
    for (let i = 0; i < count; i++) {
      const q = (i + 0.5) / count,
        a = i * golden - 0.8,
        root = spine(0.2 + 0.66 * q),
        base = add(
          root,
          polar(a, p.petiole, 0.03 + (habit === "climber" ? 0.055 : 0)),
        );
      stem(root, add(root, polar(a, p.petiole * 0.55, 0.04)), base);
      leaf(base, a, i);
    }
  } else if (habit === "basal" || habit === "fan") {
    for (let i = 0; i < count; i++) {
      const q = organic(i + 2),
        a =
          habit === "fan"
            ? (i % 2 ? Math.PI : 0) + (0.5 - organic(i)) * 0.3
            : i * golden - 0.8,
        high = id === "alocasia" || id === "anthurium",
        base = polar(a, 0.08 + 0.16 * q, (high ? 0.68 : 0.4) + 0.22 * (1 - q));
      stem(
        polar(a, 0.025, 0),
        polar(a, 0.05 + 0.08 * q, base[2] * 0.65),
        base,
        1.2,
      );
      leaf(base, a, i, { pitch: mix(p.pitch[1], p.pitch[0], q) });
    }
  } else if (habit === "shortCanes") {
    for (let k = 0; k < 3; k++) {
      const a = k * golden,
        root = polar(a, 0.06, 0),
        tip = polar(a, 0.1, 0.52 + 0.1 * k);
      stem(root, tip, tip, 1.5);
    }
    for (let i = 0; i < count; i++) {
      const k = i % 3,
        q = organic(Math.floor(i / 3) + k),
        a = i * golden,
        root = polar(k * golden, 0.1, 0.16 + q * (0.38 + 0.1 * k)),
        base = add(root, polar(a, 0.05, 0.04));
      stem(root, base);
      leaf(base, a, i);
    }
  } else if (habit === "rosette" || habit === "canes" || habit === "swords") {
    const canes = [
      [0, 0, 0.72],
      [-0.14, 0.04, 0.53],
      [0.12, 0.08, 0.38],
    ];
    if (habit === "canes")
      for (const c of canes) stem([c[0] * 0.4, c[1] * 0.4, 0], c, c, 2.5);
    for (let i = 0; i < count; i++) {
      const q = organic(i + 2),
        a = i * golden,
        base =
          habit === "canes"
            ? canes[i % 3]
            : polar(a, habit === "swords" ? 0.06 + 0.09 * q : 0.025 * q, 0.015),
        inner = q < 0.25,
        kind = habit === "swords" ? "sword" : "strap";
      leaf(base, a, i, {
        kind,
        length:
          p.length *
          (habit === "swords"
            ? 0.6 + 0.4 * q
            : inner
              ? habit === "rosette"
                ? 0.9
                : 0.6
              : 0.85 + 0.2 * q),
        pitch: mix(p.pitch[1], p.pitch[0], q),
        bend:
          habit === "swords"
            ? p.bend
            : inner
              ? p.bend * 0.25
              : p.bend * (0.8 + 0.2 * q),
      });
    }
  } else if (habit === "compound" || habit === "palm") {
    const palm = habit === "palm",
      fronds = Math.floor(mix(...plantArt[id].count, art.growth) + 1e-8),
      pairs = (palm ? 7 : 3) + Math.floor(art.growth * (palm ? 4 : 3));
    for (let i = 0; i < fronds; i++) {
      const q = organic(i),
        a = i * golden,
        root = polar(a, 0.025, palm ? 0.28 : 0),
        control = polar(a, palm ? 0.16 : 0.07, palm ? 1.05 : 0.56),
        end = polar(
          a,
          palm ? 0.32 + 0.16 * q : 0.12 + 0.15 * q,
          0.86 - 0.18 * q,
        );
      if (palm) stem([0, 0, 0], root, root, 1.5);
      stem(root, control, end, 1.2);
      for (let j = 0; j < pairs; j++) {
        const t = 0.23 + (0.7 * (j + 0.5)) / pairs,
          base = bezier(root, control, end, t);
        for (const side of [-1, 1]) {
          const theta = a + side * (palm ? 1.2 : 1.1);
          leaf(base, theta, leaves.length, {
            length: p.length * Math.sin(Math.PI * t),
            width: p.width * (0.7 + 0.3 * Math.sin(Math.PI * t)),
            group: i,
            pair: j,
            kind: palm ? "lance" : "oval",
          });
        }
      }
      leaf(end, a, leaves.length, {
        length: palm ? 0.13 : 0.13,
        width: palm ? 0.035 : 0.08,
        kind: palm ? "lance" : "oval",
        group: i,
        pair: -1,
      });
    }
  } else {
    const weeping = habit === "weeping",
      opposite = habit === "opposite",
      n = weeping ? 9 : opposite ? 5 : 3;
    stem([0, 0, 0], [0, 0, 0.45], [0, 0, weeping ? 0.94 : 0.62], 2);
    const branches = Array.from({ length: n }, (_, i) => {
      const a = i * golden,
        root = [0, 0, weeping ? 0.3 + i * 0.05 : 0.18],
        end = polar(a, weeping ? 0.32 : 0.22, 0.68 + 0.2 * organic(i)),
        control = polar(
          a,
          weeping ? 0.18 : 0.09,
          weeping ? end[2] + 0.12 : 0.55,
        );
      stem(root, control, end, 1.5);
      return { root, control, end, a };
    });
    for (let i = 0; i < count; i++) {
      const node = opposite ? Math.floor(i / 2) : i,
        b = branches[node % n],
        t = 0.22 + 0.73 * organic(Math.floor(node / n) + (node % n) * 3),
        base = bezier(b.root, b.control, b.end, t),
        a = opposite
          ? b.a + (Math.floor(node / n) * Math.PI) / 2 + (i % 2) * Math.PI
          : b.a + (i % 2 ? 1 : -1) * 1.05;
      leaf(base, a, i);
    }
  }
  if (plantArt[id].flower) {
    for (let i = 0; i < art.flowers.length; i++) {
      const a = i * golden,
        base = polar(a, 0.12, 0.78 + 0.05 * organic(i));
      stem([0, 0, 0], polar(a, 0.07, 0.5), base);
      flowers.push({
        base,
        azimuth: a,
        kind: id === "peace" ? "lance" : "heart",
        attach: 0,
        length: 0.16,
        width: id === "peace" ? 0.08 : 0.18,
        pitch: 65,
        bend: 0,
        twist: 0,
        cup: 0.06,
        color: plantArt[id].flower,
      });
    }
  }
  return { leaves, stems, flowers, profile: p };
}

// A curved midrib with a gently cupped/twisted lamina. Adding pitch rotates
// the entire blade about its attachment without changing blade area or size.
export function bladePoint(leaf, x, y, tilt = 0) {
  const a = rad(leaf.pitch + tilt),
    b = rad(leaf.bend),
    t0 = leaf.attach ?? 0;
  const arc = (t) =>
    Math.abs(b) < 1e-9
      ? [leaf.length * t * Math.cos(a), leaf.length * t * Math.sin(a)]
      : [
          (leaf.length * (Math.sin(a + b * t) - Math.sin(a))) / b,
          (leaf.length * (Math.cos(a) - Math.cos(a + b * t))) / b,
        ];
  const [u, z] = arc(y),
    [u0, z0] = arc(t0),
    beta = a + b * y,
    roll = rad(leaf.twist) * y,
    along = [Math.cos(leaf.azimuth), Math.sin(leaf.azimuth), 0],
    across = [Math.sin(leaf.azimuth), -Math.cos(leaf.azimuth), 0],
    normal = [
      -along[0] * Math.sin(beta),
      -along[1] * Math.sin(beta),
      Math.cos(beta),
    ],
    cup = leaf.cup * leaf.width * (2 * x) ** 2 * Math.sin(Math.PI * y);
  return leaf.base.map(
    (v, i) =>
      v +
      along[i] * (u - u0) +
      (i === 2 ? z - z0 : 0) +
      x *
        leaf.width *
        (across[i] * Math.cos(roll) + normal[i] * Math.sin(roll)) +
      cup * (normal[i] * Math.cos(roll) - across[i] * Math.sin(roll)),
  );
}
