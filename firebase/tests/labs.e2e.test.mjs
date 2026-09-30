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
  connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  if (uid)
    await signInWithCustomToken(
      getAuth(app),
      await adminAuth(adminApp).createCustomToken(uid, role ? { role } : {}),
    );
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
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
test("guests can discover; signed-in controls do not execute for guests", async () => {
  const boot = await guest("bootstrap");
  assert.equal(boot.experiments.length, 2);
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
    assert.ok(
      data.sources.some((s) => s.ref === `knowledgeRecords:${refs[0]}`),
    );
    for (const ref of refs.slice(1))
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
  const practice = LABS_REGISTRY[0];
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
  const practice = LABS_REGISTRY[0];
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
