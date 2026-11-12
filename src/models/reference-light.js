import { calculateLuminaire } from "./luminaire-light.js";
import { triangleArea } from "./leaf-geometry.js";

export const REFERENCE_RADIUS = 0.05;
export const REFERENCE_RAYS = 262144;

// An independent upward-facing detector, never added to the plant's budget.
export function referenceDetector(scene) {
  const center = [
    scene.crown.center[0],
    scene.crown.center[1],
    scene.crown.center[2] + scene.crown.rz,
  ];
  const point = (i) => [
    center[0] + REFERENCE_RADIUS * Math.cos((i * 2 * Math.PI) / 64),
    center[1] + REFERENCE_RADIUS * Math.sin((i * 2 * Math.PI) / 64),
    center[2],
  ];
  const triangles = Array.from({ length: 64 }, (_, i) => [
    center,
    point(i),
    point(i + 1),
  ]);
  const area = triangles.reduce((sum, t) => sum + triangleArea(...t), 0);
  return {
    center,
    radius: REFERENCE_RADIUS,
    area,
    leaves: [{ id: 0, area, patches: [0] }],
    patches: [{ id: 0, leaf: 0, area, triangles }],
    triangles: triangles.map((points) => ({ points, leaf: 0, patch: 0 })),
  };
}

export function calculateReferenceLight(
  state,
  scene,
  rayCount = REFERENCE_RAYS,
) {
  const detector = referenceDetector(scene);
  const result = calculateLuminaire(
    { ...state, receiver: "leaves" },
    { ...scene, leafGeometry: detector },
    rayCount,
  );
  // Only the upward face: illumination of the back is not a top reading.
  const top = result.leaves[0].sides[0];
  return {
    center: detector.center,
    radius: detector.radius,
    area: detector.area,
    mean: top.mean,
    range: top.range,
    hits: top.hits,
    lowSample: top.hits < 100,
    rayCount,
  };
}
