// Fails before a publish when package.json and the CHANGELOG disagree about
// which version this is. The two are edited by hand in separate steps, so a
// release that bumps one and forgets the other ships a tarball whose changelog
// describes a different version than the one consumers install.
//
// The same drift has already been seen from the other side: two versions of
// this scope reached npm with no git tag naming them, which nothing in the
// repository could have noticed after the fact.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

if (!SEMVER.test(pkg.version)) {
  console.error(
    `${pkg.name}: package.json version ${JSON.stringify(pkg.version)} is not a semver string.`,
  );
  process.exit(1);
}

// An in-progress release may head the file with an Unreleased section, which
// names no version and so cannot disagree with one.
const changelog = readFileSync("CHANGELOG.md", "utf8");
const released = (changelog.match(/^## \[([^\]]+)\]/gm) ?? [])
  .map((heading) => heading.slice(4, -1))
  .find((version) => version.toLowerCase() !== "unreleased");

if (released !== pkg.version) {
  console.error(
    `${pkg.name}: CHANGELOG.md heads at ${released ?? "(no version entry)"}, package.json is ${pkg.version}.`,
  );
  console.error(
    `Add the ${pkg.version} entry, or set package.json to the version you meant to release.`,
  );
  process.exit(1);
}

console.log(`${pkg.name}: version ${pkg.version} agrees with CHANGELOG.md`);
