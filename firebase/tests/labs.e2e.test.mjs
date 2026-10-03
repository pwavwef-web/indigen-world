import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import {
  initializeApp as adminInit,
  deleteApp as adminDelete,
} from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithCustomToken,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { LABS_REGISTRY } from "@indigen-world/contracts/labs";
const projectId = "demo-indigen-world",
  apps = [];
let adminApp,
  db,
  member,
  other,
  admin,
  reviewer,
  guest,
  savedId,
  sessionId,
  feedbackId;
async function client(name, uid, role) {
  const app = initializeApp(
    {
      apiKey: "demo-key",
      projectId,
      authDomain: `${projectId}.firebaseapp.com`,
    },
    name,
  );
  apps.push(app);
  connectAuthEmulator(getAuth(app), `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`, {
    disableWarnings: true,
  });
  if (uid)
    await signInWithCustomToken(
      getAuth(app),
      await adminAuth(adminApp).createCustomToken(uid, role ? { role } : {}),
    );
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001 + Number(process.env.LABS_TEST_PORT_OFFSET || 0));
  return async (action, data = {}) =>
    (await httpsCallable(functions, "labsApi")({ ...data, action })).data;
}
const denied = (fn) =>
  assert.rejects(fn, (e) => e.code === "functions/permission-denied");
const unavailable = (fn) =>
  assert.rejects(fn, (e) => e.code === "functions/failed-precondition");
const draft = {
  id: "labs-e2e-draft",
  revision: 0,
  title: "Test draft",
  audience: "Everyone",
  length: "About 1 minute",
  format: "short story",
  context: "Unverified fictional context",
  creative: "My private creative addition.",
  sourceRefs: ["dictionaryEntries:labs-e2e-a"],
};
before(async () => {
  adminApp = adminInit({ projectId });
  db = adminFirestore(adminApp);
  for (const config of LABS_REGISTRY)
    await db.doc(`labsExperiments/${config.id}`).set(config);
  member = await client("labs-member", "labs-e2e-member");
  other = await client("labs-other", "labs-e2e-other");
  admin = await client("labs-admin", "labs-e2e-admin", "admin");
  reviewer = await client("labs-reviewer", "labs-e2e-reviewer", "validator");
  guest = await client("labs-guest");
  await db.doc("labsDrafts/labs-e2e-draft").delete();
  await db.doc("labsMetrics/kasem-practice").delete();
});
after(async () => {
  for (const app of apps) await deleteApp(app);
  await adminDelete(adminApp);
});

