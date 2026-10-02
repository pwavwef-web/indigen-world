export type TrailItem = { lane: number; age: number; kind: "rock" | "log" | "spark"; hit: boolean };
export type TrailState = {
  elapsed: number; lane: number; jump: number; lives: number; coins: number;
  invincible: number; nextSpawn: number; wave: number; section: number;
  items: TrailItem[]; status: "running" | "crashed" | "checkpoint";
};
export const SECTION_SECONDS = 30;
export function newTrail(section = 1): TrailState {
  return { elapsed: 0, lane: 1, jump: 0, lives: 3, coins: 0, invincible: 0,
    nextSpawn: 1, wave: 0, section, items: [], status: "running" };
}
export function moveTrail(state: TrailState, direction: number) {
  if (state.status === "running") state.lane = Math.max(0, Math.min(2, state.lane + direction));
}
export function jumpTrail(state: TrailState) {
  if (state.status === "running" && state.jump <= 0) state.jump = 0.9;
}
export function trailScore(state: TrailState) {
  return Math.min(500, Math.floor(state.elapsed * 10) + state.coins * 10);
}
export function travelTime(section: number) { return Math.max(2.2, 3.8 - (section - 1) * 0.22); }
export function tickTrail(state: TrailState, delta: number) {
  if (state.status !== "running") return;
  const dt = Math.min(Math.max(delta, 0), 0.05);
  state.elapsed = Math.min(SECTION_SECONDS, state.elapsed + dt);
  state.jump = Math.max(0, state.jump - dt);
  state.invincible = Math.max(0, state.invincible - dt);
  if (state.elapsed >= state.nextSpawn && state.elapsed < SECTION_SECONDS - travelTime(state.section)) {
    // One obstacle per wave always leaves two safe lanes. Alternating patterns stay learnable as speed increases.
    const lane = (state.wave * 2 + state.section) % 3;
    state.items.push({ lane, age: 0, kind: state.wave % 3 === 1 ? "log" : "rock", hit: false });
    state.items.push({ lane: (lane + 1) % 3, age: 0, kind: "spark", hit: false });
    state.wave++;
    state.nextSpawn += Math.max(1.35, 1.85 - state.section * 0.05);
  }
  for (const item of state.items) {
    item.age += dt;
    if (!item.hit && item.age / travelTime(state.section) >= 0.86) {
      item.hit = true;
      if (item.lane !== state.lane) continue;
      if (item.kind === "spark") state.coins++;
      else if (state.invincible <= 0 && !(item.kind === "log" && state.jump > 0.15)) {
        state.lives--;
        state.invincible = 1;
        if (state.lives <= 0) state.status = "crashed";
      }
    }
  }
  state.items = state.items.filter(item => item.age < travelTime(state.section) * 1.1);
  if (state.elapsed >= SECTION_SECONDS && state.status !== "crashed") state.status = "checkpoint";
}
