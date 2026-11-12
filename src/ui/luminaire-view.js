import * as T from "../vendor/three.module.min.js";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { SVGLoader } from "../vendor/SVGLoader.js";
import { plantIllustration } from "../models/plant-illustration.js";
import { paths } from "./plant-drawing.js";
import { add, mul, surfacePoint } from "../models/crown.js";
import { plantModel } from "../models/plants.js";

const vector = (p) => new T.Vector3(...p),
  colors = [0x3b8fea, 0xe6c64d, 0x56b879, 0xeb6b62, 0x7e2748];
const svgLoader = new SVGLoader();
function material(color, options = {}) {
  return new T.MeshStandardMaterial({
    color,
    roughness: 0.65,
    metalness: 0.12,
    side: T.DoubleSide,
    ...options,
  });
}
function line(points, color, opacity = 1) {
  return new T.Line(
    new T.BufferGeometry().setFromPoints(points.map(vector)),
    new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
}
function dispose(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
    else o.material?.dispose();
  });
  group.clear();
}
function box(group, size, position, mat) {
  const m = new T.Mesh(new T.BoxGeometry(...size), mat);
  m.position.copy(vector(position));
  group.add(m);
  return m;
}
function shapeGeometry(path) {
  const data = svgLoader.parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}" /></svg>`,
  );
  return new T.ShapeGeometry(
    data.paths.flatMap((p) => SVGLoader.createShapes(p)),
    16,
  );
}
function plant(group, c, id, height) {
  const art = plantIllustration(id, height),
    sx = c.rx / art.radius,
    sz = c.height / art.top;
  const growPoint = (x, z, depth = 0) => [
    c.soil[0] + x * sx,
    c.soil[1] + depth,
    c.soil[2] + z * sz,
  ];
  for (const stem of art.stems) {
    const nums = stem.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
    const p = [];
    for (let j = 0; j <= 16; j++) {
      const t = j / 16,
        q = 1 - t;
      if (stem.d.includes("Q"))
        p.push(
          growPoint(
            q * q * nums[0] + 2 * q * t * nums[2] + t * t * nums[4],
            q * q * nums[1] + 2 * q * t * nums[3] + t * t * nums[5],
          ),
        );
    }
    if (p.length) group.add(line(p, 0x55694b));
  }
  [...art.leaves, ...art.flowers].forEach((leaf, i) => {
    const geometry = shapeGeometry(leaf.path ?? paths[leaf.kind]);
    const positions = geometry.attributes.position;
    const length = Math.hypot(leaf.tx - leaf.x, leaf.ty - leaf.y),
      dx = (leaf.tx - leaf.x) / length,
      dz = (leaf.ty - leaf.y) / length;
    const depth = Math.sin(i * 2.399) * c.ry * 0.55;
    for (let j = 0; j < positions.count; j++) {
      const x = positions.getX(j),
        y = positions.getY(j);
      const px = leaf.path ? x : leaf.x + dz * x * leaf.w + dx * y * length;
      const pz = leaf.path ? y : leaf.y - dx * x * leaf.w + dz * y * length;
      const py = leaf.path
        ? depth * Math.min(1, pz)
        : depth * Math.min(1, y * 2) + x * c.ry * 0.15;
      positions.setXYZ(j, ...growPoint(px, pz, py));
    }
    geometry.computeVertexNormals();
    const flower = i >= art.leaves.length;
    const mesh = new T.Mesh(
      geometry,
      material(
        flower
          ? leaf.color === "red"
            ? 0xb85659
            : 0xe5e8ce
          : i % 3 === 0
            ? 0x728b59
            : 0x536e49,
        { metalness: 0, roughness: 0.95 },
      ),
    );
    group.add(mesh);
    if (!leaf.path) {
      group.add(
        line(
          [growPoint(leaf.x, leaf.y), growPoint(leaf.tx, leaf.ty, depth)],
          leaf.pattern ? 0xc6ce88 : 0x94a878,
          0.75,
        ),
      );
    }
  });
  const radius = Math.max(0.06, Math.min(0.24, c.rx * 0.44));
  const pot = new T.Mesh(
    new T.CylinderGeometry(radius, radius * 0.78, c.potHeight, 40),
    material(0xa1927e),
  );
  pot.rotation.x = Math.PI / 2;
  pot.position.set(c.soil[0], c.soil[1], c.potHeight / 2);
  group.add(pot);
  const soil = new T.Mesh(
    new T.CircleGeometry(radius * 0.94, 40),
    material(0x4c453a),
  );
  soil.position.set(c.soil[0], c.soil[1], c.potHeight + 0.001);
  group.add(soil);
}

