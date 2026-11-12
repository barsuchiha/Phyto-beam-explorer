import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRoom,
  intersectRoomObject,
  roomLeafCollision,
} from "../src/models/room.js";
import {
  tracePath,
  triangles,
  calculateLuminaire,
} from "../src/models/luminaire-light.js";
import { buildLeafBVH } from "../src/models/leaf-bvh.js";
import { normalizeFitting } from "../src/models/fitting.js";
import { buildLuminaireScene, quad } from "../src/models/luminaire-scene.js";
import { cadAssets } from "../src/data/cad-assets.js";
const near = (a, b, e = 1e-10) =>
  assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("room first hits have bounded surfaces and analytical distances / normals", () => {
  const room = buildRoom();
  near(room.hit([0, 0, 1], [0, 0, -1]).distance, 1);
  assert.equal(room.hit([0, 0, 1], [0, 1, 0]).receiver, "walls");
  near(room.hit([0, 0, 1], [0, 1, 0]).distance, 1.15);
  assert.equal(room.hit([0, 0, 1], [0, -1, 0]).receiver, "escape");
  assert.equal(room.hit([0, 0, 1], [0, 0, -1], 0.5), null);
  const ellipsoid = {
    id: "test",
    receiver: "cat",
    type: "ellipsoid",
    center: [0, 0, 0],
    radius: [2, 1, 0.5],
  };
  const hit = intersectRoomObject(ellipsoid, [4, 0, 0], [-1, 0, 0]);
  near(hit.distance, 2);
  assert.deepEqual(hit.normal, [1, 0, 0]);
  near(intersectRoomObject(ellipsoid, [0, 0, 0], [0, 0, 1]).distance, 0.5);
  assert.equal(intersectRoomObject(ellipsoid, [4, 2, 0], [-1, 0, 0]), null);
});

test("cat occludes a receiver behind it; a closer leaf occludes the cat", () => {
  const room = buildRoom(),
    origin = [1.42, -1, 0.84],
    direction = [0, 1, 0];
  const receiver = (y) =>
    buildLeafBVH([
      {
        leaf: 0,
        patch: 0,
        points: [
          [1, y, 0.4],
          [2, y, 0.4],
          [1.5, y, 1.4],
        ],
      },
    ]);
  const geometry = {
    leafReceiver: true,
    leafBVH: receiver(0.6),
    triangles: [],
    room,
  };
  const hit = tracePath(geometry, origin, direction, "mirror", 0.9);
  assert.equal(hit.kind, "room");
  assert.equal(hit.roomHit.receiver, "cat");
  near(hit.point[1], 0.04 - 0.102);
  const leaf = tracePath(
    { ...geometry, leafBVH: receiver(-0.5) },
    origin,
    direction,
    "mirror",
    0.9,
  );
  assert.equal(leaf.kind, "target");
  near(leaf.point[1], -0.5);
});

test("screen reflection reaches the floor once and retains its weight", () => {
  const geometry = {
    leafReceiver: true,
    leafBVH: buildLeafBVH([]),
    room: buildRoom(),
    triangles: triangles([
      quad([-0.5, -0.5, 1], [0.5, -0.5, 1], [0.5, 0.5, 1], [-0.5, 0.5, 1]),
    ]),
  };
  const hit = tracePath(geometry, [0, 0, 0.5], [0, 0, 1], "mirror", 0.8);
  assert.equal(hit.kind, "room");
  assert.equal(hit.roomHit.receiver, "floor");
  assert.equal(hit.bounces, 1);
  near(hit.weight, 0.8);
  near(hit.absorbed, 0.2);
  near(hit.path.at(-1)[2], 0);
  assert.equal(hit.path.length, 3);
});

test("moving furniture preserves walls and prevents ambiguous intersecting leaves", () => {
  const a = buildRoom(1.6),
    b = buildRoom(2.4);
  assert.deepEqual(a.objects.slice(0, 6), b.objects.slice(0, 6));
  assert.equal(a.hit([1.42, -1, 0.84], [0, 1, 0]).receiver, "cat");
  assert.equal(b.hit([1.42, -1, 0.84], [0, 1, 0]).receiver, "walls");
  const leaf = {
    triangles: [
      {
        points: [
          [1.4, 0.02, 0.84],
          [1.42, 0.03, 0.84],
          [1.4, 0.02, 0.86],
        ],
      },
    ],
  };
  assert.equal(roomLeafCollision(a, leaf), "cat");
  assert.equal(roomLeafCollision(b, leaf), null);
  assert.equal(
    roomLeafCollision(a, {
      triangles: [
        {
          points: [
            [4, 0, 1],
            [4, 1, 1],
            [4, 0, 2],
          ],
        },
      ],
    }),
    "boundary",
  );
});

test("room categories partition spill, room transport conserves photons, dimming extinguishes the render", () => {
  const state = normalizeFitting({
    model: "olive",
    source: "compact21",
    plant: "lyrata",
    plantSize: 105,
    receiver: "leaves",
    dim: 100,
    towerTurn: 0,
    jointMiddle: 0,
    jointTop: 0,
  });
  const pose = JSON.parse(
    readFileSync(
      new URL("../data/cad/" + cadAssets.olive.file, import.meta.url),
    ),
  )[0];
  const scene = buildLuminaireScene(state, pose),
    result = calculateLuminaire(state, scene, 16384);
  assert.equal(scene.roomCollision, null);
  for (let k = 0; k < result.metrics.length; k++) {
    const b = result.metrics[k].budget;
    near(b.target + b.room + b.screen + b.housing + b.residual, 1);
    near(
      Object.values(result.room.fractions).reduce(
        (sum, values) => sum + values[k],
        0,
      ),
      b.room,
    );
  }
  assert.ok(result.room.hits.cat > 0 && result.room.hits.chair > 0);
  const finer = calculateLuminaire(state, scene, 32768);
  near(
    result.room.fractions.chair[result.middle],
    finer.room.fractions.chair[finer.middle],
    0.004,
  );
  near(
    result.room.fractions.cat[result.middle],
    finer.room.fractions.cat[finer.middle],
    0.001,
  );
  assert.equal(result.rays.length, 512);
  assert.ok(result.rays.some((r) => r.reflected));
  const represented = result.room.splats.reduce((sum, c) => sum + c.power, 0);
  near(
    represented,
    (result.metrics[result.middle].budget.room -
      result.room.fractions.escape[result.middle]) *
      result.output.fluxes[result.middle],
  );
  const off = calculateLuminaire({ ...state, dim: 0 }, scene, 1024);
  assert.ok(off.rays.every((r) => r.strength === 0));
  assert.ok(off.room.splats.every((r) => r.power === 0));
});
