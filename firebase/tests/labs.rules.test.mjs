import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  setDoc,
  updateDoc,
  deleteDoc,
  setLogLevel,
} from "firebase/firestore";
setLogLevel("silent");
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-labs-rules",
    firestore: {
      host: "127.0.0.1",
      port: 8080 + Number(process.env.LABS_TEST_PORT_OFFSET || 0),
      rules: readFileSync(
        new URL("../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [path, data] of Object.entries({
      "labsDrafts/private": { uid: "alice", creative: "private text" },
      "labsSessions/session": { uid: "alice" },
      "labsQuests/alice": { uid: "alice", xp: 20 },
      "labsRunners/alice": { uid: "alice", score: 300, phase: "checkpoint" },
      "labsFeedback/report": { uid: "alice", status: "submitted" },
      "labsFeedbackNotes/report": { notes: "staff only" },
      "labsExperiments/kasem-practice": { enabled: true },
      "labsUpdates/update": { title: "Public update" },
      "labsAudit/event": { actorUid: "admin" },
      "labsMetrics/kasem-practice": { sessionStarted: 1 },
      "labsTesters/alice": { experiments: ["kasem-practice"] },
    }))
      await setDoc(doc(db, path), data);
  });
});
after(async () => env.cleanup());
const db = (uid, role) =>
  uid
    ? env.authenticatedContext(uid, role ? { role } : {}).firestore()
    : env.unauthenticatedContext().firestore();
test("Word Trail state is callable-only; even its owner cannot read or forge progress directly", async () => {
  for (const context of [db(), db("alice"), db("bob"), db("staff", "admin")]) {
    await assertFails(getDoc(doc(context, "labsRunners/alice")));
    await assertFails(setDoc(doc(context, "labsRunners/alice"), { uid: "alice", score: 999999, phase: "ready" }));
  }
});
test("only the owner reads private drafts and sessions, including against administrators", async () => {
  for (const path of ["labsDrafts/private", "labsSessions/session", "labsQuests/alice"]) {
    await assertSucceeds(getDoc(doc(db("alice"), path)));
    for (const context of [db(), db("bob"), db("staff", "admin")])
      await assertFails(getDoc(doc(context, path)));
  }
  await assertSucceeds(
    getDocs(
      query(
        collection(db("alice"), "labsDrafts"),
        where("uid", "==", "alice"),
        limit(20),
      ),
    ),
  );
  await assertFails(getDocs(collection(db("bob"), "labsDrafts")));
});
test("feedback is visible to its reporter and admins; internal notes remain staff-only", async () => {
  await assertSucceeds(getDoc(doc(db("alice"), "labsFeedback/report")));
  await assertSucceeds(
    getDoc(doc(db("admin", "admin"), "labsFeedback/report")),
  );
  await assertFails(getDoc(doc(db("bob"), "labsFeedback/report")));
  await assertFails(getDoc(doc(db("alice"), "labsFeedbackNotes/report")));
  await assertFails(
    getDoc(doc(db("reviewer", "reviewer"), "labsFeedbackNotes/report")),
  );
  await assertSucceeds(
    getDoc(doc(db("admin", "super_admin"), "labsFeedbackNotes/report")),
  );
});
test("configuration and updates are public; all client writes are denied, even for admins", async () => {
  await assertSucceeds(getDoc(doc(db(), "labsExperiments/kasem-practice")));
  await assertSucceeds(getDoc(doc(db(), "labsUpdates/update")));
  for (const context of [db("alice"), db("admin", "admin")]) {
    for (const path of [
      "labsDrafts/private",
      "labsSessions/session",
      "labsQuests/alice",
      "labsFeedback/report",
      "labsFeedbackNotes/report",
      "labsExperiments/kasem-practice",
      "labsUpdates/update",
      "labsAudit/event",
      "labsMetrics/kasem-practice",
      "labsTesters/alice",
    ]) {
      await assertFails(
        setDoc(doc(context, path), {
          uid: "alice",
          role: "admin",
          enabled: true,
        }),
      );
      await assertFails(updateDoc(doc(context, path), { uid: "alice" }));
      await assertFails(deleteDoc(doc(context, path)));
    }
  }
});
test("tester claims, usage and audit records cannot expose privileges to ordinary users", async () => {
  await assertSucceeds(getDoc(doc(db("alice"), "labsTesters/alice")));
  await assertFails(getDoc(doc(db("bob"), "labsTesters/alice")));
  for (const path of ["labsAudit/event", "labsMetrics/kasem-practice"]) {
    await assertFails(getDoc(doc(db("alice"), path)));
    await assertSucceeds(getDoc(doc(db("admin", "admin"), path)));
  }
});
