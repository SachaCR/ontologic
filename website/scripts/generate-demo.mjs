// Regenerates the Domain Explorer demo served at /demo/library-domain.html.
//
// Run by hand, and the output is committed. Deliberately NOT wired into
// `prebuild`: the site deploys from GitHub Pages, and making that build depend
// on compiling the explorer first would be one more thing to go wrong in CI for
// a file that changes rarely.
//
//   pnpm --filter website run generate:demo
//
// Plain .mjs with no dependencies, matching generate-llms-txt.mjs.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(WEBSITE_DIR, "..");

const EXPLORER = join(REPO_ROOT, "packages", "domain-explorer");
const CLI = join(EXPLORER, "dist", "cli.js");

// The one domain that may be published. Everything else the explorer has been
// pointed at belongs to somebody's private codebase, so the source is pinned
// here rather than taken from an argument.
const SOURCE = join(REPO_ROOT, "packages", "library-example", "src");
const LABEL = "library-example";
const OUT = join(WEBSITE_DIR, "static", "demo", "library-domain.html");

if (!existsSync(CLI)) {
  console.error(
    `generate-demo: ${CLI} is missing.\n` +
      "Build the explorer first: pnpm --filter @ontologics/domain-explorer build",
  );
  process.exit(1);
}

execFileSync(process.execPath, [CLI, SOURCE, "--out", OUT, "--label", LABEL], {
  stdio: "inherit",
});

// The report is going on a public site. A path from the machine that generated
// it has no business being there, and --label only renames what is displayed.
const html = readFileSync(OUT, "utf8");
const leaked = html.match(/\/(?:Users|home)\/[^"'\s<]*/g);

if (leaked) {
  console.error(
    `\ngenerate-demo: the report still contains ${leaked.length} local path(s), ` +
      `starting with ${leaked[0]}`,
  );
  process.exit(1);
}

console.log(`\nDemo written to ${OUT.slice(REPO_ROOT.length + 1)}`);
