/** Disposable emulator demonstration. Never writes to a real Firebase project. */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
const projectId = process.env.GCLOUD_PROJECT || "demo-indigen-world";
if (
  !projectId.startsWith("demo-") ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error(
    "Labs demo requires a demo- project and both local emulators.",
  );
initializeApp({ projectId });
const db = getFirestore();
for (const [uid, role] of [
  ["labs-demo-member", null],
  ["labs-demo-admin", "admin"],
]) {
  const email = role ? "labs-admin@example.test" : "labs-member@example.test";
  try {
    await getAuth().getUser(uid);
  } catch {
    await getAuth().createUser({
      uid,
      email,
      password: "LocalLabsDemo42!",
      displayName: "Local Labs tester",
    });
  }
  await getAuth().setCustomUserClaims(uid, role ? { role } : {});
}
for (const [i, letter] of (process.argv.includes("--empty")
  ? []
  : ["A", "B", "C", "D"]
).entries()) {
  const base = {
    isPublished: true,
    authenticationStatus: "reviewed",
    isDevelopmentFixture: true,
    context:
      "DEVELOPMENT FIXTURE — a simulated reviewed record, not real Kasem.",
    version: 1,
  };
  await db.doc(`dictionaryEntries/labs-demo-word-${i}`).set({
    ...base,
    kasemText: `[TEST-${letter}]`,
    englishText: `Fixture meaning ${letter}`,
    lexicalKind: "word",
    topic: "Demo meanings",
    dialect: "Test fixture",
    attribution: "Indigen World emulator fixture",
  });
  await db.doc(`expressionEntries/labs-demo-expression-${i}`).set({
    ...base,
    phrase: `[TEST EXPRESSION ${letter}]`,
    meaning: `Fixture expression meaning ${letter}`,
    expressionKind: "phrase",
  });
}
console.log(
  "Local Labs demo ready. No real translations or cultural facts were seeded.",
);
console.log(
  "Member: labs-member@example.test; admin: labs-admin@example.test; local-only password: LocalLabsDemo42!",
);
