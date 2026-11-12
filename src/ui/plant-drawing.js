import { plantIllustration } from "../models/plant-illustration.js";

const ns = "http://www.w3.org/2000/svg";
function el(parent, tag, attrs = {}) {
  const n = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent.append(n);
  return n;
}
const outline = {
  stroke: "var(--plant-ink)",
  "stroke-width": 0.8,
  "vector-effect": "non-scaling-stroke",
};
export const paths = {
  oval: "M0 0C-.48 .12 -.52 .76 0 1C.52 .76 .48 .12 0 0Z",
  pointed: "M0 0C-.48 .12 -.45 .65 0 1C.42 .62 .42 .14 0 0Z",
  round: "M0 0C-.52 .02 -.67 .83 -.24 .96Q0 1.08 .24 .96C.67 .83 .52 .02 0 0Z",
  spoon:
    "M0 0C-.32 .08 -.55 .45 -.48 .78C-.46 1.06 .46 1.06 .48 .78C.55 .45 .32 .08 0 0Z",
  lance: "M0 0C-.25 .12 -.53 .55 0 1C.53 .55 .25 .12 0 0Z",
  banana:
    "M0 0C-.42 .04 -.48 .25 -.46 .65Q-.46 .95 0 1Q.46 .95 .46 .65C.48 .25 .42 .04 0 0Z",
  fiddle:
    "M0 0C-.20 .05 -.23 .18 -.15 .32C-.12 .42 -.47 .48 -.50 .72Q-.48 1.04 0 1Q.48 1.04 .50 .72C.47 .48 .12 .42 .15 .32C.23 .18 .20 .05 0 0Z",
  heart:
    "M0 .14C-.18 -.03 -.48 .01 -.5 .26C-.5 .58 -.2 .83 0 1C.2 .83 .5 .58 .5 .26C.48 .01 .18 -.03 0 .14Z",
  "heart-long":
    "M0 .18C-.14 -.05 -.5 -.02 -.5 .23C-.5 .52 -.13 .83 0 1C.13 .83 .5 .52 .5 .23C.5 -.02 .14 -.05 0 .18Z",
  arrow: "M0 .24L-.49 0Q-.44 .28 -.30 .42L0 1L.30 .42Q.44 .28 .49 0Z",
  shield:
    "M0 .2L-.5 .01L-.46 .24L-.34 .31L-.37 .45L-.24 .52L-.24 .65L-.12 .75L0 1L.12 .75L.24 .65L.24 .52L.37 .45L.34 .31L.46 .24L.5 .01Z",
  sword: "M-.25 0C-.48 .3 -.26 .73 0 1C.28 .73 .46 .3 .25 0Z",
  split:
    "M0 .08C-.16 -.03 -.43 .02 -.48 .16L-.13 .20L-.49 .25Q-.52 .33 -.44 .39L-.12 .36L-.40 .48Q-.38 .55 -.31 .62L-.08 .55L-.23 .73Q-.1 .9 0 1Q.1 .9 .23 .73L.08 .55L.31 .62Q.38 .55 .4 .48L.12 .36L.44 .39Q.52 .33 .49 .25L.13 .20L.48 .16C.43 .02 .16 -.03 0 .08Z",
};
export function plantDrawing(svg, c, P, id) {
  const model = plantIllustration(id, c.height * 100),
    origin = P([0, 0, 0]);
  const scale = Math.abs(P([1, 0, 0])[0] - origin[0]);
  const root = el(svg, "g", {
    class: "plant-illustration",
    "data-plant": id,
    "data-leaf-count": model.leaves.length,
    transform: `translate(${origin[0]} ${origin[1]}) scale(${(c.rx * scale) / model.radius} ${(-c.height * scale) / model.top})`,
  });
  const defs = el(root, "defs"),
    prefix = (svg.id || "plant") + "-" + id;
  const kinds = new Set(
    [...model.leaves, ...model.flowers]
      .filter((l) => !l.path)
      .map((l) => l.kind),
  );
  for (const kind of kinds)
    el(
      el(defs, "clipPath", {
        id: `${prefix}-${kind}`,
        clipPathUnits: "userSpaceOnUse",
      }),
      "path",
      { d: paths[kind] },
    );
  for (const s of model.stems)
    el(root, "path", {
      d: s.d,
      fill: "none",
      ...outline,
      "stroke-width": s.width,
      stroke: s.support ? "var(--muted-foreground)" : "var(--plant-ink)",
      "stroke-opacity": s.support ? 0.5 : 0.85,
    });
  function drawLeaf(l, flower = false) {
    if (l.path) {
      el(root, "path", {
        d: l.path,
        fill: "var(--plant-fill)",
        ...outline,
        class: "plant-leaf",
        "data-kind": l.kind,
      });
      el(root, "path", {
        d: l.vein,
        fill: "none",
        stroke: "var(--plant-variegation)",
        "stroke-width": 0.7,
        "vector-effect": "non-scaling-stroke",
        "stroke-opacity": 0.7,
      });
      return;
    }
    const length = Math.hypot(l.tx - l.x, l.ty - l.y),
      angle = (Math.atan2(-(l.tx - l.x), l.ty - l.y) * 180) / Math.PI;
    const g = el(root, "g", {
      transform: `translate(${l.x} ${l.y}) rotate(${angle}) scale(${l.w} ${length})`,
      class: flower ? "plant-flower" : "plant-leaf",
      "data-kind": l.kind,
    });
    const fill = flower
      ? l.color === "red"
        ? "var(--plant-flower)"
        : "var(--plant-cream)"
      : l.pattern === "veins"
        ? "var(--plant-dark)"
        : "var(--plant-fill)";
    el(g, "path", {
      d: paths[l.kind],
      fill,
      ...outline,
      "stroke-width": l.delicate ? 0.5 : 0.8,
    });
    const clip = el(g, "g", { "clip-path": `url(#${prefix}-${l.kind})` });
    if (l.pattern === "gold")
      for (const [x, y, s] of [
        [-0.22, 0.25, 0.15],
        [0.16, 0.48, 0.2],
        [-0.1, 0.72, 0.12],
      ])
        el(clip, "path", {
          d: `M${x} ${y}q${s} -.16 ${s * 0.7} .04t${-s} .15Z`,
          fill: "var(--plant-variegation)",
          "fill-opacity": 0.85,
        });
    if (l.pattern === "silver" || l.pattern === "pale")
      el(clip, "path", {
        d: "M0 .08C-.42 .2 -.2 .36 -.3 .48L-.12 .52L-.19 .67L0 .95L.16 .62L.10 .53L.28 .40L.13 .33L.30 .18Z",
        fill: "var(--plant-variegation)",
        "fill-opacity": 0.65,
      });
    if (l.pattern === "bands")
      for (let y = 0.1; y < 0.95; y += 0.1)
        el(clip, "path", {
          d: `M-.5 ${y}q.25 .05 .5 .02t.5 -.04v.035q-.4 .08 -1 .01Z`,
          fill: "var(--plant-variegation)",
          "fill-opacity": 0.65,
        });
    if (l.pattern === "stripes")
      for (let y = 0.14; y < 0.95; y += 0.14)
        for (const side of [-1, 1])
          el(clip, "path", {
            d: `M0 ${y}Q${side * 0.23} ${y - 0.1} ${side * 0.53} ${y - 0.02}L${side * 0.53} ${y + 0.055}Q${side * 0.23} ${y - 0.02} 0 ${y + 0.055}Z`,
            fill: "var(--plant-variegation)",
            "fill-opacity": 0.7,
          });
    if (l.kind !== "sword" && !flower && !l.delicate) {
      const vein = {
        fill: "none",
        stroke:
          l.pattern === "veins" ? "var(--plant-cream)" : "var(--plant-ink)",
        "stroke-width": l.pattern === "veins" ? 1 : 0.55,
        "vector-effect": "non-scaling-stroke",
        "stroke-opacity": l.pattern === "veins" ? 0.9 : 0.55,
      };
      el(clip, "path", { d: "M0 .04Q-.02 .55 0 .96", ...vein });
      if (!["round", "spoon"].includes(l.kind) || l.pattern === "stripes")
        for (let y = 0.23; y < 0.8; y += 0.18)
          for (const side of [-1, 1])
            el(clip, "path", {
              d: `M0 ${y}Q${side * 0.21} ${y + 0.06} ${side * 0.43} ${y + 0.14}`,
              ...vein,
            });
    }
    if (l.kind === "banana")
      for (const y of [0.32, 0.6, 0.76])
        el(clip, "path", {
          d: `M-.5 ${y}L-.08 ${y - 0.08}`,
          fill: "none",
          stroke: "var(--background)",
          "stroke-width": 0.6,
          "vector-effect": "non-scaling-stroke",
        });
    if (flower)
      el(g, "path", {
        d: "M0 .17L.06 .72",
        stroke: "var(--plant-spadix)",
        "stroke-width": 2,
        "stroke-linecap": "round",
        "vector-effect": "non-scaling-stroke",
      });
  }
  model.leaves.forEach((l) => drawLeaf(l));
  model.flowers.forEach((l) => drawLeaf(l, true));
  const pot = Math.min(0.34, Math.max(0.12, c.rx * 0.65));
  el(svg, "polygon", {
    points: [
      [-pot / 2, 0, 0],
      [pot / 2, 0, 0],
      [pot * 0.36, 0, -pot * 0.8],
      [-pot * 0.36, 0, -pot * 0.8],
    ]
      .map((p) => P(p).join(","))
      .join(" "),
    fill: "var(--muted)",
    stroke: "var(--muted-foreground)",
    "stroke-width": 1,
  });
  const a = P([-pot * 0.53, 0, 0]),
    b = P([pot * 0.53, 0, 0]);
  el(svg, "line", {
    x1: a[0],
    y1: a[1],
    x2: b[0],
    y2: b[1],
    stroke: "var(--muted-foreground)",
    "stroke-width": 2,
  });
  return model;
}
