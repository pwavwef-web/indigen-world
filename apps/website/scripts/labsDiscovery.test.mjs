import assert from "node:assert/strict";
import test from "node:test";
import { LABS_REGISTRY } from "@indigen-world/contracts/labs";
import { carouselReducer, initialCarousel, isAutoplaying, swipeDirection } from "../src/features/labs/carousel.ts";
import { accessFor, actionVerb, present, statusBadge } from "../src/features/labs/access.ts";

test("the hero rotates only while nothing holds it", () => {
  let s = initialCarousel(5, false);
  assert.equal(isAutoplaying(s), true);
  for (const type of ["hover", "focus", "hidden", "offscreen"]) {
    const held = carouselReducer(s, { type, value: true });
    assert.equal(isAutoplaying(held), false, `${type} holds rotation`);
    assert.equal(isAutoplaying(carouselReducer(held, { type, value: false })), true, `${type} release resumes`);
  }
  s = carouselReducer(s, { type: "next", manual: false });
  assert.equal(s.index, 1);
  assert.equal(isAutoplaying(s), true, "automatic advance keeps playing");
});

test("a person's pause and manual navigation are never undone", () => {
  let s = carouselReducer(initialCarousel(5, false), { type: "toggle" });
  assert.equal(s.userPaused, true);
  s = carouselReducer(carouselReducer(s, { type: "hover", value: true }), { type: "hover", value: false });
  assert.equal(isAutoplaying(s), false, "leaving the carousel does not resume a user pause");
  const manual = carouselReducer(initialCarousel(5, false), { type: "prev", manual: true });
  assert.equal(manual.index, 4, "previous wraps to the last slide");
  assert.equal(isAutoplaying(manual), false, "manual navigation stops autoplay");
  assert.equal(isAutoplaying(carouselReducer(initialCarousel(5, false), { type: "go", index: 3 })), false);
  const played = carouselReducer({ ...s, hovered: true, focused: true }, { type: "toggle" });
  assert.equal(isAutoplaying(played), true, "pressing play starts even with the pointer on the button");
});

test("reduced motion starts paused; single photos never rotate", () => {
  assert.equal(isAutoplaying(initialCarousel(5, true)), false);
  assert.equal(isAutoplaying(initialCarousel(1, false)), false);
});

test("swipes need clear horizontal intent", () => {
  assert.equal(swipeDirection(-80, 10), 1);
  assert.equal(swipeDirection(80, 10), -1);
  assert.equal(swipeDirection(-60, 70), 0, "vertical scrolling is left alone");
  assert.equal(swipeDirection(-20, 0), 0, "small drags are ignored");
});

const viewer = (patch = {}) => ({ authReady: true, uid: undefined, loaded: true, failed: false, invited: [], canAdmin: false, ...patch });
const trail = LABS_REGISTRY.find((e) => e.id === "word-trail");
const practice = LABS_REGISTRY.find((e) => e.id === "kasem-practice");

test("signed-in visitors are never told to sign in", () => {
  for (const experiment of LABS_REGISTRY) {
    const state = accessFor(experiment, viewer({ uid: "member" }));
    assert.equal(state, "open", `${experiment.id} opens for a signed-in member`);
    assert.doesNotMatch(actionVerb(present(experiment), state), /sign in/i);
  }
});

test("signed-out visitors see the real requirement", () => {
  assert.equal(accessFor(trail, viewer()), "sign-in");
  assert.equal(accessFor({ ...trail, access: "public" }, viewer()), "sign-in", "games always need an account");
  assert.equal(accessFor({ ...practice, access: "public" }, viewer()), "open", "public trials stay open");
  assert.equal(accessFor(trail, viewer({ authReady: false })), "checking", "no verdict before auth resolves");
});

test("permission, availability and lifecycle are reported honestly", () => {
  const invite = { ...practice, access: "invited testers" };
  assert.equal(accessFor(invite, viewer({ uid: "member" })), "invite-only", "signed in but not invited is not a sign-in prompt");
  assert.equal(accessFor(invite, viewer({ uid: "member", invited: ["kasem-practice"] })), "open");
  assert.equal(accessFor(invite, viewer({ uid: "admin", canAdmin: true })), "open");
  assert.equal(accessFor({ ...practice, enabled: false }, viewer({ uid: "admin", canAdmin: true })), "paused", "admins cannot bypass a pause");
  assert.equal(accessFor({ ...practice, status: "retired" }, viewer({ uid: "member" })), "retired");
  assert.equal(accessFor(practice, viewer({ uid: "member", loaded: false, failed: true })), "unconfirmed");
  assert.deepEqual(statusBadge({ ...practice, enabled: false }), { label: "Paused", tone: "paused" });
  assert.equal(statusBadge(practice).label, "Alpha");
});

test("older servers without presentation fields fall back to the registry", () => {
  const { summary, modes, ...legacy } = trail;
  assert.ok(summary && modes);
  assert.deepEqual(present(legacy).modes, ["play", "contribute"]);
  assert.equal(present({ ...legacy, id: "future", category: "Language" }).modes[0], "learn");
});
