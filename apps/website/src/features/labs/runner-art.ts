import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TRAIL, jumpHeight, type TrailState, type TrailKind } from "./runner-engine";

export type TrailView = { render: (state: TrailState, moving: boolean, calm: boolean, shake: boolean, dt: number) => void; dispose: () => void };
/** Original articulated explorer + fictional landscape. No downloaded art or cultural authenticity claims. */
export function createTrailView(canvas: HTMLCanvasElement): TrailView {
  const narrow = matchMedia("(max-width: 700px)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const gl = renderer.getContext(), debug = gl.getExtension("WEBGL_debug_renderer_info");
  const software = debug ? /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))) : false;
  const maximumRatio = software ? .85 : narrow ? 1.25 : 1.75;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maximumRatio));
  renderer.shadowMap.enabled = !narrow && !software; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#bcdcf4");
  scene.fog = new THREE.Fog("#bcdcf4", 34, 105);
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 160);
  camera.position.set(0, 4, 8);
  scene.add(new THREE.HemisphereLight("#d9edff", "#77624f", 2.3));
  const sun = new THREE.DirectionalLight("#ffefce", 3.1); sun.position.set(-12, 24, 8);
  sun.castShadow = !narrow && !software; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .1, far: 60 });
  sun.shadow.bias = -.001; scene.add(sun);
  const materials: THREE.Material[] = [], geometries: THREE.BufferGeometry[] = [];
  const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .87, ...extra }); materials.push(m); return m;
  };
  const geometry = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const ball = geometry(new THREE.SphereGeometry(1, 12, 8));
  const rockGeo = geometry(new THREE.DodecahedronGeometry(1, 0));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  const capsule = geometry(new THREE.CapsuleGeometry(.12, .25, 4, 8));
  const cream = material("#e2c7a6"), stone = material("#c4b7a1"), stoneDark = material("#8195a1");
  const blue = material("#246aca"), deep = material("#183f73"), cyan = material("#73d7f6");
  const skin = material("#925a3b"), hair = material("#242735"), trousers = material("#293f58");
  const shoe = material("#f2f4ed"), wood = material("#846249"), leaf = material("#558e8a");
  const lightLeaf = material("#78afa0"), sparkMat = material("#9aedff", { emissive: "#44b8ff", emissiveIntensity: 1.2, metalness: .35, roughness: .3 });
  function mesh(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, xyz: number[], scale: number[], shadow = false) {
    const o = new THREE.Mesh(g, m); o.position.set(xyz[0], xyz[1], xyz[2]); o.scale.set(scale[0], scale[1], scale[2]);
    o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
  }
  // Batch static crafted surfaces by material. Recycled segments need only a few draw calls.
  function bake(group: THREE.Group) {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of group.children) {
      const m = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      m.updateMatrix();
      // Primitive meshes mix indexed and unindexed geometry. Normalize before batching.
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      const list = batches.get(m.material) ?? []; list.push(g); batches.set(m.material, list);
    }
    group.clear();
    for (const [mat, list] of batches) {
      const merged = mergeGeometries(list); list.forEach(g => g.dispose());
      if (merged) mesh(group, geometry(merged), mat, [0, 0, 0], [1, 1, 1]);
    }
  }
  const ground = mesh(scene, box, leaf, [0, -.4, -48], [240, .5, 220]);
  ground.receiveShadow = true;
  const segments: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group(); scene.add(g); segments.push(g);
    mesh(g, box, cream, [0, -.15, -8], [7.6, .22, 16]);
    for (const side of [-1, 1]) {
      mesh(g, box, stoneDark, [side * 3.9, .02, -8], [.24, .25, 16]);
      for (let j = 0; j < 8; j++) {
        mesh(g, box, j % 3 === 0 ? stoneDark : stone, [side * 4.15, .08, -j * 2 - .8], [.55, .35, 1.8]);
        const pebble = mesh(g, rockGeo, stone, [side * (3.35 - j % 3 * .15), .015, -j * 2 - .5], [.09, .05, .16]);
        pebble.rotation.y = j;
      }
    }
    // Understated lane inlays, crafted paving and ground texture.
    for (const x of [-1.1, 1.1]) for (let j = 0; j < 4; j++) mesh(g, box, stone, [x, -.026, -j * 4], [.045, .015, 1.15]);
    for (let j = 0; j < 8; j++) {
      const p = mesh(g, rockGeo, stone, [Math.sin(i * 17 + j * 9) * 3.1, -.02, -j * 2], [.16, .035, .22]);
      p.rotation.y = j * 2;
    }
    bake(g);
  }
  const scenery: { group: THREE.Group; offset: number }[] = [];
  for (let i = 0; i < (narrow ? 14 : 22); i++) {
    const g = new THREE.Group(); scene.add(g);
    const side = i % 2 ? 1 : -1; g.position.x = side * (6.2 + i % 3 * 2.7);
    scenery.push({ group: g, offset: i * 7.2 });
    if (i % 4 === 0) {
      // Contemporary fictional earthen courtyard, blue door and shade awning.
      mesh(g, box, cream, [0, 1.1, 0], [3.6, 2.2, 3]);
      mesh(g, box, stone, [0, 2.3, 0], [3.85, .22, 3.2]);
      mesh(g, box, deep, [-side * 1.83, .7, .3], [.05, 1.4, .8]);
      mesh(g, box, blue, [0, 2, 1.65], [3.2, .08, 1.1]);
      for (const x of [-1.45, 1.45]) mesh(g, cylinder, wood, [x, 1, 2], [.06, 2, .06]);
      mesh(g, cylinder, stone, [-side * 2.2, .35, -.9], [.35, .7, .35]);
    } else {
      const height = 2.8 + i % 3 * .55;
      mesh(g, cylinder, wood, [0, height / 2, 0], [.17, height, .17]);
      const crown = mesh(g, rockGeo, i % 2 ? leaf : lightLeaf, [0, height + .4, 0], [1.7, .95, 1.5]);
      crown.rotation.y = i;
      mesh(g, rockGeo, leaf, [-.9, height - .1, .3], [1.1, .7, 1]);
      for (let j = 0; j < 2; j++) mesh(g, rockGeo, lightLeaf, [side * j, .2, 1 + j], [.65, .4, .6]);
    }
    bake(g);
  }
  for (let i = 0; i < 8; i++) {
    const hill = mesh(scene, rockGeo, i % 2 ? stoneDark : leaf, [(i - 3.5) * 22, 3, -90 - i % 3 * 12], [22, 10 + i % 4 * 3, 14]);
    hill.rotation.y = i;
  }
  const sunDisk = mesh(scene, ball, material("#fff1b6", { emissive: "#ffe9a8", emissiveIntensity: .7 }), [-24, 25, -84], [4, 4, 4]);
  sunDisk.castShadow = false;
  const landmark = new THREE.Group(); scene.add(landmark);
  for (const side of [-1, 1]) {
    mesh(landmark, box, stone, [side * 4, 2.3, 0], [1, 4.6, 1]);
    mesh(landmark, box, deep, [side * 4, 3.5, .53], [.5, 1.5, .07]);
    mesh(landmark, ball, sparkMat, [side * 4, 4.85, 0], [.28, .28, .28]);
  }
  mesh(landmark, box, blue, [0, 4.7, 0], [9, .3, 1.2]);
  mesh(landmark, box, cyan, [0, 4.48, .63], [7.6, .08, .06]);
  const previousLandmark = landmark.clone(true); scene.add(previousLandmark);
  // Original character with shoulder/elbow, hip/knee pivots and readable shoes.
  const player = new THREE.Group(), body = new THREE.Group(); scene.add(player); player.add(body);
  mesh(body, ball, blue, [0, 1.35, 0], [.34, .44, .21], true);
  mesh(body, ball, trousers, [0, .95, 0], [.27, .2, .2], true);
  mesh(body, cylinder, skin, [0, 1.83, 0], [.11, .18, .11]);
  mesh(body, ball, skin, [0, 2.05, -.015], [.21, .26, .2], true);
  mesh(body, ball, hair, [0, 2.2, .02], [.22, .15, .2], true);
  mesh(body, ball, deep, [0, 1.35, .25], [.24, .31, .13], true); // practical backpack
  mesh(body, box, cyan, [0, 1.4, .386], [.32, .055, .012]);
  for (const x of [-.22, .22]) mesh(body, box, cyan, [x, 1.47, .19], [.045, .54, .07]);
  function limb(x: number, y: number, upperLength: number, lowerLength: number, m: THREE.Material, leg: boolean) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); body.add(pivot);
    mesh(pivot, capsule, m, [0, -upperLength / 2, 0], [leg ? 1.1 : .85, upperLength / .49, leg ? 1.1 : .85], true);
    const joint = new THREE.Group(); joint.position.y = -upperLength; pivot.add(joint);
    mesh(joint, capsule, leg ? trousers : skin, [0, -lowerLength / 2, 0], [leg ? .95 : .7, lowerLength / .49, leg ? .95 : .7], true);
    const foot = leg ? new THREE.Group() : null;
    if (foot) {
      foot.position.y = -lowerLength; joint.add(foot);
      mesh(foot, ball, shoe, [0, .035, -.1], [.14, .085, .25], true);
      mesh(foot, box, deep, [0, -.01, -.1], [.25, .03, .4]);
    } else mesh(joint, ball, skin, [0, -lowerLength, 0], [.09, .115, .08], true);
    return { pivot, joint, foot };
  }
  const leftLeg = limb(-.16, .95, .43, .43, trousers, true), rightLeg = limb(.16, .95, .43, .43, trousers, true);
  const leftArm = limb(-.37, 1.67, .32, .32, blue, false), rightArm = limb(.37, 1.67, .32, .32, blue, false);
  const shadowMat = new THREE.MeshBasicMaterial({ color: "#233650", transparent: true, opacity: .23, depthWrite: false });
  materials.push(shadowMat);
  const shadow = mesh(scene, geometry(new THREE.CircleGeometry(.58, 24)), shadowMat, [0, .002, 0], [1, .6, 1]);
  shadow.rotation.x = -Math.PI / 2;
  function obstacle(kind: TrailKind) {
    const g = new THREE.Group(); scene.add(g); g.visible = false;
    if (kind === "spark") {
      mesh(g, geometry(new THREE.OctahedronGeometry(.23)), sparkMat, [0, 1.05, 0], [1, 1.5, 1]);
      const ring = mesh(g, geometry(new THREE.TorusGeometry(.35, .015, 4, 16)), cyan, [0, 1.05, 0], [1, 1, 1]); ring.rotation.y = .3;
    } else if (kind === "rock") mesh(g, rockGeo, stoneDark, [0, TRAIL.rockHeight / 2, 0], [.84, TRAIL.rockHeight / 1.86, .75], true);
    else if (kind === "log") {
      const log = mesh(g, cylinder, wood, [0, TRAIL.logHeight / 2, 0], [TRAIL.logHeight / 2, 1.8, TRAIL.logHeight / 2], true); log.rotation.z = Math.PI / 2;
      mesh(g, box, cyan, [0, .77, 0], [1.6, .05, .14]);
    } else {
      for (const side of [-1, 1]) mesh(g, cylinder, wood, [side * .88, 1.05, 0], [.075, 2.1, .075], true);
      mesh(g, box, blue, [0, TRAIL.canopyBottom + .175, 0], [1.9, .35, .8], true);
      mesh(g, box, cyan, [0, 1.54, .42], [1.8, .08, .05]);
    }
    return g;
  }
  const pools: Record<TrailKind, THREE.Group[]> = { rock: [], log: [], canopy: [], spark: [] };
  for (const kind of ["rock", "log", "canopy", "spark"] as TrailKind[]) for (let i = 0; i < (kind === "spark" ? 18 : 6); i++) pools[kind].push(obstacle(kind));
  const pooledObjects = Object.values(pools).flat();
  const dustMat = new THREE.MeshBasicMaterial({ color: "#d8c4a8", transparent: true, opacity: .25, depthWrite: false }); materials.push(dustMat);
  const dust = Array.from({ length: 10 }, () => mesh(scene, ball, dustMat, [0, 0, 0], [.05, .05, .05]));
  let width = 0, height = 0, blend = 0, slideBlend = 0, lastEvent = -1, burst = 0;
  let slowFrames = 0, qualityReduced = software;
  const target = new THREE.Vector3(), look = new THREE.Vector3();
  function render(s: TrailState, moving: boolean, calm: boolean, shake: boolean, dt: number) {
    if (moving && dt > .034) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 45 && !qualityReduced) {
      qualityReduced = true; renderer.shadowMap.enabled = false;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
    }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (width !== w || height !== h) {
      width = w; height = h; renderer.setSize(w, h, false); camera.aspect = w / h;
      camera.fov = w / h < .8 ? 68 : 55; camera.updateProjectionMatrix();
    }
    const smoothing = 1 - Math.exp(-10 * Math.min(dt, .05));
    blend += ((moving ? 1 : 0) - blend) * smoothing;
    slideBlend += ((s.slide > 0 ? 1 : 0) - slideBlend) * smoothing * 1.6;
    const phase = s.totalDistance * 2.7, stride = blend * (1 - slideBlend), gait = Math.sin(phase) * .78 * stride;
    leftLeg.pivot.rotation.x = gait; rightLeg.pivot.rotation.x = -gait;
    leftLeg.joint.rotation.x = -Math.max(0, -Math.sin(phase)) * 1.15 * stride;
    rightLeg.joint.rotation.x = -Math.max(0, Math.sin(phase)) * 1.15 * stride;
    leftArm.pivot.rotation.x = -gait * .85; rightArm.pivot.rotation.x = gait * .85;
    leftArm.joint.rotation.x = -1; rightArm.joint.rotation.x = -1;
    if (s.jump > 0) {
      leftLeg.pivot.rotation.x = -.65; rightLeg.pivot.rotation.x = .35;
      leftLeg.joint.rotation.x = -.9; rightLeg.joint.rotation.x = -.4;
      leftArm.pivot.rotation.x = -.9; rightArm.pivot.rotation.x = -.9;
    }
    body.rotation.x = -.12 * blend - slideBlend * .81;
    leftLeg.pivot.rotation.x += slideBlend * 1.25; rightLeg.pivot.rotation.x += slideBlend * 1.25;
    leftLeg.joint.rotation.x -= slideBlend * 1.6; rightLeg.joint.rotation.x -= slideBlend * 1.6;
    if (s.status === "crashed") { body.rotation.x = -.5; leftArm.pivot.rotation.x = -.7; rightArm.pivot.rotation.x = -.7; }
    // Ankle compensation keeps the contact foot planted while the other leg swings.
    const ankle = (leg: typeof leftLeg) => .95 * Math.cos(body.rotation.x)
      - .43 * Math.cos(body.rotation.x + leg.pivot.rotation.x)
      - .43 * Math.cos(body.rotation.x + leg.pivot.rotation.x + leg.joint.rotation.x);
    body.position.y = .05 - Math.min(ankle(leftLeg), ankle(rightLeg));
    for (const leg of [leftLeg, rightLeg]) if (leg.foot)
      leg.foot.rotation.x = -(body.rotation.x + leg.pivot.rotation.x + leg.joint.rotation.x);
    const lean = ((s.lane - 1) * TRAIL.laneWidth - s.x) * -.11;
    player.position.set(s.x, jumpHeight(s), 0); body.rotation.z = lean;
    if (s.invincible > 0) body.rotation.z += Math.sin(s.invincible * 16) * .1;
    shadow.position.x = s.x; shadow.scale.setScalar(1 - jumpHeight(s) * .12);
    segments.forEach((g, i) => { g.position.z = -i * 16 + s.totalDistance % 16 + 12; });
    scenery.forEach(({ group, offset }) => { group.position.z = -((offset - s.totalDistance % 158 + 158) % 158) + 10; });
    landmark.position.z = -(TRAIL.checkpointMetres - s.distance); landmark.visible = landmark.position.z > -100;
    previousLandmark.visible = s.section > 1 && s.distance < 16;
    previousLandmark.position.z = s.distance;
    const used = { rock: 0, log: 0, canopy: 0, spark: 0 };
    pooledObjects.forEach(g => { g.visible = false; });
    s.items.forEach(item => {
      if (item.hit && item.kind === "spark") return;
      const g = pools[item.kind][used[item.kind]++]; if (!g) return;
      g.visible = true; g.position.set((item.lane - 1) * TRAIL.laneWidth, 0, -item.z);
      if (item.kind === "spark") g.rotation.y = s.elapsed * 2 + item.id;
    });
    if (s.eventId !== lastEvent) { if (s.event === "pickup") burst = 1; lastEvent = s.eventId; }
    burst = Math.max(0, burst - dt * 2);
    dust.forEach((o, i) => {
      o.visible = moving && !calm && s.jump === 0;
      const life = (s.elapsed * 3 + i / 10) % 1;
      o.position.set(s.x + Math.sin(i * 8) * life * .55, .08 + life * .35, .3 + life * 1.8);
      o.scale.setScalar(.04 + life * .06 + burst * .04);
    });
    target.set(calm ? 0 : s.x * .22, 3.6 + (calm ? 0 : jumpHeight(s) * .16), width / height < .8 ? 7.8 : 7);
    if (shake && !calm && s.invincible > 1.3) target.x += Math.sin(s.invincible * 45) * .07;
    camera.position.lerp(target, 1 - Math.exp(-5 * Math.min(dt, .05)));
    look.set(calm ? 0 : s.x * .1, 1.25, -11); camera.lookAt(look);
    renderer.render(scene, camera);
  }
  return { render, dispose() {
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    // React StrictMode remounts effects on the same canvas in development.
    // Forcing context loss here would invalidate that immediate remount.
    renderer.dispose(); scene.clear();
    queueMicrotask(() => { if (!canvas.isConnected) renderer.forceContextLoss(); });
  } };
}