test("Word Trail gates require a real queue answer; saving and duplicate retries unlock exactly once", async () => {
  await assert.rejects(guest("runner"), e => e.code === "functions/unauthenticated");
  for (const [n, word] of [[1, "DEVELOPMENT WORD A"], [2, "DEVELOPMENT WORD B"], [3, "DEVELOPMENT WORD C"]])
    await db.doc(`wordQueue/labs-runner-${n}`).set({ word, sentence: "Disposable integration fixture.", status: "open", rank: n, pendingCount: 0, approvedCount: 0 });
  let { run } = await member("runner", { restart: true });
  const params = { id: run.id, section: run.section };
  await assert.rejects(other("beginRunnerSection", params), e => ["functions/not-found", "functions/failed-precondition"].includes(e.code));
  await assert.rejects(member("runnerCheckpoint", { ...params, score: 300 }), e => e.code === "functions/failed-precondition");
  await member("beginRunnerSection", params);
  await assert.rejects(member("runnerCheckpoint", { ...params, score: 300 }), e => e.code === "functions/failed-precondition");
  await db.doc("labsRunners/labs-e2e-member").update({ startedAt: new Date(Date.now() - 31000).toISOString() });
  await assert.rejects(member("runnerCheckpoint", { ...params, score: 99999 }), e => e.code === "functions/invalid-argument");
  ({ run } = await member("runnerCheckpoint", { ...params, score: 340 }));
  assert.equal(run.phase, "checkpoint"); assert.equal(run.score, 340);
  assert.ok(run.word.id.startsWith("labs-runner-"));
  await assert.rejects(member("beginRunnerSection", params), e => e.code === "functions/failed-precondition");
  const firstWord = run.word.id;
  ({ run } = await member("runnerWord", { ...params, another: true }));
  assert.notEqual(run.word.id, firstWord); assert.equal(run.phase, "checkpoint");
  const answer = { ...params, translations: "DEVELOPMENT TRANSLATION", dialect: "Disposable fixture", partOfSpeech: "noun", publicationPermission: false, aiTraining: false, credit: "anonymous" };
  await assert.rejects(member("submitRunnerWord", { ...answer, translations: " " }), e => e.code === "functions/invalid-argument");
  assert.equal((await member("runner")).run.phase, "checkpoint");
  const responses = await Promise.all([member("submitRunnerWord", answer), member("submitRunnerWord", answer)]);
  const finished = responses[0].run;
  assert.equal(finished.section, 2); assert.equal(finished.phase, "ready");
  assert.equal(finished.score, 440); assert.equal(finished.checkpoints, 1);
  assert.equal(responses[1].run.lastReceipt.contributionId, finished.lastReceipt.contributionId);
  const contribution = await db.doc(`collectionContributions/${finished.lastReceipt.contributionId}`).get();
  const submission = await db.doc(`submissions/${finished.lastReceipt.submissionId}`).get();
  assert.equal(contribution.get("wordQueueId"), run.word.id);
  assert.equal(submission.get("wordQueueId"), run.word.id);
  assert.equal(submission.get("permissions.aiTraining"), false);
  const retry = await member("submitRunnerWord", answer); assert.equal(retry.run.score, 440);
  assert.equal((await member("runner")).run.checkpoints, 1);
  await member("beginRunnerSection", { id: finished.id, section: 2 });
  await db.doc("labsRunners/labs-e2e-member").update({ startedAt: new Date(Date.now() - 31000).toISOString() });
  const next = await member("runnerCheckpoint", { id: finished.id, section: 2, score: 300 });
  assert.notEqual(next.run.word.id, run.word.id);
  await admin("adminConfig", { experimentId: "word-trail", enabled: false, status: "alpha", access: "signed-in", version: "0.1.0", limitations: "Paused test" });
  await assert.rejects(member("runner"), e => e.code === "functions/failed-precondition");
  await db.doc("labsExperiments/word-trail").set(LABS_REGISTRY.find(e => e.id === "word-trail"));
});

