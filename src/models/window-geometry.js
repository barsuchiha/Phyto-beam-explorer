// Shared aperture geometry for the room, drawing and daylight transport (metres).
export const WINDOW = {
  x: [-0.4, 1],
  y: 1.15,
  z: [0.7, 2.3],
  reference: [0.3, 0.65, 1.5],
};
export const WINDOW_CLEARANCE = 0.05;
export function windowAtY(y) {
  return { ...WINDOW, y, reference: [0.3, y - 0.5, 1.5] };
}
export function placeWindow(state, leafGeometry, surfaces = []) {
  const edge =
    leafGeometry.bounds?.max[1] ??
    Math.max(
      ...leafGeometry.triangles.flatMap((t) => t.points.map((p) => p[1])),
    );
  const requested =
    state.windowDistance == null
      ? Math.max(WINDOW_CLEARANCE, WINDOW.y - edge)
      : Math.max(WINDOW_CLEARANCE, state.windowDistance / 100);
  const fixtureBack = Math.max(
    -Infinity,
    ...surfaces.flatMap((s) => [s.a, s.b, s.c, s.d].map((p) => p[1])),
  );
  // Turning the pot pins the existing wall; touching the distance control
  // again restores placement relative to the current edge of the plant.
  const target = state.windowWallY ?? edge + requested;
  const y = Math.max(target, fixtureBack + WINDOW_CLEARANCE);
  return {
    ...windowAtY(y),
    plantEdge: edge,
    gap: y - edge,
    limitedByFixture: y > target + 1e-8,
  };
}
