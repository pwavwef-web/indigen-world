/**
 * scripts/emit-well-known.mjs
 *
 * Runs after `vite build`. Writes the two files that let a phone open an
 * indigenworld.com link in the Indigen app instead of a browser tab:
 *
 *   dist/.well-known/assetlinks.json               (Android App Links)
 *   dist/.well-known/apple-app-site-association    (iOS Universal Links)
 *
 * Both are fetched over HTTPS by the operating system when the app is
 * installed, and both are pure statements of "this domain vouches for this
 * app". They live here rather than in public/ for one reason: neither can be
 * written until somebody has pasted a real signing fingerprint or team id into
 * config/app-links.json, and a file committed with a placeholder in it would
 * ship a wrong association rather than no association.
 *
 * That distinction matters. Android caches the result of a failed
 * verification, so a malformed assetlinks.json does not merely fail to help —
 * it stops links opening the app for a while after it is fixed. So an
 * incomplete config emits nothing and says so loudly.
 *
 * WHAT AN EMITTED assetlinks.json REPLACES
 *
 * Not nothing. Firebase Hosting generates one of its own from the Android apps
 * registered in the Firebase project, and serves it whenever the site does not
 * deploy its own — which is what indigenworld.com was doing until 2026-09-05,
 * and why this script looked like dead code nobody had ever needed. You can
 * tell which file you are looking at from the response headers: the generated
 * one arrives `private, no-store` with no HSTS, because it never passes
 * through the `headers` rules in firebase.json.
 *
 * Writing a file here takes over from it permanently. The generated file
 * claims `handle_all_urls` and only that, so it can never carry the
 * `get_login_creds` that Zero-Tap Sign-In needs — but it did stay correct on
 * its own as apps and keys were added in the Firebase console, and from now on
 * that is this config's job. Adding an Android app to the project without
 * adding it to config/app-links.json means App Links silently stop verifying
 * for it.
 *
 * Emitting nothing therefore stays a safe fallback rather than a broken state:
 * Firebase resumes serving its own file the moment this one is not deployed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wellKnown = resolve(root, "dist/.well-known");

const config = JSON.parse(readFileSync(resolve(root, "config/app-links.json"), "utf8"));

/** Uppercase, colon-separated SHA-256, exactly as the signing report prints it. */
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * The two permissions this domain ever grants an app.
 *
 * `handle_all_urls` is what lets a shared indigenworld.com/post/<id> link open
 * in the app instead of a browser tab. `get_login_creds` is what lets the app
 * hold a credential scoped to this domain - the restore key behind Zero-Tap
 * Sign-In, which Google Play requires from April 2027. Anything else is a typo,
 * and a typo here is a statement Android will read and act on.
 */
const KNOWN_RELATIONS = new Set([
  "delegate_permission/common.handle_all_urls",
  "delegate_permission/common.get_login_creds",
]);

const warnings = [];
const written = [];

function write(name, contents) {
  mkdirSync(wellKnown, { recursive: true });
  writeFileSync(resolve(wellKnown, name), `${JSON.stringify(contents, null, 2)}\n`, "utf8");
  written.push(`.well-known/${name}`);
}

function emitAssetLinks() {
  const entries = config.android ?? [];
  if (!Array.isArray(entries)) {
    throw new Error(
      "emit-well-known: config/app-links.json `android` must be a list of " +
        "{ packageName, relations, sha256CertFingerprints } entries. It used to be a single " +
        "{ packageNames, sha256CertFingerprints } pair, which could not express the fact that " +
        "each package is signed by a different key."
    );
  }
  if (entries.length === 0) {
    warnings.push(
      "assetlinks.json not written: config/app-links.json lists no Android apps. " +
        "Firebase Hosting's own generated file keeps being served, which handles App Links " +
        "but cannot claim get_login_creds, so Zero-Tap Sign-In stays off."
    );
    return;
  }

  const seen = new Set();
  const statements = entries.map((entry, index) => {
    const where = entry?.packageName ? `android[${index}] (${entry.packageName})` : `android[${index}]`;
    const { packageName, relations = [], sha256CertFingerprints = [] } = entry ?? {};

    if (typeof packageName !== "string" || packageName.length === 0) {
      throw new Error(`emit-well-known: ${where} has no packageName.`);
    }
    if (seen.has(packageName)) {
      // Two statements for one package is not an error to Android, but it is
      // always a mistake here: the second silently masks whichever relations
      // the first was claiming.
      throw new Error(`emit-well-known: ${packageName} is listed twice.`);
    }
    seen.add(packageName);

    if (relations.length === 0) {
      throw new Error(`emit-well-known: ${where} claims no relations, which vouches for nothing.`);
    }
    const unknown = relations.filter((relation) => !KNOWN_RELATIONS.has(relation));
    if (unknown.length > 0) {
      throw new Error(
        `emit-well-known: ${where} claims unknown relations: ${unknown.join(", ")}. ` +
          `Expected one or both of ${[...KNOWN_RELATIONS].join(", ")}.`
      );
    }

    if (sha256CertFingerprints.length === 0) {
      throw new Error(
        `emit-well-known: ${where} has no signing fingerprints. An entry without one vouches ` +
          "for any build calling itself that package, so it is refused rather than written."
      );
    }
    const malformed = sha256CertFingerprints.filter((value) => !FINGERPRINT.test(value));
    if (malformed.length > 0) {
      throw new Error(
        `emit-well-known: ${where} has values that are not SHA-256 fingerprints: ${malformed.join(", ")}. ` +
          "Expected 32 uppercase hex pairs separated by colons, as printed by `gradlew :app:signingReport`."
      );
    }

    return {
      relation: relations,
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: sha256CertFingerprints,
      },
    };
  });

  write("assetlinks.json", statements);
}

function emitAppleAppSiteAssociation() {
  const { appIds = [], paths = [] } = config.apple ?? {};
  if (appIds.length === 0) {
    warnings.push(
      "apple-app-site-association not written: config/app-links.json has no Apple app ids yet. " +
        "Add them once the iOS build declares the associated-domains entitlement."
    );
    return;
  }
  if (paths.length === 0) {
    throw new Error("emit-well-known: apple.appIds is set but apple.paths is empty.");
  }
  write("apple-app-site-association", {
    applinks: {
      details: [{ appIDs: appIds, components: paths.map((path) => ({ "/": path })) }],
    },
  });
}

emitAssetLinks();
emitAppleAppSiteAssociation();

for (const warning of warnings) console.warn(`emit-well-known: ${warning}`);
console.log(
  written.length > 0
    ? `Wrote ${written.join(", ")}.`
    : "Wrote no app association files (see the warnings above)."
);
