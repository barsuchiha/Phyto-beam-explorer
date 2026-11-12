import { plantModel } from "../models/plants.js";
import { decimal } from "./format.js";

const ns = "http://www.w3.org/2000/svg";
function el(svg, tag, attrs = {}, label) {
  const n = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (label !== undefined) n.textContent = label;
  svg.appendChild(n);
  return n;
}
function setup(svg, w) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${w} 300`);
  const defs = el(svg, "defs");
  const cp = el(defs, "clipPath", { id: svg.id + "-clip" });
  el(cp, "rect", { x: 8, y: 12, width: w - 16, height: 265 });
  return el(svg, "g", { "clip-path": `url(#${svg.id}-clip)` });
}

export function renderDiagrams(q, state, scene) {
  const side = q("pbe-side"),
    plan = q("pbe-plan");
  const {
    catalog,
    estimated,
    op,
    base,
    dim,
    angle,
    h,
    b,
    t,
    g,
    metrics,
    meanClass,
    assessment,
    selected,
  } = scene;
  if (catalog && !op.ok) {
    q("pbe-geometric-value").textContent = "";
    for (const svg of [side, plan]) {
      const w = Math.max(260, svg.getBoundingClientRect().width);
      setup(svg, w);
      el(svg, "text", { x: 14, y: 145 }, "Измени ток, DIM или драйвер");
      svg.setAttribute("aria-label", "Нет расчёта: " + op.reason);
    }
    return;
  }
  const beam = "var(--muted-foreground)",
    plant = "var(--foreground)",
    desk = "var(--muted-foreground)",
    edge = "var(--muted-foreground)";
  side.setAttribute(
    "aria-label",
    "Прямые пучки над зоной кроны и рабочей поверхностью, без купола",
  );
  const sw = Math.max(260, side.getBoundingClientRect().width),
    pw = Math.max(260, plan.getBoundingClientRect().width);
  const sg = setup(side, sw),
    pg = setup(plan, pw);
  const s = (sw - 28) / 2.05,
    x0 = 14 + 0.7 * s,
    z0 = 253;
  const sx = (x) => x0 + x * s,
    sy = (z) => z0 - z * s;
  el(sg, "line", {
    x1: 14,
    y1: z0,
    x2: sw - 14,
    y2: z0,
    stroke: edge,
    "stroke-width": 1,
  });
  for (const [idx, a] of g.entries()) {
    const alpha = catalog ? op.fluxes[idx] / base.ppf : dim / 100;
    const ex = (a.w / 2) * Math.cos(t),
      ez = (a.w / 2) * Math.sin(t);
    const left = a.x - ex + (h - ez) * Math.tan(t - b),
      right = a.x + ex + (h + ez) * Math.tan(t + b);
    el(sg, "path", {
      d: `M${sx(a.x - ex)} ${sy(h - ez)} L${sx(a.x + ex)} ${sy(h + ez)} L${sx(right)} ${z0} L${sx(left)} ${z0} Z`,
      fill: beam,
      "fill-opacity": 0.08 * alpha,
      stroke: beam,
      "stroke-opacity": 0.6 * alpha,
      "stroke-width": 1,
    });
    el(sg, "line", {
      x1: sx(a.x - ex),
      y1: sy(h - ez),
      x2: sx(a.x + ex),
      y2: sy(h + ez),
      stroke: "var(--foreground)",
      "stroke-width": 4,
    });
    el(sg, "line", {
      x1: sx(a.x),
      y1: sy(h),
      x2: sx(a.x + h * Math.tan(t)),
      y2: z0,
      stroke: beam,
      "stroke-opacity": alpha * 0.5,
      "stroke-dasharray": "3 4",
      "stroke-width": 1,
    });
  }
  el(sg, "line", {
    x1: sx(-0.28),
    y1: z0,
    x2: sx(0.28),
    y2: z0,
    stroke: plantModel.categories[meanClass].color,
    "stroke-width": 5,
  });
  el(sg, "line", {
    x1: sx(0.43),
    y1: z0,
    x2: sx(1.03),
    y2: z0,
    stroke: desk,
    "stroke-width": 3,
  });
  el(side, "text", { x: sx(0), y: 278, "text-anchor": "middle" }, "Крона");
  el(side, "text", { x: sx(0.73), y: 278, "text-anchor": "middle" }, "Стол");
  el(
    side,
    "text",
    { x: 14, y: 296, class: "text-small" },
    estimated
      ? "Линия кроны — базовый сценарий"
      : "Линия кроны — средняя оценка",
  );
  const ps = (pw - 28) / 2.05,
    px = (x) => 14 + (x + 0.7) * ps,
    py = (y) => 145 + y * ps;
  const A = Math.cos(b) ** 2 - Math.sin(t) ** 2;
  const center = (h * Math.sin(t) * Math.cos(t)) / A,
    rx = (h * Math.sin(b) * Math.cos(b)) / A,
    ry = (h * Math.sin(b)) / Math.sqrt(A);
  for (const [idx, a] of g.entries()) {
    const alpha = catalog ? op.fluxes[idx] / base.ppf : dim / 100;
    if (a.disc) {
      el(pg, "ellipse", {
        cx: px(a.x + center),
        cy: py(a.y),
        rx: (rx + a.w / 2) * ps,
        ry: (ry + a.d / 2) * ps,
        fill: beam,
        "fill-opacity": 0.1 * alpha,
        stroke: beam,
        "stroke-width": 1,
        "stroke-opacity": alpha * 0.7,
      });
    } else {
      const X = px(a.x + center - a.w / 2 - rx),
        Y = py(a.y - a.d / 2 - ry),
        W = (a.w + 2 * rx) * ps,
        H = (a.d + 2 * ry) * ps;
      el(pg, "rect", {
        x: X,
        y: Y,
        width: W,
        height: H,
        rx: rx * ps,
        ry: ry * ps,
        fill: beam,
        "fill-opacity": 0.1 * alpha,
        stroke: beam,
        "stroke-opacity": alpha * 0.7,
        "stroke-width": 1,
      });
    }
    if (a.disc)
      el(pg, "ellipse", {
        cx: px(a.x),
        cy: py(a.y),
        rx: (a.w * ps) / 2,
        ry: (a.d * ps) / 2,
        fill: "var(--background)",
        stroke: edge,
        "stroke-width": 1,
      });
    else
      el(pg, "rect", {
        x: px(a.x - a.w / 2),
        y: py(a.y - a.d / 2),
        width: a.w * ps,
        height: a.d * ps,
        fill: "var(--background)",
        stroke: edge,
        "stroke-width": 1,
      });
  }
  const coloredAreas = plantModel.categories.map(() => []);
  for (let k = 0; k < metrics.samples.length; k++) {
    const sample = metrics.samples[k],
      r0 = Math.sqrt(sample.i / metrics.nr),
      r1 = Math.sqrt((sample.i + 1) / metrics.nr);
    const a0 = (2 * Math.PI * (sample.j + (sample.i % 2) * 0.5)) / metrics.na,
      a1 = a0 + (2 * Math.PI) / metrics.na;
    const at = (r, a) =>
      `${px(0.28 * r * Math.cos(a))} ${py(0.22 * r * Math.sin(a))}`;
    const path =
      r0 === 0
        ? `M${px(0)} ${py(0)} L${at(r1, a0)} A${0.28 * r1 * ps} ${0.22 * r1 * ps} 0 0 1 ${at(r1, a1)} Z`
        : `M${at(r0, a0)} L${at(r1, a0)} A${0.28 * r1 * ps} ${0.22 * r1 * ps} 0 0 1 ${at(r1, a1)} L${at(r0, a1)} A${0.28 * r0 * ps} ${0.22 * r0 * ps} 0 0 0 ${at(r0, a0)} Z`;
    coloredAreas[assessment.classes[k]].push(path);
  }
  for (let k = 0; k < coloredAreas.length; k++) {
    if (!coloredAreas[k].length) continue;
    const category = plantModel.categories[k];
    el(pg, "path", {
      d: coloredAreas[k].join(" "),
      fill: category.color,
      "data-tooltip": `${category.label} · ${decimal(assessment.percentages[k])}% площади условной кроны`,
    });
  }
  el(pg, "ellipse", {
    cx: px(0),
    cy: py(0),
    rx: 0.28 * ps,
    ry: 0.22 * ps,
    fill: "none",
    stroke: plant,
    "stroke-width": 1,
  });
  el(pg, "circle", { cx: px(0), cy: py(0), r: 6, fill: "var(--background)" });
  el(pg, "line", {
    x1: px(0) - 4,
    y1: py(0) - 4,
    x2: px(0) + 4,
    y2: py(0) + 4,
    stroke: plant,
    "stroke-width": 2,
  });
  el(pg, "line", {
    x1: px(0) - 4,
    y1: py(0) + 4,
    x2: px(0) + 4,
    y2: py(0) - 4,
    stroke: plant,
    "stroke-width": 2,
  });
  el(pg, "rect", {
    x: px(0.43),
    y: py(-0.2),
    width: 0.6 * ps,
    height: 0.4 * ps,
    fill: "none",
    stroke: desk,
    "stroke-width": 1,
    "stroke-dasharray": "4 3",
  });
  el(plan, "text", { x: px(0), y: 278, "text-anchor": "middle" }, "Крона");
  el(plan, "text", { x: px(0.73), y: 278, "text-anchor": "middle" }, "Стол");
  el(
    plan,
    "text",
    { x: 14, y: 296, class: "text-small" },
    estimated
      ? "Крона — DLI базового сценария"
      : "Крона — локальные оценки DLI",
  );
  plan.setAttribute(
    "aria-label",
    `${estimated ? "Базовый сценарий. " : ""}${selected.name}. По среднему DLI: ${plantModel.categories[meanClass].label}. Доли площади: ${plantModel.categories.map((c, i) => c.label + " " + decimal(assessment.percentages[i]) + "%").join(", ")}.`,
  );
  const diameter = 2 * h * Math.tan(b) * 100;
  q("pbe-geometric-value").textContent =
    `Для точечного источника без наклона: ≈ ${Math.round(angle)}° на высоте ${state.height} см → контур половинной силы излучения ≈ ${Math.round(diameter)} см. За контуром тоже есть свет.`;
}
