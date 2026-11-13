import * as T from "../vendor/three.module.min.js";
import { miniFermerBody } from "./bulb-mesh.js";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { plantIllustration } from "../models/plant-illustration.js";
import { add, mul } from "../models/crown.js";
import { referenceDetector } from "../models/reference-light.js";
import { populateOlive } from "./olive-view.js";
import { ppfdMapColor } from "../models/light-readout.js";
import { populateRoom, populateRoomLight } from "./room-view.js";
import { populateRayLight } from "./ray-view.js";
import { populateWindow } from "./window-view.js";
import { visibleFixtureMesh } from "../models/lamp-placement.js";
import { leafColor } from "./leaf-appearance.js";

const vector = (p) => new T.Vector3(...p);
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
    if (o.isInstancedMesh) o.dispose();
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materials) {
      m?.map?.dispose();
      m?.dispose();
    }
  });
  group.clear();
}
function box(group, size, position, mat) {
  const m = new T.Mesh(new T.BoxGeometry(...size), mat);
  m.position.copy(vector(position));
  group.add(m);
  return m;
}
function leafMeshGeometry(triangles) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(triangles.flat(2), 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}
export function populatePlant(group, c, id, height, leafGeometry) {
  for (const body of leafGeometry.bodies ?? []) {
    let mesh;
    if (body.kind === "ellipsoid") {
      mesh = new T.Mesh(new T.SphereGeometry(1, 24, 16), material(0x93846a));
      mesh.position.copy(vector(body.center));
      mesh.scale.set(...body.radii);
    } else {
      const a = vector(body.a),
        b = vector(body.b),
        d = b.clone().sub(a);
      mesh = new T.Mesh(
        new T.CylinderGeometry(body.top, body.bottom, d.length(), 24),
        material(0x8b7c64),
      );
      mesh.position.copy(a.add(b).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    }
    group.add(mesh);
  }
  for (const stem of leafGeometry.stems) group.add(line(stem.points, 0x55694b));
  for (const leaf of leafGeometry.leaves) {
    const geometry = leafMeshGeometry(
      leaf.patches.flatMap((id) => leafGeometry.patches[id].triangles),
    );
    const patterned = leafColor(leaf.pattern, 0, 0, leaf.id) !== null;
    if (patterned) {
      const colors = leaf.patches
        .flatMap((id) => leafGeometry.patches[id].uvs)
        .flat()
        .flatMap(([x, y]) =>
          new T.Color(leafColor(leaf.pattern, x, y, leaf.id)).toArray(),
        );
      geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    }
    const mesh = new T.Mesh(
      geometry,
      material(patterned ? 0xffffff : leaf.id % 3 === 0 ? 0x728b59 : 0x536e49, {
        metalness: 0,
        roughness: 0.95,
        vertexColors: patterned,
      }),
    );
    mesh.userData.leaf = leaf.id;
    group.add(mesh);
    const vein = line(leaf.vein, leaf.pattern ? 0xc6ce88 : 0x94a878, 0.75);
    vein.userData.leaf = leaf.id;
    group.add(vein);
  }
  for (const flower of leafGeometry.decorations)
    group.add(
      new T.Mesh(
        leafMeshGeometry(flower.triangles),
        material(flower.color === "red" ? 0xb85659 : 0xe5e8ce),
      ),
    );
  const radius = Math.max(0.06, Math.min(0.24, c.rx * 0.44));
  const potGroup = new T.Group();
  potGroup.position.set(c.soil[0], c.soil[1], 0);
  potGroup.rotation.z = ((c.turn ?? 0) * Math.PI) / 180;
  group.add(potGroup);
  const pot = new T.Mesh(
    new T.CylinderGeometry(radius, radius * 0.78, c.potHeight, 40),
    material(0xa1927e),
  );
  pot.rotation.x = Math.PI / 2;
  pot.position.z = c.potHeight / 2;
  potGroup.add(pot);
  const soil = new T.Mesh(
    new T.CircleGeometry(radius * 0.94, 40),
    material(0x4c453a),
  );
  soil.position.z = c.potHeight + 0.001;
  potGroup.add(soil);
  // Small mark makes rotation visible on an otherwise circular pot.
  potGroup.add(
    line(
      [0.62, 0.91].map((h) => [
        0,
        -radius * (0.78 + 0.22 * h) - 0.001,
        c.potHeight * h,
      ]),
      0xe9d8b7,
    ),
  );
}

export function createLuminaireView(host, onLeaf = () => {}) {
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
    "Угол комнаты: светильник, растение и кресло с кошкой. Для вращения перетаскивайте сцену.",
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 0.08;
  controls.maxDistance = 15;
  const ambient = new T.HemisphereLight(0xffffff, 0x69705f, 1.6);
  scene.add(ambient);
  const key = new T.DirectionalLight(0xffffff, 3);
  key.position.set(2, -3, 4);
  scene.add(key);
  const modelGroup = new T.Group(),
    plantGroup = new T.Group(),
    sourceGroup = new T.Group(),
    opticGroup = new T.Group(),
    rayGroup = new T.Group(),
    heatGroup = new T.Group();
  const windowGroup = new T.Group(),
    roomGroup = new T.Group(),
    roomLightGroup = new T.Group(),
    pathGroup = new T.Group(),
    warmGroup = new T.Group();
  const selectedGroup = new T.Group(),
    referenceGroup = new T.Group();
  referenceGroup.visible = false;
  scene.add(
    modelGroup,
    plantGroup,
    sourceGroup,
    opticGroup,
    rayGroup,
    heatGroup,
    selectedGroup,
    referenceGroup,
    roomGroup,
    windowGroup,
    roomLightGroup,
    pathGroup,
    warmGroup,
  );
  let currentResult,
    currentScene,
    lastModel = "",
    lastChair,
    lastWindowY,
    lastLampY,
    viewMode = "rays",
    showPaths = false;
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
      .union(new T.Box3().setFromObject(plantGroup))
      .union(new T.Box3().setFromObject(sourceGroup))
      .union(new T.Box3().setFromObject(opticGroup));
    if (!close)
      for (const child of roomGroup.children)
        if (["chair", "cat"].includes(child.userData.roomReceiver))
          bounds.union(new T.Box3().setFromObject(child));
    if (!close && windowGroup.children.length)
      bounds.union(new T.Box3().setFromObject(windowGroup));
    let center = bounds.getCenter(new T.Vector3()),
      size = Math.max(...bounds.getSize(new T.Vector3()).toArray());
    if (close) {
      center = vector(currentScene.sources[0].p);
      size =
        currentScene.model.optic === "flex" ||
        currentScene.model.optic === "trough"
          ? 0.9
          : 0.35;
      const screen = currentScene.screenDimensions;
      if (screen && currentScene.surfaces.length) {
        size = Math.max(size, screen.mouthRadius * 2.2, screen.depth + 0.2);
        center.add(
          vector(currentScene.sources[0].n).multiplyScalar(screen.depth / 2),
        );
      }
    }
    size = Math.max(0.2, size);
    controls.target.copy(center);
    const direction = new T.Vector3(
      front ? 0 : 0.65,
      -1.8,
      front ? 0.05 : 0.9,
    ).normalize();
    const right = new T.Vector3()
      .crossVectors(new T.Vector3(0, 0, 1), direction)
      .normalize();
    const up = new T.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(T.MathUtils.degToRad(camera.fov / 2)),
      tanH = tanV * camera.aspect;
    let distance = close ? size * 2.2 : 0;
    if (!close)
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const p = new T.Vector3(x, y, z).sub(center);
            distance = Math.max(
              distance,
              Math.abs(p.dot(right)) / tanH + p.dot(direction),
              Math.abs(p.dot(up)) / tanV + p.dot(direction),
            );
          }
    camera.position.copy(center).addScaledVector(direction, distance * 1.12);
    controls.update();
    draw();
  }
  function update(state, pose, geometry) {
    currentScene = geometry;
    currentResult = null;
    for (const group of [
      modelGroup,
      plantGroup,
      sourceGroup,
      opticGroup,
      rayGroup,
      heatGroup,
      selectedGroup,
      referenceGroup,
      roomGroup,
      roomLightGroup,
      pathGroup,
      warmGroup,
    ])
      dispose(group);
    if (geometry.room) populateRoom(roomGroup, geometry.room);
    daylight(state);
    const enlarged = ["large", "pendantPanel"].includes(state.mount);
    modelGroup.position.y = geometry.lampPlacement.y;
    if (geometry.olive) populateOlive(modelGroup, pose, geometry, state);
    for (const m of pose.meshes) {
      if (!visibleFixtureMesh(state, m)) continue;
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
      group.quaternion.setFromRotationMatrix(
        new T.Matrix4().makeBasis(
          vector(s.u),
          vector(s.v),
          vector(mul(s.n, -1)),
        ),
      );
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
        if (state.source.startsWith("mfE27_")) {
          bulb.geometry.dispose();
          bulb.material.dispose();
          group.add(miniFermerBody(r, length));
        } else group.add(bulb);
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
    for (const points of geometry.screenSupports)
      opticGroup.add(line(points, 0x9ea695));
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
                  [
                    x,
                    geometry.lampPlacement.y + (side ? 0.012 : -0.012),
                    geometry.zShift + 0.01,
                  ],
                  [x, q.d[1], q.d[2]],
                ],
                0x9ea695,
              ),
            );
        }
      }
    }
    populatePlant(
      plantGroup,
      geometry.crown,
      state.plant,
      state.plantSize,
      geometry.leafGeometry,
    );
    const detector = referenceDetector(geometry);
    const [cx, cy, cz] = detector.center,
      r = detector.radius;
    referenceGroup.add(
      line(
        Array.from({ length: 65 }, (_, i) => [
          cx + r * Math.cos((i * Math.PI) / 32),
          cy + r * Math.sin((i * Math.PI) / 32),
          cz,
        ]),
        0xf3efcd,
      ),
    );
    referenceGroup.add(
      line(
        [
          [cx - r / 2, cy, cz],
          [cx + r / 2, cy, cz],
        ],
        0xf3efcd,
      ),
    );
    referenceGroup.add(
      line(
        [
          [cx, cy - r / 2, cz],
          [cx, cy + r / 2, cz],
        ],
        0xf3efcd,
      ),
    );
    host.dataset.plant = state.plant;
    host.dataset.plantTurn = String(state.plantTurn ?? 0);
    host.dataset.model = state.model;
    host.dataset.source = state.source;
    host.dataset.leafCount = plantIllustration(
      state.plant,
      state.plantSize,
    ).leaves.length;
    host.dataset.referenceHeight = String(detector.center[2]);
    host.dataset.lampY = String(geometry.lampPlacement.y);
    host.dataset.lampGap = String(geometry.lampPlacement.gap);
    if (
      lastModel !== state.model ||
      lastChair !== state.chairOffset ||
      lastWindowY !== geometry.window.y ||
      lastLampY !== geometry.lampPlacement.y
    ) {
      lastModel = state.model;
      lastChair = state.chairOffset;
      lastWindowY = geometry.window.y;
      lastLampY = geometry.lampPlacement.y;
      fit();
    } else draw();
  }
  function light(state, result) {
    currentResult = result;
    dispose(rayGroup);
    dispose(heatGroup);
    dispose(roomLightGroup);
    dispose(pathGroup);
    dispose(warmGroup);
    populateRoomLight(roomLightGroup, result);
    populateRayLight(rayGroup, pathGroup, result.rays);
    const lightColor = (ppfd) => new T.Color(ppfdMapColor(ppfd));
    for (const leaf of currentScene.leafGeometry.leaves)
      for (const side of [0, 1]) {
        const positions = [],
          col = [],
          warmColors = [];
        for (const id of leaf.patches) {
          const patch = currentScene.leafGeometry.patches[id],
            bin = result.bins[id * 2 + side];
          const color = lightColor(bin.ppfd);
          for (const tri of patch.triangles)
            for (const p of tri) {
              positions.push(...p);
              col.push(...color.toArray());
              warmColors.push(
                ...new T.Color(1, 0.78, 0.42)
                  .multiplyScalar(0.65 * (1 - Math.exp(-bin.ppfd / 65)))
                  .toArray(),
              );
            }
        }
        const geometry = new T.BufferGeometry();
        geometry.setAttribute(
          "position",
          new T.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute("color", new T.Float32BufferAttribute(col, 3));
        const mesh = new T.Mesh(
          geometry,
          new T.MeshBasicMaterial({
            vertexColors: true,
            side: side === 0 ? T.FrontSide : T.BackSide,
          }),
        );
        mesh.userData.leaf = leaf.id;
        heatGroup.add(mesh);
        const warmGeometry = geometry.clone();
        warmGeometry.setAttribute(
          "color",
          new T.Float32BufferAttribute(warmColors, 3),
        );
        warmGroup.add(
          new T.Mesh(
            warmGeometry,
            new T.MeshBasicMaterial({
              vertexColors: true,
              side: side === 0 ? T.FrontSide : T.BackSide,
              transparent: true,
              depthWrite: false,
              blending: T.AdditiveBlending,
              polygonOffset: true,
              polygonOffsetFactor: -1,
            }),
          ),
        );
      }
    setMode(viewMode);
  }
  function setMode(mode) {
    viewMode = mode;
    heatGroup.visible = mode === "map";
    const leafMap = mode === "map" && Boolean(currentResult);
    plantGroup.visible = true;
    for (const child of plantGroup.children)
      if (child.userData.leaf !== undefined) child.visible = !leafMap;
    rayGroup.visible = mode === "rays";
    pathGroup.visible = mode === "rays" && showPaths;
    warmGroup.visible = mode === "rays";
    roomLightGroup.visible = mode === "rays";
    ambient.intensity = mode === "rays" ? 0.65 : 1.6;
    key.intensity = mode === "rays" ? 0.7 : 2;
    draw();
  }
  let pointerStart;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerStart = [event.clientX, event.clientY];
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (
      !pointerStart ||
      Math.hypot(
        event.clientX - pointerStart[0],
        event.clientY - pointerStart[1],
      ) > 6 ||
      !currentResult
    )
      return;
    const rect = renderer.domElement.getBoundingClientRect(),
      ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      camera,
    );
    const group = viewMode === "map" ? heatGroup : plantGroup;
    const hit = ray.intersectObjects(
      group.children.filter((m) => m.isMesh && m.userData.leaf !== undefined),
      false,
    )[0];
    if (
      hit &&
      !ray
        .intersectObjects(
          roomGroup.children.filter((m) => m.isMesh),
          false,
        )
        .some((r) => r.distance < hit.distance)
    )
      onLeaf(hit.object.userData.leaf);
  });
  function selectLeaf(id) {
    dispose(selectedGroup);
    const leaf = currentScene?.leafGeometry.leaves[id];
    if (!leaf) {
      draw();
      return;
    }
    const geometry = leafMeshGeometry(
      leaf.patches.flatMap(
        (k) => currentScene.leafGeometry.patches[k].triangles,
      ),
    );
    const edges = new T.EdgesGeometry(geometry, 20);
    geometry.dispose();
    selectedGroup.add(
      new T.LineSegments(edges, new T.LineBasicMaterial({ color: 0xfff4cf })),
    );
    draw();
  }
  function setReferenceVisible(visible) {
    referenceGroup.visible = visible;
    draw();
  }
  function setPaths(visible) {
    showPaths = visible;
    setMode(viewMode);
  }
  function daylight(state) {
    const hadWindow = windowGroup.children.length > 0;
    dispose(windowGroup);
    populateWindow(windowGroup, state, currentScene?.window);
    host.dataset.windowY = String(currentScene?.window.y ?? "");
    if (hadWindow !== windowGroup.children.length > 0 && currentResult) fit();
    else draw();
  }
  return {
    update,
    light,
    fit,
    setMode,
    selectLeaf,
    setReferenceVisible,
    setPaths,
    daylight,
  };
}