test("Word Trail empty queue stays gated and invitation/retirement controls apply", async () => {
  const all = await db.collection("wordQueue").get();
  await db.doc("wordQueueProgress/labs-e2e-other").set({ uid: "labs-e2e-other", answered: all.docs.map(d => d.id), skipped: [] });
  const { run } = await other("runner", { restart: true });
  const params = { id: run.id, section: 1 };
  await other("beginRunnerSection", params);
  await db.doc("labsRunners/labs-e2e-other").update({ startedAt: new Date(Date.now() - 31000).toISOString() });
  const gate = await other("runnerCheckpoint", { ...params, score: 300 });
  assert.equal(gate.run.word, null); assert.equal(gate.run.phase, "checkpoint");
  await assert.rejects(other("beginRunnerSection", params), e => e.code === "functions/failed-precondition");
  const base = LABS_REGISTRY.find(e => e.id === "word-trail");
  await db.doc("labsExperiments/word-trail").set({ ...base, access: "invited testers" });
  await assert.rejects(other("runner"), e => e.code === "functions/permission-denied");
  await db.doc("labsTesters/labs-e2e-other").set({ experiments: ["word-trail"] });
  assert.equal((await other("runner")).run.id, run.id);
  await db.doc("labsExperiments/word-trail").set({ ...base, status: "retired" });
  await assert.rejects(other("runner"), e => e.code === "functions/failed-precondition");
  await db.doc("labsExperiments/word-trail").set(base);
});
test("guests can discover; signed-in controls do not execute for guests", async () => {
  const boot = await guest("bootstrap");
  assert.equal(boot.experiments.length, LABS_REGISTRY.length);
  assert.equal(boot.canAdmin, false);
  await assert.rejects(
    guest("sources", { experimentId: "kasem-practice" }),
    (e) => e.code === "functions/unauthenticated",
  );
  await assert.rejects(
    guest("saveDraft", draft),
    (e) => e.code === "functions/unauthenticated",
  );
});
test("empty content abstains, then only explicit reviewed material enters practice", async () => {
  const dictionary = await db.collection("dictionaryEntries").get();
  // Clear only this suite’s disposable fixture records when running it again.
  for (const doc of dictionary.docs.filter((d) => d.id.startsWith("labs-e2e-")))
    await doc.ref.delete();
  const empty = await member("sources", { experimentId: "kasem-practice" });
  assert.equal(
    empty.sources.some((s) => s.ref.startsWith("dictionaryEntries:labs-e2e-")),
    false,
  );
  await unavailable(member("startPractice", { topic: "E2E fixture topic" }));
  for (const [i, letter] of ["a", "b", "c"].entries())
    await db
      .doc(`dictionaryEntries/labs-e2e-${letter}`)
      .set({
        isPublished: true,
        authenticationStatus: "reviewed",
        kasemText: `[E2E-${letter}]`,
        englishText: `Fixture meaning ${i}`,
        topic: "E2E fixture topic",
        isDevelopmentFixture: true,
        version: 1,
      });
  await db
    .doc("dictionaryEntries/labs-e2e-unreviewed")
    .set({
      isPublished: true,
      authenticationStatus: "unspecified",
      kasemText: "UNREVIEWED",
      englishText: "Not suitable",
      topic: "E2E fixture topic",
    });
  const data = await member("sources", { experimentId: "kasem-practice" });
  assert.ok(data.topics.includes("E2E fixture topic"));
  assert.equal(
    data.sources.some((s) => s.original === "UNREVIEWED"),
    false,
  );
});
test("quest contributions persist once, enforce daily cards, and respect access", async () => {
  await db.doc("labsQuests/labs-e2e-member").delete();
  await assert.rejects(guest("quest"), (e) => e.code === "functions/unauthenticated");
  const { quest } = await member("quest");
  assert.equal(quest.cards.length, 3);
  const payload = { day: quest.day, sourceRef: quest.cards[0].ref, kind: "usage", description: "A useful community usage note for review.", evidence: "Personal experience in the stated dialect." };
  await assert.rejects(member("submitQuest", { ...payload, sourceRef: "dictionaryEntries:forged" }), (e) => e.code === "functions/invalid-argument");
  await assert.rejects(other("submitQuest", payload), (e) => e.code === "functions/failed-precondition");
  await assert.rejects(member("submitQuest", { ...payload, day: "2000-01-01" }), (e) => e.code === "functions/failed-precondition");
  await assert.rejects(member("submitQuest", { ...payload, description: "short" }), (e) => e.code === "functions/invalid-argument");
  const results = await Promise.all([member("submitQuest", payload), member("submitQuest", payload)]);
  assert.ok(results.every((r) => r.quest.xp === 20));
  assert.equal((await member("quest")).quest.missions, 1);
  const reports = await db.collection("labsFeedback").where("uid", "==", "labs-e2e-member").where("experimentId", "==", "culture-quest").get();
  assert.equal(reports.size, 1);
  assert.equal(reports.docs[0].get("sourceRef"), payload.sourceRef);
  assert.equal(reports.docs[0].get("status"), "submitted");
  await db.doc("labsExperiments/culture-quest").update({ enabled: false });
  await unavailable(member("submitQuest", payload));
  await unavailable(member("quest"));
  await db.doc("labsExperiments/culture-quest").update({ enabled: true });
  await db.doc("labsQuests/labs-e2e-member").update({ day: "2000-01-01" });
  const reset = (await member("quest")).quest;
  assert.equal(reset.xp, 20);
  assert.deepEqual(reset.completed, []);
});

