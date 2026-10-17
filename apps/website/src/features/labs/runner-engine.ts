/** Simulation has no React, browser or rendering dependencies. All tuning lives here. */
export const TRAIL = Object.freeze({ checkpointMetres: 300, step: 1 / 120, maxDelta: .12,
  initialSpeed: 8, maximumSpeed: 10, practiceSpeed: 6, laneWidth: 2.2,
  jumpSeconds: 1.05, jumpHeight: 2.15, slideSeconds: 1.1, immunitySeconds: 1.6,
  spawnAhead: 44, firstSpawn: 18, waveMetres: 19, safeExit: 24, sectionScoreCap: 500,
  collisionZ: .55, laneHitRadius: .78, logClearance: .65, rockHeight: 2.6, logHeight: .76, canopyBottom: 1.54 });
export const SECTION_SECONDS = 30; // Minimum server eligibility; distance is the actual boundary.
export type TrailKind = "rock" | "log" | "canopy" | "spark";
export type TrailItem = { id: number; lane: number; z: number; kind: TrailKind; hit: boolean };
export type TrailState = { elapsed: number; distance: number; totalDistance: number; lane: number; x: number;
  jump: number; slide: number; lives: number; coins: number; invincible: number; nextSpawn: number;
  wave: number; section: number; speed: number; accumulator: number; practice: boolean;
  items: TrailItem[]; status: "running" | "crashed" | "checkpoint"; event: "" | "pickup" | "hit" | "land"; eventId: number };
export function newTrail(section = 1, practice = false): TrailState {
  return { elapsed: 0, distance: 0, totalDistance: (section - 1) * TRAIL.checkpointMetres,
    lane: 1, x: 0, jump: 0, slide: 0, lives: 3, coins: 0, invincible: 0,
    nextSpawn: TRAIL.firstSpawn, wave: 0, section, speed: practice ? TRAIL.practiceSpeed : TRAIL.initialSpeed,
    accumulator: 0, practice, items: [], status: "running", event: "", eventId: 0 };
}
export function nextTrail(state: TrailState): TrailState {
  const next = newTrail(state.section + 1, state.practice);
  next.lives = state.lives; next.totalDistance = state.totalDistance;
  next.lane = state.lane; next.x = state.x;
  return next;
}
export function moveTrail(state: TrailState, direction: number) {
  if (state.status === "running") state.lane = Math.max(0, Math.min(2, state.lane + Math.sign(direction)));
}
export function jumpTrail(state: TrailState) {
  if (state.status === "running" && state.jump === 0 && state.slide === 0) state.jump = TRAIL.jumpSeconds;
}
export function slideTrail(state: TrailState) {
  if (state.status === "running" && state.jump === 0 && state.slide === 0) state.slide = TRAIL.slideSeconds;
}
export function jumpHeight(state: TrailState) {
  return state.jump > 0 ? Math.sin(Math.PI * (1 - state.jump / TRAIL.jumpSeconds)) * TRAIL.jumpHeight : 0;
}
export function trailScore(state: TrailState) {
  return Math.min(TRAIL.sectionScoreCap, Math.floor(state.distance) + state.coins * 10);
}
/** Only one hazard lane in a wave. Two entire lanes remain viable, including during a jump/slide. */
export function trailPattern(wave: number, section: number) {
  const lane = (wave * 2 + section) % 3;
  const kinds: TrailKind[] = ["rock", "log", "canopy"];
  return { lane, kind: kinds[wave % kinds.length], sparkLane: (lane + 1) % 3 };
}
function step(state: TrailState, dt: number) {
  state.elapsed += dt;
  state.speed = Math.min(state.practice ? 8 : TRAIL.maximumSpeed,
    (state.practice ? TRAIL.practiceSpeed : TRAIL.initialSpeed) + (state.section - 1) * .15 + state.distance / 300);
  const travelled = Math.min(state.speed * dt, TRAIL.checkpointMetres - state.distance);
  state.distance += travelled; state.totalDistance += travelled;
  state.x += ((state.lane - 1) * TRAIL.laneWidth - state.x) * (1 - Math.exp(-16 * dt));
  const wasJump = state.jump;
  state.jump = Math.max(0, state.jump - dt); state.slide = Math.max(0, state.slide - dt);
  state.invincible = Math.max(0, state.invincible - dt);
  if (wasJump > 0 && state.jump === 0) { state.event = "land"; state.eventId++; }
  if (state.distance >= state.nextSpawn && state.distance < TRAIL.checkpointMetres - TRAIL.spawnAhead - TRAIL.safeExit) {
    const pattern = trailPattern(state.wave, state.section);
    state.items.push({ id: state.wave * 4, lane: pattern.lane, z: TRAIL.spawnAhead, kind: pattern.kind, hit: false });
    for (let i = 0; i < 3; i++) state.items.push({ id: state.wave * 4 + i + 1, lane: pattern.sparkLane,
      z: TRAIL.spawnAhead + i * 2, kind: "spark", hit: false });
    state.wave++; state.nextSpawn += TRAIL.waveMetres;
  }
  for (const item of state.items) {
    item.z -= travelled;
    if (!item.hit && item.z <= TRAIL.collisionZ) {
      item.hit = true;
      if (Math.abs(state.x - (item.lane - 1) * TRAIL.laneWidth) > TRAIL.laneHitRadius) continue;
      if (item.kind === "spark") { state.coins++; state.event = "pickup"; state.eventId++; }
      else if (state.invincible === 0 && !(item.kind === "log" && jumpHeight(state) > TRAIL.logClearance)
        && !(item.kind === "canopy" && state.slide > .12)) {
        state.lives--; state.invincible = TRAIL.immunitySeconds; state.event = "hit"; state.eventId++;
        if (state.lives === 0) state.status = "crashed";
      }
    }
  }
  state.items = state.items.filter(item => item.z > -8);
  if (state.distance >= TRAIL.checkpointMetres && state.status !== "crashed") state.status = "checkpoint";
}
export function tickTrail(state: TrailState, delta: number) {
  if (state.status !== "running") return;
  state.accumulator += Math.min(Math.max(Number.isFinite(delta) ? delta : 0, 0), TRAIL.maxDelta);
  while (state.accumulator + 1e-9 >= TRAIL.step && state.status === "running") {
    step(state, TRAIL.step); state.accumulator -= TRAIL.step;
  }
}
