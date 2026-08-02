// Fails the build when dist references a @lyeve* package that is not this
// package itself and not a declared dependency. Catches the case that shipped
// broken 0.1.x/0.2.x tarballs: a scope rename landed in src but the published
// artifact still imported the retired @lyeve/cms-* packages, so consumers hit
// ERR_MODULE_NOT_FOUND on first import.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declared = new Set([
  pkg.name,
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]);

// Sourcemaps embed the original source text, so a stale specifier there is
// cosmetic. Only emitted code and type declarations can break a consumer.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name),
  );
}

const files = walk("dist").filter((f) => !f.endsWith(".map"));
const specifier = /(?:from|require\()\s*["'](@lyeve[^"']*)["']/g;
const bad = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const [, spec] of src.matchAll(specifier)) {
    if (!declared.has(spec)) bad.push(`${file}: ${spec}`);
  }
}

if (bad.length) {
  console.error(`${pkg.name}: dist imports undeclared @lyeve packages:`);
  for (const line of [...new Set(bad)]) console.error(`  ${line}`);
  console.error("Declare them in dependencies/peerDependencies, or fix the import.");
  process.exit(1);
}