test("a session persists, scores source matches and completes once", async () => {
  const { session } = await member("startPractice", {
    topic: "E2E fixture topic",
  });
  sessionId = session.id;
  const answers = session.questions.map((q) => q.answer);
  await denied(other("completePractice", { id: session.id, answers }));
  await assert.rejects(
    member("completePractice", { id: session.id, answers: [99] }),
    (e) => e.code === "functions/invalid-argument",
  );
  const completed = (
    await member("completePractice", { id: session.id, answers })
  ).session;
  assert.equal(completed.score, 3);
  assert.ok(completed.completedAt);
  await member("completePractice", { id: session.id, answers });
  const metrics = (await db.doc("labsMetrics/kasem-practice").get()).data();
  assert.equal(metrics.sessionStarted, 1);
  assert.equal(metrics.sessionCompleted, 1);
});
test("listening requires approved, consented recordings of the current source spelling", async () => {
  const refs = [
    "labs-e2e-audio-approved",
    "labs-e2e-audio-pending",
    "labs-e2e-audio-wrong-spelling",
  ];
  const publicUrl =
    "https://firebasestorage.googleapis.com/v0/b/demo/o/fixture?alt=media";
  await db
    .doc(`pronunciationRecordings/${refs[0]}`)
    .set({
      status: "approved",
      publishConsent: true,
      entryId: "labs-e2e-a",
      headword: "[E2E-a]",
      publishedUrl: publicUrl,
    });
  await db
    .doc(`pronunciationRecordings/${refs[1]}`)
    .set({
      status: "submitted",
      publishConsent: true,
      entryId: "labs-e2e-b",
      headword: "[E2E-b]",
      publishedUrl: publicUrl,
    });
  await db
    .doc(`pronunciationRecordings/${refs[2]}`)
    .set({
      status: "approved",
      publishConsent: true,
      entryId: "labs-e2e-c",
      headword: "older spelling",
      publishedUrl: publicUrl,
    });
  try {
    const data = await member("sources", { experimentId: "kasem-practice" });
    assert.equal(
      data.sources.find((s) => s.ref === "dictionaryEntries:labs-e2e-a")
        .audioUrl,
      publicUrl,
    );
    for (const letter of ["b", "c"])
      assert.equal(
        data.sources.find(
          (s) => s.ref === `dictionaryEntries:labs-e2e-${letter}`,
        ).audioUrl,
        "",
      );
  } finally {
    for (const ref of refs)
      await db.doc(`pronunciationRecordings/${ref}`).delete();
  }
});
test("cultural sources require gold review and explicit public reuse rights", async () => {
  const base = {
    status: "gold",
    datasetType: "culture",
    original: "[CULTURE FIXTURE]",
    english: "Simulated cultural material for a test, not a cultural claim.",
    context: "",
    source: "Test fixture",
    sourceReference: "test-only",
    revision: 1,
    permissions: {
      publication: true,
      sourceConfirmed: true,
      culturalAccess: "open",
      licence: "test-only",
    },
  };
  const refs = [
    "labs-e2e-culture-open",
    "labs-e2e-culture-restricted",
    "labs-e2e-culture-unreviewed",
  ];
  await db.doc(`knowledgeRecords/${refs[0]}`).set(base);
  await db
    .doc(`knowledgeRecords/${refs[1]}`)
    .set({
      ...base,
      permissions: { ...base.permissions, culturalAccess: "restricted" },
    });
  await db
    .doc(`knowledgeRecords/${refs[2]}`)
    .set({ ...base, status: "submitted" });
  try {
    const data = await member("sources", { experimentId: "cultural-story" });
    // Legacy Gold is not evidence of an eligible exact-revision release.
    for (const ref of refs)
      assert.equal(
        data.sources.some((s) => s.ref === `knowledgeRecords:${ref}`),
        false,
      );
  } finally {
    for (const ref of refs) await db.doc(`knowledgeRecords/${ref}`).delete();
  }
});
test("drafts remain private and citations survive edits and source withdrawal", async () => {
  const { draft: saved } = await member("saveDraft", {
    ...draft,
    uid: "spoofed",
    sources: [{ original: "INVENTED" }],
  });
  savedId = saved.id;
  assert.equal(saved.uid, "labs-e2e-member");
  assert.equal(saved.sources[0].original, "[E2E-a]");
  for (const actor of [other, admin]) {
    await denied(actor("getDraft", { id: savedId }));
    await denied(actor("saveDraft", { ...draft, revision: 1 }));
    await denied(actor("deleteDraft", { id: savedId }));
  }
  await db.doc("dictionaryEntries/labs-e2e-a").update({ isPublished: false });
  const edited = (
    await member("saveDraft", {
      ...draft,
      revision: 1,
      sourceRefs: [],
      creative: "Edited private story",
    })
  ).draft;
  assert.equal(edited.revision, 2);
  assert.equal(edited.sources[0].ref, saved.sources[0].ref);
  assert.equal(edited.sources[0].original, saved.sources[0].original);
  await unavailable(member("saveDraft", { ...draft, revision: 1 }));
  await db.doc("dictionaryEntries/labs-e2e-a").update({ isPublished: true });
});
test("feedback persists with owned context and canonical version without changing sources", async () => {
  const feedback = {
    experimentId: "kasem-practice",
    version: "spoofed",
    type: "language issue",
    reference: `session:${sessionId}:q1`,
    description: "Please check this fixture meaning.",
    steps: "Read question one.",
    contactConsent: false,
  };
  await denied(other("submitFeedback", feedback));
  const record = (await member("submitFeedback", feedback)).feedback;
  feedbackId = record.id;
  assert.equal(record.version, "0.1.0");
  assert.equal(record.status, "submitted");
  assert.equal(record.uid, "labs-e2e-member");
  assert.equal(record.sourceRef, "dictionaryEntries:labs-e2e-a");
  assert.ok(record.sourceUrl.startsWith("/dictionary?entry="));
  assert.ok(
    (await member("activity", { kind: "feedback" })).records.some(
      (f) => f.id === record.id,
    ),
  );
  assert.equal(
    (await db.doc("dictionaryEntries/labs-e2e-a").get()).get("englishText"),
    "Fixture meaning 0",
  );
  await denied(
    member("adminReview", {
      id: feedbackId,
      status: "resolved",
      notes: "Should not work",
      response: "",
    }),
  );
  await admin("adminReview", {
    id: feedbackId,
    status: "reviewing",
    notes: "INTERNAL ONLY",
    response: "A reviewer is checking the source.",
  });
  const mine = (await member("activity", { kind: "feedback" })).records.find(
    (f) => f.id === feedbackId,
  );
  assert.equal(mine.status, "reviewing");
  assert.equal(mine.response, "A reviewer is checking the source.");
  assert.equal(JSON.stringify(mine).includes("INTERNAL ONLY"), false);
  await denied(member("adminNotes", { id: feedbackId }));
});
test("admin role is server-enforced, controls are audited and pause covers protected operations", async () => {
  const config = LABS_REGISTRY.find((e) => e.id === "cultural-story");
  for (const actor of [member, reviewer])
    await denied(actor("adminConfig", { ...config, experimentId: config.id }));
  await admin("adminConfig", {
    ...config,
    experimentId: config.id,
    enabled: false,
  });
  await unavailable(member("saveDraft", { ...draft, revision: 2 }));
  await unavailable(
    member("assistStory", {
      audience: "Everyone",
      format: "short story",
      length: "About 1 minute",
      context: "",
      sourceRefs: [],
    }),
  );
  assert.equal((await member("getDraft", { id: savedId })).draft.id, savedId);
  await admin("adminConfig", { ...config, experimentId: config.id });
  const practice = LABS_REGISTRY.find(e => e.id === "kasem-practice");
  await admin("adminConfig", {
    ...practice,
    experimentId: practice.id,
    enabled: false,
  });
  await unavailable(member("startPractice", { topic: "E2E fixture topic" }));
  await unavailable(
    member("completePractice", { id: sessionId, answers: [0, 0, 0] }),
  );
  await admin("adminConfig", { ...practice, experimentId: practice.id });
  assert.ok(
    (await admin("adminAudit")).records.some((a) => a.action === "config"),
  );
});
test("invitation changes are trusted, and retirement/graduation stop execution", async () => {
  const practice = LABS_REGISTRY.find(e => e.id === "kasem-practice");
  await admin("adminConfig", {
    ...practice,
    experimentId: practice.id,
    access: "invited testers",
  });
  await denied(member("startPractice", { topic: "E2E fixture topic" }));
  await denied(
    member("adminInvite", {
      uid: "labs-e2e-member",
      experimentId: practice.id,
      invited: true,
    }),
  );
  await admin("adminInvite", {
    uid: "labs-e2e-member",
    experimentId: practice.id,
    invited: true,
  });
  assert.ok(
    (await member("startPractice", { topic: "E2E fixture topic" })).session.id,
  );
  for (const status of ["retired", "graduated"]) {
    await admin("adminConfig", {
      ...practice,
      experimentId: practice.id,
      status,
    });
    await unavailable(member("startPractice", { topic: "E2E fixture topic" }));
  }
  await admin("adminConfig", { ...practice, experimentId: practice.id });
});
test("pagination is bounded and private activity never crosses owners", async () => {
  const batch = db.batch();
  for (let i = 0; i < 25; i++)
    batch.set(db.doc(`labsDrafts/labs-page-${i}`), {
      ...draft,
      id: `labs-page-${i}`,
      uid: "labs-e2e-member",
      createdAt: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    });
  await batch.commit();
  const first = await member("activity", { kind: "drafts" }),
    second = await member("activity", {
      kind: "drafts",
      cursor: first.nextCursor,
    });
  assert.equal(first.records.length, 20);
  assert.equal(second.records.length, 6);
  assert.equal(
    new Set([...first.records, ...second.records].map((r) => r.id)).size,
    26,
  );
  assert.equal((await other("activity", { kind: "drafts" })).records.length, 0);
  await assert.rejects(
    other("activity", { kind: "drafts", cursor: first.nextCursor }),
    (e) => e.code === "functions/invalid-argument",
  );
});
test("missing AI is explicit; provider failure uses the real handler without touching private work", async () => {
  await unavailable(
    member("assistStory", {
      audience: "Everyone",
      format: "short story",
      length: "About 1 minute",
      context: "",
      sourceRefs: [],
    }),
  );
  const { labsApi } = await import("../../services/functions/lib/labs.js");
  const { setGenAiFactoryForTests } = await import(
    "../../services/functions/lib/kawuri-vertex.js"
  );
  const priorProject = process.env.GCLOUD_PROJECT,
    priorSetting = process.env.LABS_STORY_AI_ENABLED;
  process.env.GCLOUD_PROJECT = "labs-provider-test";
  process.env.LABS_STORY_AI_ENABLED = "true";
  setGenAiFactoryForTests(() => ({
    models: {
      generateContent: async () => {
        throw new Error("Provider unavailable");
      },
    },
  }));
  try {
    await assert.rejects(
      labsApi.run({
        auth: { uid: "labs-e2e-member", token: {} },
        rawRequest: { ip: "127.0.0.1" },
        data: {
          action: "assistStory",
          audience: "Everyone",
          format: "short story",
          length: "About 1 minute",
          context: "",
          sourceRefs: [],
        },
      }),
      (e) => e.code === "unavailable" && e.message.includes("kept"),
    );
    assert.equal(
      (await db.doc(`labsDrafts/${savedId}`).get()).get("creative"),
      "Edited private story",
    );
  } finally {
    setGenAiFactoryForTests(null);
    if (priorProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = priorProject;
    if (priorSetting === undefined) delete process.env.LABS_STORY_AI_ENABLED;
    else process.env.LABS_STORY_AI_ENABLED = priorSetting;
  }
});
test("public updates and draft deletion are functional and audited", async () => {
  await admin("adminUpdate", {
    experimentId: "cultural-story",
    version: "0.1.0",
    title: "E2E test update",
    body: "Local emulator update; not a release announcement.",
  });
  assert.ok(
    (await guest("updates")).records.some((u) => u.title === "E2E test update"),
  );
  await member("deleteDraft", { id: savedId });
  await assert.rejects(
    member("getDraft", { id: savedId }),
    (e) => e.code === "functions/not-found",
  );
});
