// Generates static/llms.txt and static/llms-full.txt from website/docs.
//
// Run automatically via the `prebuild` script, so the published site always
// carries an LLM-readable mirror of the documentation that cannot drift from
// the source. See https://llmstxt.org for the format.
//
// Plain .mjs with no dependencies on purpose: it has to run in CI before
// Docusaurus (and its TypeScript toolchain) is involved.

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(WEBSITE_DIR, "docs");
const STATIC_DIR = join(WEBSITE_DIR, "static");

const SITE_URL = "https://ontologic.site";
const DOCS_BASE = `${SITE_URL}/docs`;

const SITE_TITLE = "Ontologic";
const SITE_SUMMARY =
  "A zero-dependency TypeScript toolkit for Domain-Driven Design: domain entities " +
  "and value objects that enforce their own invariants, versioned domain events with " +
  "an outbox-backed event bus, a Result type for explicit domain failures, and typed " +
  "resumable workflows.";

const SITE_NOTES = [
  "Ontologic is published on npm as `ontologic` and has no runtime dependencies.",
  "All examples import from the package root: `import { DomainEntity, ok, err } from \"ontologic\"`.",
  "Worked, tested examples live at https://github.com/SachaCR/ontologic/tree/main/src/examples",
];

/** Strip YAML frontmatter, returning the parsed keys and the remaining body. */
function splitFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    data[kv[1]] = kv[2].trim().replace(/^["'](.*)["']$/, "$1");
  }

  return { data, body: raw.slice(match[0].length) };
}

/**
 * Remove MDX-only syntax so the output is plain readable markdown.
 *
 * Fence-aware on purpose: `import { MessageRelay } from "ontologic"` inside a
 * ```ts block is example code — the single most useful line on the page — while
 * the same statement at the top level is an MDX component import that means
 * nothing outside the site. Stripping both would quietly gut the examples.
 */
function stripMdx(body) {
  const lines = body.split(/\r?\n/);
  const kept = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      kept.push(line);
      continue;
    }

    if (!inFence && /^import\s+.*\s+from\s+["'].*["'];?\s*$/.test(line)) continue;
    if (!inFence && /^export\s+(const|default|function)\b/.test(line)) continue;

    kept.push(line);
  }

  return kept.join("\n");
}

/** Map a docs-relative file path to its published URL. */
function urlForDocPath(docPath, frontmatter) {
  if (frontmatter?.slug) {
    const slug = frontmatter.slug.startsWith("/")
      ? frontmatter.slug
      : `/${frontmatter.slug}`;
    return `${DOCS_BASE}${slug}`;
  }

  const withoutExt = docPath.replace(/\.mdx?$/, "");
  const segments = withoutExt.split(sep);

  // `foo/index.md` publishes at `/docs/foo`
  if (segments[segments.length - 1] === "index") segments.pop();

  return segments.length ? `${DOCS_BASE}/${segments.join("/")}` : DOCS_BASE;
}

/**
 * Rewrite relative markdown links (`./domain-entity.md`, `../index.md`) into
 * absolute site URLs, so a model reading llms-full.txt out of context can still
 * follow them.
 */
function absolutizeLinks(body, docPath, byPath) {
  return body.replace(
    /\]\((\.\.?\/[^)\s]+?\.mdx?)(#[^)\s]*)?\)/g,
    (whole, href, hash = "") => {
      const targetPath = relative(
        DOCS_DIR,
        resolve(join(DOCS_DIR, dirname(docPath)), href),
      );
      const target = byPath.get(targetPath);
      return target ? `](${target.url}${hash})` : whole;
    },
  );
}

