import { plantModel } from "../models/plants.js";
import { illustrativePath, reflectionNames } from "../models/reflections.js";
import {
  add,
  sub,
  mul,
  dot,
  toWorld,
  surfacePoint,
  screenHit,
  rayCrown,
} from "../models/crown.js";

const ns = "http://www.w3.org/2000/svg";
function el(parent, tag, attrs = {}, label) {
  const n = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (label !== undefined) n.textContent = label;
  parent.append(n);
  return n;
}
const points = (arr) => arr.map((p) => p.join(",")).join(" ");
function setup(svg) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", "0 0 520 440");
}
function plantDrawing(svg, c, P) {
  const line = (a, b, attrs = {}) =>
    el(svg, "line", {
      x1: P(a)[0],
      y1: P(a)[1],
      x2: P(b)[0],
      y2: P(b)[1],
      stroke: "var(--plant-ink)",
      "stroke-width": 2,
      ...attrs,
    });
  const stem = [0, 0, c.height * 0.75];
  if (c.spec.form === "grass") {
    for (let i = -7; i <= 7; i++) {
      const x = ((c.rx * i) / 7) * 0.96,
        z = c.height * (0.32 + 0.22 * (1 - Math.abs(i) / 7));
      const A = P([0, 0, c.height * 0.07]),
        B = P([x * 0.2, 0, c.height]),
        C = P([x * 0.85, 0, c.height * (0.95 - Math.abs(i) * 0.025)]),
        D = P([x, 0, z]),
        E = P([x * 0.4 + c.rx * 0.045, 0, c.height * 0.78]);
      el(svg, "path", {
        d: `M${A} C${B} ${C} ${D} Q${E} ${A}Z`,
        fill: "var(--plant-fill)",
        stroke: "var(--plant-ink)",
        "stroke-width": 1.1,
      });
    }
  } else {
    line([0, 0, 0], stem);
    for (let i = 0; i < 11; i++) {
      const z = c.center[2] - c.rz * 0.65 + (i / 10) * c.rz * 1.35;
      const side = i % 2 ? -1 : 1,
        spread = Math.sqrt(Math.max(0.1, 1 - ((z - c.center[2]) / c.rz) ** 2));
      const x = side * c.rx * 0.53 * spread;
      const center = P([x, 0, z]);
      line([0, 0, Math.max(0.05, z - c.rz * 0.3)], [x, 0, z]);
      const scale = Math.abs(P([1, 0, 0])[0] - P([0, 0, 0])[0]);
      const narrow = ["ribbon", "lance"].includes(c.spec.form),
        round = c.spec.form === "round";
      const w = c.rx * (narrow ? 0.23 : 0.36) * scale,
        h = c.rz * (round ? 0.13 : 0.21) * scale;
      const g = el(svg, "g", {
        transform: `translate(${center[0]} ${center[1]}) rotate(${side * (narrow ? 35 : 25)})`,
      });
      el(g, "path", {
        d: `M0 ${h} C${-w * 1.5} ${h * 0.25} ${-w} ${-h * 0.9} 0 ${-h} C${w} ${-h * 0.9} ${w * 1.5} ${h * 0.25} 0 ${h}Z`,
        fill: "var(--plant-fill)",
        stroke: "var(--plant-ink)",
        "stroke-width": 1.2,
      });
      el(g, "path", {
        d: `M0 ${h} Q${-w * 0.12} 0 0 ${-h * 0.85}`,
        fill: "none",
        stroke: "var(--plant-ink)",
        "stroke-width": 0.7,
      });
      if (c.spec.form === "split")
        for (const y of [-0.45, 0, 0.45])
          for (const side of [-1, 1])
            el(g, "path", {
              d: `M${side * w * 0.25} ${y * h + h * 0.15} Q${side * w * 0.6} ${y * h} ${side * w * 0.85} ${y * h - h * 0.15}`,
              stroke: "var(--background)",
              "stroke-width": 2.2,
              fill: "none",
            });
      if (c.spec.form === "pinnate")
        for (const y of [-0.4, 0.2])
          for (const side of [-1, 1])
            el(g, "ellipse", {
              cx: side * w * 0.43,
              cy: y * h,
              rx: w * 0.42,
              ry: h * 0.25,
              fill: "var(--plant-fill)",
              stroke: "var(--plant-ink)",
              "stroke-width": 0.6,
            });
    }
  }
  const pot = Math.min(0.34, Math.max(0.12, c.rx * 0.65));
  el(svg, "polygon", {
    points: points([
      P([-pot / 2, 0, 0]),
      P([pot / 2, 0, 0]),
      P([pot * 0.36, 0, -pot * 0.8]),
      P([-pot * 0.36, 0, -pot * 0.8]),
    ]),
    fill: "var(--muted)",
    stroke: "var(--muted-foreground)",
    "stroke-width": 1,
  });
  line([-pot * 0.53, 0, 0], [pot * 0.53, 0, 0], {
    stroke: "var(--muted-foreground)",
    "stroke-width": 2,
  });
}
function sceneDrawing(svg, state, scene) {
  const { crown: c, rig, groups } = scene.metrics;
  // One frame for the entire orbit: moving the lamp does not make the camera pan.
  const extent = rig.radius + (rig.sector ? rig.length : 0);
  const r = Math.max(c.rx, c.rz) + state.height / 100 + extent;
  const xMin = -Math.max(c.rx, extent) - 0.2,
    xMax = Math.max(c.rx + 0.2, r + 0.12);
  const zMin = -Math.max(0.16, c.rx * 0.55),
    zMax = c.center[2] + r + 0.12;
  const scale = Math.min(465 / (xMax - xMin), 355 / (zMax - zMin));
  const ox = 28 - xMin * scale,
    oy = 395 + zMin * scale;
  const P = ([x, y, z]) => [
    ox + (x + 0.16 * y) * scale,
    oy - (z + 0.06 * y) * scale,
  ];
  const path = (arr, attrs) =>
    el(svg, "path", {
      d: arr.map((p, i) => (i ? "L" : "M") + P(p).join(" ")).join(" "),
      fill: "none",
      ...attrs,
    });
  for (let z = 0; z < zMax; z += 0.5) {
    const y = P([0, 0, z])[1];
    el(svg, "line", {
      x1: 18,
      x2: 500,
      y1: y,
      y2: y,
      stroke: "var(--border)",
      "stroke-dasharray": "2 5",
    });
    el(
      svg,
      "text",
      { x: 20, y: y - 5, "font-size": 10, fill: "var(--muted-foreground)" },
      `${Math.round(z * 100)} см`,
    );
  }
  const arc = [];
  for (let degree = 0; degree <= 90; degree += 3) {
    const a = (degree * Math.PI) / 180,
      n = [Math.sin(a), 0, Math.cos(a)];
    arc.push(
      add(
        c.center,
        mul(n, Math.hypot(c.rx * n[0], c.rz * n[2]) + state.height / 100),
      ),
    );
  }
  path(arc, {
    stroke: "var(--muted-foreground)",
    "stroke-dasharray": "3 6",
    "stroke-opacity": 0.5,
  });
  for (const [index, label] of [
    [0, "0°"],
    [arc.length - 1, "90°"],
  ]) {
    if (
      (index === 0 && state.orbit === 0) ||
      (index === arc.length - 1 && state.orbit === 90)
    )
      continue;
    const p = P(arc[index]);
    el(svg, "text", { x: p[0] + 10, y: p[1] - 10, "font-size": 11 }, label);
  }
  // A small fan of illustrative rays; the percentages use full-sphere integration.
  for (let i = -5; i <= 5; i++) {
    const a = (i * 14 * Math.PI) / 180,
      local = [Math.sin(a), 0, Math.cos(a)];
    const d = add(mul(rig.u, local[0]), mul(rig.f, local[2]));
    if (rig.sector && state.screenMode !== "absorb") {
      const trace = illustrativePath(
        c,
        rig,
        groups,
        local,
        state.screenMode,
        100 + i,
      );
      for (let k = 1; k < trace.length; k++)
        path([trace[k - 1], trace[k]], {
          stroke: "var(--beam-ink)",
          "stroke-opacity": scene.flux
            ? 0.55 * (state.reflectance / 100) ** Math.max(0, k - 1)
            : 0,
          "stroke-width": k > 1 ? 1.4 : 1,
          "stroke-dasharray": k > 1 ? "4 3" : "none",
        });
      continue;
    }
    const shield = screenHit([0, 0, 0], local, rig),
      hit = rayCrown(rig.origin, d, c);
    const distance = Math.min(shield, hit, r * 1.8),
      blocked = shield < hit;
    path([rig.origin, add(rig.origin, mul(d, distance))], {
      stroke: blocked ? "var(--muted-foreground)" : "var(--beam-ink)",
      "stroke-opacity": scene.flux ? 0.45 : 0,
      "stroke-width": 1,
      "stroke-dasharray": Number.isFinite(hit) || blocked ? "none" : "4 5",
    });
  }
  const cp = P(c.center);
  el(svg, "ellipse", {
    cx: cp[0],
    cy: cp[1],
    rx: c.rx * scale,
    ry: c.rz * scale,
    fill: "none",
    stroke: "var(--plant-ink)",
    "stroke-dasharray": "3 5",
    "stroke-opacity": 0.35,
  });
  plantDrawing(svg, c, P);
  // Conical-sector wall shared by the whole source assembly.
  if (rig.sector) {
    const panels = [];
    for (
      let d = rig.turn - rig.sector / 2;
      d < rig.turn + rig.sector / 2;
      d += 7.5
    ) {
      const end = Math.min(d + 7.5, rig.turn + rig.sector / 2),
        a = (d * Math.PI) / 180,
        b = (end * Math.PI) / 180;
      const raw = [
        [rig.radius * Math.cos(a), rig.radius * Math.sin(a), 0],
        [rig.radius * Math.cos(b), rig.radius * Math.sin(b), 0],
        [
          rig.mouthRadius * Math.cos(b),
          rig.mouthRadius * Math.sin(b),
          rig.depth,
        ],
        [
          rig.mouthRadius * Math.cos(a),
          rig.mouthRadius * Math.sin(a),
          rig.depth,
        ],
      ];
      panels.push({ raw, depth: Math.sin((a + b) / 2) });
    }
    panels.sort((a, b) => b.depth - a.depth);
    for (const panel of panels)
      el(svg, "polygon", {
        points: points(panel.raw.map((p) => P(toWorld(rig, p)))),
        fill:
          state.screenMode === "mirror"
            ? "var(--reflector-mirror)"
            : state.screenMode === "diffuse"
              ? "var(--reflector-diffuse)"
              : "var(--screen-fill)",
        "fill-opacity": 0.8,
        stroke: "var(--muted-foreground)",
        "stroke-width": 0.5,
      });
  }
  for (const g of groups) {
    const vertices = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) =>
      P(toWorld(rig, [g.x + (x * g.w) / 2, g.y + (y * g.d) / 2, 0])),
    );
    el(svg, "polygon", {
      points: points(vertices),
      fill: "var(--foreground)",
      stroke: "var(--foreground)",
      "stroke-width": 3,
    });
  }
  const source = P(rig.origin);
  el(svg, "circle", {
    cx: source[0],
    cy: source[1],
    r: 3,
    fill: "var(--background)",
    stroke: "var(--foreground)",
  });
  el(
    svg,
    "text",
    { x: source[0] + 10, y: source[1] - 14, "font-size": 12 },
    `${state.orbit}°`,
  );
  el(
    svg,
    "text",
    { x: 20, y: 425, "font-size": 12 },
    `Высота ${state.plantSize} см · крона ≈ ${Math.round(c.rx * 200)} × ${Math.round(c.ry * 200)} см`,
  );
  // Facing the lamp, this inset makes the screen sector and its rotation explicit.
  if (rig.sector) {
    const g = el(svg, "g", { transform: "translate(465 44)" });
    el(g, "circle", {
      r: 21,
      fill: "none",
      stroke: "var(--border)",
      "stroke-width": 6,
    });
    const arc = [];
    for (
      let a = rig.turn - rig.sector / 2;
      a <= rig.turn + rig.sector / 2;
      a += 5
    )
      arc.push([
        21 * Math.cos((a * Math.PI) / 180),
        21 * Math.sin((a * Math.PI) / 180),
      ]);
    el(g, "polyline", {
      points: points(arc),
      fill: "none",
      stroke: "var(--foreground)",
      "stroke-width": 6,
    });
    el(
      g,
      "text",
      { x: 0, y: 4, "text-anchor": "middle", "font-size": 10 },
      `${rig.sector}°`,
    );
    el(
      svg,
      "text",
      { x: 465, y: 80, "text-anchor": "middle", "font-size": 10 },
      "Сектор",
    );
    // Axial cross-section: distinguishes wall opening from the azimuthal sector.
    const inset = el(svg, "g", { transform: "translate(330 30)" });
    el(inset, "rect", {
      x: -58,
      y: -10,
      width: 116,
      height: 75,
      rx: 6,
      fill: "var(--background)",
      "fill-opacity": 0.94,
    });
    const half = (rig.opening * Math.PI) / 360,
      spread = 35 * Math.sin(half),
      depth = 35 * Math.cos(half);
    el(inset, "path", {
      d: "M-14 0H14",
      stroke: "var(--foreground)",
      "stroke-width": 3,
    });
    for (const side of [-1, 1])
      el(inset, "path", {
        d: `M${side * 18} 0L${side * (18 + spread)} ${depth}`,
        stroke: "var(--foreground)",
        "stroke-width": 2,
        fill: "none",
      });
    el(inset, "path", {
      d: "M0 0V39",
      stroke: "var(--muted-foreground)",
      "stroke-dasharray": "2 3",
    });
    el(
      inset,
      "text",
      { x: 0, y: 54, "text-anchor": "middle", "font-size": 10 },
      `Раскрытие ${rig.opening}°`,
    );
  }
}
function mapDrawing(svg, state, scene) {
  const { crown: c, rig, samples, nz, na, centerPoint } = scene.metrics;
  const horizontal = c.ry,
    vertical = Math.hypot(c.rx * rig.u[0], c.rz * rig.u[2]);
  const scale = Math.min(210 / horizontal, 170 / vertical);
  const P = (p) => {
    const q = sub(p, c.center);
    return [260 + dot(q, rig.v) * scale, 215 + dot(q, rig.u) * scale];
  };
  const ordered = samples
    .map((s, k) => ({ ...s, k }))
    .sort(
      (a, b) => dot(sub(a.p, c.center), rig.n) - dot(sub(b.p, c.center), rig.n),
    );
  for (const s of ordered) {
    const mu0 = -1 + (2 * s.i) / nz,
      mu1 = -1 + (2 * (s.i + 1)) / nz,
      a0 = (2 * Math.PI * s.j) / na,
      a1 = (2 * Math.PI * (s.j + 1)) / na;
    const corners = [
      [mu0, a0],
      [mu0, a1],
      [mu1, a1],
      [mu1, a0],
    ].map(([m, a]) => P(surfacePoint(c, m, a).p));
    const category = plantModel.categories[scene.assessment.classes[s.k]];
    el(svg, "polygon", {
      points: points(corners),
      fill: category.color,
      stroke: category.color,
      "stroke-width": 0.65,
      "data-tooltip": `PPFD ≈ ${Math.round(s.value)} · DLI ≈ ${(s.value * state.hours * 0.0036).toFixed(1)}`,
    });
  }
  el(svg, "ellipse", {
    cx: 260,
    cy: 215,
    rx: horizontal * scale,
    ry: vertical * scale,
    fill: "none",
    stroke: "var(--foreground)",
    "stroke-opacity": 0.4,
  });
  const marker = P(centerPoint);
  el(
    svg,
    "text",
    {
      x: marker[0],
      y: marker[1] + 4,
      "text-anchor": "middle",
      fill: "white",
      "font-size": 18,
    },
    "×",
  );
  el(
    svg,
    "text",
    { x: 260, y: 25, "text-anchor": "middle", "font-size": 12 },
    state.orbit === 0
      ? "Вид сверху"
      : state.orbit === 90
        ? "Вид сбоку"
        : "Вид вдоль оси лампы",
  );
  el(
    svg,
    "text",
    { x: 260, y: 410, "text-anchor": "middle", "font-size": 12 },
    "Датчики на условной поверхности кроны",
  );
  el(
    svg,
    "text",
    { x: 260, y: 428, "text-anchor": "middle", "font-size": 11 },
    "Обратная сторона и внутренние листья не показаны",
  );
}
export function renderDiagrams(q, state, scene) {
  const side = q("pbe-side"),
    map = q("pbe-plan");
  setup(side);
  setup(map);
  if (!scene.metrics) {
    for (const svg of [side, map])
      el(svg, "text", { x: 30, y: 210 }, "Измени ток, DIM или драйвер");
    q("pbe-budget").replaceChildren();
    q("pbe-geometric-value").textContent = "";
    return;
  }
  sceneDrawing(side, state, scene);
  mapDrawing(map, state, scene);
  side.setAttribute(
    "aria-label",
    `${scene.selected.name}, высота ${state.plantSize} см; лампа ${state.orbit}° от вертикали; сектор экрана ${state.screenSector}°; раскрытие ${state.screenOpening}°`,
  );
  map.setAttribute(
    "aria-label",
    `Карта PPFD на кроне со стороны лампы, положение ${state.orbit}°`,
  );
  q("pbe-geometric-value").textContent =
    `Лампа направлена к центру кроны. Зазор ${state.height} см измеряется от касательной плоскости кроны. Масштаб сцены подстраивается под габариты.`;
  const budget = scene.metrics.budget,
    wrap = q("pbe-budget");
  wrap.replaceChildren();
  const labels = [
    ["target", "До оболочки кроны"],
    ["screen", "Поглощено экраном"],
    ["housing", "Возврат в платы · поглощено"],
    ["room", "Мимо кроны · в комнату"],
    ["residual", "Незавершённые пути"],
  ];
  const bar = document.createElement("div");
  bar.className = "budget-bar";
  bar.setAttribute("aria-hidden", "true");
  const legend = document.createElement("div");
  legend.className = "budget-legend";
  for (const [key, label] of labels) {
    const part = document.createElement("span");
    part.className = "budget-" + key;
    part.style.width = (budget[key] ?? 0) * 100 + "%";
    bar.append(part);
    const item = document.createElement("span");
    const value = (budget[key] ?? 0) * 100;
    item.textContent = `${label}: ≈ ${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
    if (key === "residual" && value < 0.001) continue;
    legend.append(item);
  }
  const note = document.createElement("div");
  note.className = "text-small";
  note.textContent = scene.flux
    ? `Доли полного потока источника · базовый сценарий. ${state.screenSector ? reflectionNames[state.screenMode] + " экран" : "Без экрана"}. Крона — непрозрачная оболочка, не реальные листья. До кроны после отражений: ≈ ${((budget.returned ?? 0) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}% исходного потока.`
    : "Источник выключен.";
  wrap.append(bar, legend, note);
}