export function createLuminaireView(host) {
  const scene = new T.Scene();
  scene.background = new T.Color(0x202420);
  const camera = new T.PerspectiveCamera(38, 1, 0.005, 100);
  camera.up.set(0, 0, 1);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "3D-модель светильника и растения. Для вращения перетаскивайте сцену.",
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 0.08;
  controls.maxDistance = 15;
  scene.add(new T.HemisphereLight(0xffffff, 0x69705f, 2.1));
  const key = new T.DirectionalLight(0xffffff, 3);
  key.position.set(2, -3, 4);
  scene.add(key);
  const grid = new T.GridHelper(6, 30, 0x50594f, 0x30382f);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.003;
  scene.add(grid);
  const modelGroup = new T.Group(),
    plantGroup = new T.Group(),
    sourceGroup = new T.Group(),
    opticGroup = new T.Group(),
    rayGroup = new T.Group(),
    heatGroup = new T.Group();
  scene.add(
    modelGroup,
    plantGroup,
    sourceGroup,
    opticGroup,
    rayGroup,
    heatGroup,
  );
  let currentScene,
    lastModel = "",
    viewMode = "plant";
  const draw = () => renderer.render(scene, camera);
  controls.addEventListener("change", draw);
  new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  }).observe(host);
  function fit(close = false, front = false) {
    if (!currentScene) return;
    const bounds = new T.Box3()
      .setFromObject(modelGroup)
      .union(new T.Box3().setFromObject(plantGroup));
    let center = bounds.getCenter(new T.Vector3()),
      size = Math.max(...bounds.getSize(new T.Vector3()).toArray());
    if (close) {
      center = vector(currentScene.sources[0].p);
      size =
        currentScene.model.optic === "flex" ||
        currentScene.model.optic === "trough"
          ? 0.9
          : 0.35;
    }
    size = Math.max(0.2, size);
    controls.target.copy(center);
    camera.position
      .copy(center)
      .add(
        new T.Vector3(
          front ? 0 : size * 0.85,
          -size * 1.75,
          front ? size * 0.05 : size * 0.8,
        ),
      );
    controls.update();
    draw();
  }
  function update(state, pose, geometry) {
    currentScene = geometry;
    for (const group of [
      modelGroup,
      plantGroup,
      sourceGroup,
      opticGroup,
      rayGroup,
      heatGroup,
    ])
      dispose(group);
    const enlarged = ["large", "pendantPanel"].includes(state.mount);
    for (const m of pose.meshes) {
      if (/light_output_placeholder/i.test(m.name)) continue;
      if (state.model === "G2" && /Reflector_(back|surface)/.test(m.name))
        continue;
      if (
        enlarged &&
        /Light_module_shell|Removable_top_cover|Yoke_side|Passive_suspension_crossbar/.test(
          m.name,
        )
      )
        continue;
      const g = new T.BufferGeometry();
      g.setAttribute(
        "position",
        new T.Float32BufferAttribute(
          m.v.map((v) => v / 10000),
          3,
        ),
      );
      g.setIndex(m.t);
      g.computeVertexNormals();
      const mesh = new T.Mesh(
        g,
        material(
          new T.Color(...m.color.slice(0, 3)),
          m.color[3] < 1 ? { transparent: true, opacity: 0.4 } : {},
        ),
      );
      mesh.position.z = geometry.zShift;
      modelGroup.add(mesh);
    }
    geometry.sources.forEach((s) => {
      const group = new T.Group();
      group.position.copy(vector(s.p));
      group.rotation.y = (s.tilt * Math.PI) / 180;
      if (geometry.mount.type === "bulb") {
        const length =
          (geometry.source.size[2] ?? geometry.source.drawHeight) / 1000;
        const r = s.w / 2;
        const profile =
          state.source === "eraE27_25"
            ? [
                [0, 0],
                [r * 0.55, length * 0.04],
                [r * 0.92, length * 0.13],
                [r, length * 0.27],
                [r * 0.95, length * 0.42],
                [r * 0.65, length * 0.61],
                [0.014, length * 0.8],
                [0.014, length],
              ]
            : [
                [0, 0],
                [r, 0],
                [r, length * 0.15],
                [r * 0.92, length * 0.55],
                [0.018, length * 0.8],
                [0.014, length],
              ];
        const bulb = new T.Mesh(
          new T.LatheGeometry(
            profile.map((p) => new T.Vector2(...p)),
            48,
          ),
          material(0xe2e0d3),
        );
        bulb.rotation.x = Math.PI / 2;
        group.add(bulb);
        const socket = new T.Mesh(
          new T.CylinderGeometry(0.019, 0.019, 0.045, 24),
          material(0x72766b),
        );
        socket.rotation.x = Math.PI / 2;
        socket.position.z = length + 0.0225;
        group.add(socket);
      } else if (enlarged) {
        const [w, d, h] = geometry.mount.body.map((x) => x / 1000),
          mat = material(0x858f7a);
        box(group, [w, d, 0.004], [0, 0, h], mat);
        for (const x of [-1, 1])
          box(group, [0.004, d, h], [x * (w / 2 - 0.002), 0, h / 2], mat);
        for (const y of [-1, 1])
          box(group, [w, 0.004, h], [0, y * (d / 2 - 0.002), h / 2], mat);
        // Thin, open external yoke for the proposed larger head.
        for (const x of [-1, 1])
          group.add(
            line(
              [
                [x * (w / 2 + 0.01), 0, 0],
                [x * (w / 2 + 0.01), 0, 0.07],
                [0, 0, 0.09],
              ],
              0xa9b1a0,
            ),
          );
      }
      const face = new T.Mesh(
        s.disc
          ? new T.CircleGeometry(s.w / 2, 40)
          : new T.PlaneGeometry(s.w, s.d),
        material(0xe4e6b7, { emissive: 0xbbb96b, emissiveIntensity: 0.3 }),
      );
      face.position.z = -0.001;
      group.add(face);
      if (!s.disc) {
        const cols =
            state.source === "compact21" ? 7 : state.source === "mf36" ? 6 : 7,
          rows =
            state.source === "compact21" ? 3 : state.source === "mf36" ? 4 : 7;
        const ledMat = new T.MeshBasicMaterial({ color: 0xf9f4ce });
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < rows; j++)
            box(
              group,
              [0.0028, 0.0028, 0.0006],
              [
                ((i + 0.5) / cols) * s.w - s.w / 2,
                ((j + 0.5) / rows) * s.d - s.d / 2,
                -0.0016,
              ],
              ledMat,
            );
        if (state.source === "mf36")
          box(
            group,
            [0.004, 0.004, 0.001],
            [0, 0, -0.002],
            new T.MeshBasicMaterial({ color: 0xeb574e }),
          );
      }
      sourceGroup.add(group);
    });
    const positions = [];
    for (const q of geometry.surfaces)
      positions.push(...q.a, ...q.b, ...q.c, ...q.a, ...q.c, ...q.d);
    if (positions.length) {
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      g.computeVertexNormals();
      opticGroup.add(
        new T.Mesh(
          g,
          material(state.material === "absorb" ? 0x414640 : 0xb6bcb1, {
            metalness: state.material === "mirror" ? 0.8 : 0.05,
            roughness: state.material === "mirror" ? 0.2 : 0.95,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          }),
        ),
      );
      if (geometry.model.optic === "flex") {
        for (const side of [0, 1]) {
          const q = geometry.surfaces[side * 40 + 39];
          opticGroup.add(line([q.c, q.d], 0x8e9c80));
          for (const x of [-0.376, 0.376])
            opticGroup.add(
              line(
                [
                  [x, side ? 0.012 : -0.012, geometry.zShift + 0.01],
                  [x, q.d[1], q.d[2]],
                ],
                0x9ea695,
              ),
            );
        }
      }
    }
    plant(plantGroup, geometry.crown, state.plant, state.plantSize);
    host.dataset.plant = state.plant;
    host.dataset.model = state.model;
    host.dataset.source = state.source;
    host.dataset.leafCount = plantIllustration(
      state.plant,
      state.plantSize,
    ).leaves.length;
    if (lastModel !== state.model) {
      lastModel = state.model;
      fit();
    } else draw();
  }
  function light(state, result) {
    dispose(rayGroup);
    dispose(heatGroup);
    for (const ray of result.rays)
      rayGroup.add(
        line(
          ray.points,
          ray.kind === "target"
            ? 0x97c79d
            : ray.kind === "room"
              ? 0xcbaf77
              : 0x989e95,
          0.27,
        ),
      );
    const positions = [],
      col = [];
    for (const [index, bin] of result.bins.entries()) {
      const row = Math.floor(index / result.na),
        column = index % result.na;
      const corners = [
        [row, column],
        [row + 1, column],
        [row + 1, column + 1],
        [row, column + 1],
      ].map(
        ([i, j]) =>
          surfacePoint(
            currentScene.crown,
            -1 + (2 * i) / result.nz,
            (2 * Math.PI * j) / result.na,
          ).p,
      );
      const k = plantModel.classify(
          plantModel.dli(bin.ppfd, state.hours),
          plantModel.plants[state.plant].group,
        ),
        c = new T.Color(colors[k]);
      for (const corner of [0, 1, 2, 0, 2, 3]) {
        positions.push(...corners[corner]);
        col.push(...c.toArray());
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    heatGroup.add(
      new T.Mesh(
        g,
        new T.MeshBasicMaterial({
          vertexColors: true,
          side: T.DoubleSide,
        }),
      ),
    );
    setMode(viewMode);
  }
  function setMode(mode) {
    viewMode = mode;
    heatGroup.visible = mode === "map";
    plantGroup.visible = mode !== "map";
    rayGroup.visible = mode === "rays";
    draw();
  }
  return { update, light, fit, setMode };
}
