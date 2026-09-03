import { execFileSync } from "node:child_process";

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function fail(message) {
  console.error(`Production deploy blocked: ${message}`);
  process.exit(1);
}

let changes;
try {
  changes = git(["status", "--porcelain", "--untracked-files=no"]);
} catch (error) {
  fail(error instanceof Error ? error.message : "Unable to inspect the Git checkout");
}

if (changes) {
  fail("the checkout has uncommitted tracked changes");
}

try {
  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (branch !== "main") {
    fail(`the checked-out branch is ${branch}, not main`);
  }
} catch (error) {
  if (error?.status !== 1) {
    fail(error instanceof Error ? error.message : "Unable to inspect the Git branch");
  }
  // A detached HEAD is normal in CI and is accepted only if it matches origin/main below.
}

try {
  execFileSync("git", ["fetch", "--quiet", "origin", "main"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  const head = git(["rev-parse", "HEAD"]);
  const productionHead = git(["rev-parse", "origin/main"]);

  if (head !== productionHead) {
    fail(`HEAD ${head.slice(0, 8)} does not match origin/main ${productionHead.slice(0, 8)}`);
  }

  console.log(`Verified production deploy source: origin/main at ${head.slice(0, 8)}.`);
} catch (error) {
  fail(error instanceof Error ? error.message : "Unable to verify origin/main");
}
