import { buildLuminaireScene } from "./models/luminaire-scene.js";
import { calculateLuminaire } from "./models/luminaire-light.js";
import { calculateReferenceLight } from "./models/reference-light.js";

// A new worker replaces an obsolete request, so dragging never queues stale
// multi-second calculations. CAD and controls remain on the main thread.
self.onmessage = ({ data: { state, pose, rayCount, referenceRayCount } }) => {
  try {
    const scene = buildLuminaireScene(state, pose);
    self.postMessage({
      result: calculateLuminaire(state, scene, rayCount),
      reference: calculateReferenceLight(state, scene, referenceRayCount),
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
