import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertAccess,
  assertOwner,
  experimentConfig,
  makeQuestions,
  sourceFrom,
  reviewedPublishedAudio,
} from "../../services/functions/lib/labs-policy.js";
const reviewed = {
  isPublished: true,
  authenticationStatus: "reviewed",
  kasemText: "exact-form",
  englishText: "meaning",
};
const source = (i, kind = "word") => ({
  ref: `fixture:${i}`,
  kind,
  original: `FORM-${i}`,
  meaning: `Meaning ${i}`,
  topic: "Test",
  audioUrl: "",
  reviewed: true,
});
test("published content requires an explicit language review", () => {
  assert.equal(
    sourceFrom("dictionaryEntries", "a", {
      ...reviewed,
      authenticationStatus: "unspecified",
    }),
    null,
  );
  assert.equal(
    sourceFrom("dictionaryEntries", "a", { ...reviewed, isPublished: false }),
    null,
  );
  assert.equal(
    sourceFrom("dictionaryEntries", "a", { ...reviewed, kasemText: "" }),
    null,
  );
  assert.ok(sourceFrom("dictionaryEntries", "a", reviewed));
});
test("source text is kept byte-for-byte and expressions/sentences retain their kind", () => {
  const expression = sourceFrom("expressionEntries", "b", {
    ...reviewed,
    phrase: "  exact expression ɔ́  ",
    meaning: "A meaning",
  });
  assert.equal(expression.original, "  exact expression ɔ́  ");
  assert.equal(expression.kind, "expression");
  assert.equal(
    sourceFrom("dictionaryEntries", "c", {
      ...reviewed,
      lexicalKind: "sentence",
    }).kind,
    "sentence",
  );
});
test("development material is excluded from production", () => {
  const prior = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = "production";
  assert.equal(
    sourceFrom("dictionaryEntries", "a", {
      ...reviewed,
      isDevelopmentFixture: true,
    }),
    null,
  );
  process.env.GCLOUD_PROJECT = "demo-indigen-world";
  assert.equal(
    sourceFrom("dictionaryEntries", "a", {
      ...reviewed,
      isDevelopmentFixture: true,
    }).developmentFixture,
    true,
  );
  if (prior === undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT = prior;
});
test("question construction skips ambiguity, multiple senses and insufficient distractors", () => {
  assert.deepEqual(makeQuestions([source(1), source(2)], "Test"), []);
  const rows = [
    source(1),
    source(2),
    source(3),
    { ...source(4), original: "FORM-1" },
    { ...source(5), meaning: "multiple, senses" },
  ];
  assert.deepEqual(makeQuestions(rows, "Test"), []);
  assert.deepEqual(
    makeQuestions(
      [source(1), source(2), { ...source(3), meaning: "Meaning 1" }],
      "Test",
    ),
    [],
  );
});
test("questions have distinct answers from the source and never invent audio", () => {
  const qs = makeQuestions(
    Array.from({ length: 10 }, (_, i) => source(i)),
    "Test",
  );
  assert.equal(qs.length, 6);
  for (const q of qs) {
    assert.equal(new Set(q.choices).size, 3);
    assert.equal(q.choices[q.answer], q.source.meaning);
    assert.equal(q.mode, "meaning");
  }
});
test("expressions are matched as whole expressions; listening requires reviewed-source audio", () => {
  const rows = [
    source(1, "expression"),
    source(2, "expression"),
    source(3, "expression"),
  ];
  for (const q of makeQuestions(rows, "Test")) {
    assert.equal(q.mode, "matching");
    assert.equal(q.choices[q.answer], q.source.original);
  }
  rows[0].audioUrl = "https://reviewed-recording.example";
  assert.equal(makeQuestions(rows, "Test")[0].mode, "listening");
});
test("access mode and lifecycle are independently enforced", () => {
  const e = experimentConfig("kasem-practice");
  assert.throws(() => assertAccess(e, undefined, false), {
    code: "unauthenticated",
  });
  assert.doesNotThrow(() =>
    assertAccess({ ...e, access: "public" }, undefined, false),
  );
  assert.throws(() => assertAccess({ ...e, enabled: false }, "u", true), {
    code: "failed-precondition",
  });
  for (const status of ["retired", "graduated"])
    assert.throws(() => assertAccess({ ...e, status }, "u", true), {
      code: "failed-precondition",
    });
  assert.throws(
    () => assertAccess({ ...e, access: "invited testers" }, "u", false),
    { code: "permission-denied" },
  );
  assert.doesNotThrow(() =>
    assertAccess({ ...e, access: "invited testers" }, "u", true),
  );
});
test("ownership is exact and cannot be replaced by an admin UI flag", () => {
  assert.doesNotThrow(() => assertOwner("u", "u"));
  assert.throws(() => assertOwner("u", "other"), { code: "permission-denied" });
});
test("owner-reviewed AI audio keeps its origin label and must match the exact current sense and dialect", () => {
  const s = sourceFrom("dictionaryEntries", "pilot-entry", reviewed);
  const url = "https://firebasestorage.googleapis.com/v0/b/demo/o/pilot";
  const p = {
    sourceEntryId: "pilot-entry",
    audioUrl: url,
    isPrimary: true,
    aiGenerated: true,
    approvalSource: "explicit_owner_instruction",
    approvedBy: "dictionary owner",
    reviewedAt: "2026-09-28",
    reviewedHeadword: s.original,
    reviewedMeaning: s.meaning,
    reviewedDialect: "Not recorded",
  };
  const d = { ...reviewed, audioUrl: url, pronunciationAudioProvenance: p };
  assert.ok(
    reviewedPublishedAudio("pilot-entry", d, s).credit.startsWith(
      "AI-generated",
    ),
  );
  for (const changed of [
    { reviewedMeaning: "different sense" },
    { reviewedHeadword: "different spelling" },
    { reviewedDialect: "different dialect" },
    { approvalSource: "unreviewed" },
    { sourceEntryId: "different-entry" },
    { reviewedAt: "" },
  ])
    assert.equal(
      reviewedPublishedAudio(
        "pilot-entry",
        { ...d, pronunciationAudioProvenance: { ...p, ...changed } },
        s,
      ),
      null,
    );
  assert.equal(
    reviewedPublishedAudio(
      "pilot-entry",
      { ...d, pronunciationAudioProvenance: undefined },
      s,
    ),
    null,
  );
});
