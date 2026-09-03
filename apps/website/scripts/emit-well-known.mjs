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
 * incomplete config emits nothing and says so loudly, and the site keeps
 * working exactly as it does today: the link opens the web page, which offers
 * the app itself.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wellKnown = resolve(root, "dist/.well-known");

const config = JSON.parse(readFileSync(resolve(root, "config/app-links.json"), "utf8"));

/** Uppercase, colon-separated SHA-256, exactly as the signing report prints it. */
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

const warnings = [];
const written = [];

function write(name, contents) {
  mkdirSync(wellKnown, { recursive: true });
  writeFileSync(resolve(wellKnown, name), `${JSON.stringify(contents, null, 2)}\n`, "utf8");
  written.push(`.well-known/${name}`);
}

function emitAssetLinks() {
  const { packageNames = [], sha256CertFingerprints = [] } = config.android ?? {};
  if (sha256CertFingerprints.length === 0) {
    warnings.push(
      "assetlinks.json not written: config/app-links.json has no signing fingerprints yet, " +
        "so Android links will open the website instead of the app."
    );
    return;
  }
  const malformed = sha256CertFingerprints.filter((value) => !FINGERPRINT.test(value));
  if (malformed.length > 0) {
    throw new Error(
      `emit-well-known: these are not SHA-256 fingerprints: ${malformed.join(", ")}. ` +
        "Expected 32 uppercase hex pairs separated by colons, as printed by `gradlew :app:signingReport`."
    );
  }
  if (packageNames.length === 0) {
    throw new Error("emit-well-known: android.sha256CertFingerprints is set but android.packageNames is empty.");
  }
  write(
    "assetlinks.json",
    packageNames.map((packageName) => ({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: sha256CertFingerprints,
      },
    }))
  );
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