/** First non-empty prose line, used when frontmatter carries no description. */
function firstParagraph(body) {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let inAdmonition = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    // Admonitions (`:::warning` … `:::`) are meta-commentary, not a summary of
    // the page — skip their bodies entirely.
    if (trimmed.startsWith(":::")) {
      inAdmonition = trimmed.length > 3;
      continue;
    }

    if (inFence || inAdmonition || !trimmed) continue;
    if (/^(#|import |export |\||<)/.test(trimmed)) continue;

    return trimmed
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // unwrap links
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function truncate(text, max = 200) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

function readCategory(dir) {
  try {
    const raw = readFileSync(join(DOCS_DIR, dir, "_category_.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Collect every doc, grouped into ordered sections mirroring the sidebar. */
function collectSections() {
  const rootDocs = [];
  const dirs = [];

  for (const entry of readdirSync(DOCS_DIR)) {
    const full = join(DOCS_DIR, entry);
    if (statSync(full).isDirectory()) dirs.push(entry);
    else if (/\.mdx?$/.test(entry)) rootDocs.push(entry);
  }

  const loadDoc = (docPath) => {
    const raw = readFileSync(join(DOCS_DIR, docPath), "utf8");
    const { data, body } = splitFrontmatter(raw);
    const cleaned = stripMdx(body);
    const heading = /^#\s+(.+)$/m.exec(cleaned);

    return {
      docPath,
      title: data.title || (heading ? heading[1].trim() : docPath),
      description: data.description || truncate(firstParagraph(cleaned)),
      position: Number(data.sidebar_position ?? 999),
      url: urlForDocPath(docPath, data),
      body: cleaned.trim(),
    };
  };

  const byPosition = (a, b) =>
    a.position - b.position || a.title.localeCompare(b.title);

  const sections = [];

  const rootLoaded = rootDocs.map(loadDoc).sort(byPosition);
  if (rootLoaded.length) {
    sections.push({ label: "Introduction", position: 1, docs: rootLoaded });
  }

  for (const dir of dirs) {
    const files = readdirSync(join(DOCS_DIR, dir)).filter((f) =>
      /\.mdx?$/.test(f),
    );
    if (!files.length) continue;

    const category = readCategory(dir);
    sections.push({
      label: category?.label ?? dir,
      position: Number(category?.position ?? 999),
      docs: files.map((f) => loadDoc(join(dir, f))).sort(byPosition),
    });
  }

  return sections.sort(
    (a, b) => a.position - b.position || a.label.localeCompare(b.label),
  );
}

function buildIndex(sections) {
  const out = [`# ${SITE_TITLE}`, "", `> ${SITE_SUMMARY}`, ""];

  for (const note of SITE_NOTES) out.push(`- ${note}`);
  out.push("");

  for (const section of sections) {
    out.push(`## ${section.label}`, "");
    for (const doc of section.docs) {
      const suffix = doc.description ? `: ${doc.description}` : "";
      out.push(`- [${doc.title}](${doc.url})${suffix}`);
    }
    out.push("");
  }

  out.push("## Optional", "");
  out.push(`- [Full documentation as a single file](${SITE_URL}/llms-full.txt): every page above, concatenated`);
  out.push(`- [Source and examples](https://github.com/SachaCR/ontologic): the repository, including tested example aggregates`);
  out.push("");

  return out.join("\n");
}

function buildFull(sections, byPath) {
  const out = [
    `# ${SITE_TITLE} — full documentation`,
    "",
    `> ${SITE_SUMMARY}`,
    "",
    "This file concatenates every page of the Ontologic documentation.",
    `Canonical HTML version: ${SITE_URL}/docs`,
    "",
  ];

  for (const note of SITE_NOTES) out.push(`- ${note}`);

  for (const section of sections) {
    out.push("", "---", "", `# ${section.label}`);

    for (const doc of section.docs) {
      out.push("", "---", "", `Source: ${doc.url}`, "");
      out.push(absolutizeLinks(doc.body, doc.docPath, byPath));
    }
  }

  out.push("");
  return out.join("\n");
}

const sections = collectSections();
const byPath = new Map(
  sections.flatMap((s) => s.docs).map((doc) => [doc.docPath, doc]),
);

mkdirSync(STATIC_DIR, { recursive: true });
writeFileSync(join(STATIC_DIR, "llms.txt"), buildIndex(sections), "utf8");
writeFileSync(join(STATIC_DIR, "llms-full.txt"), buildFull(sections, byPath), "utf8");

const docCount = sections.reduce((n, s) => n + s.docs.length, 0);
console.log(
  `generate-llms-txt: wrote llms.txt and llms-full.txt from ${docCount} docs ` +
    `across ${sections.length} sections`,
);
