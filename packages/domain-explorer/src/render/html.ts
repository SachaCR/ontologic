import type { DomainModel } from "../extract/model";
import { STYLES } from "./styles";
import { APP_SCRIPT } from "./app";

/**
 * Assemble the single self-contained page.
 *
 * Everything is inlined — stylesheet, script, and the model itself — so the
 * output is one file that opens from disk with no server and no network.
 */
export function renderHtml(model: DomainModel): string {
  const title = domainTitle(model.root);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
<script>
// Restore the saved theme before first paint, so a forced light page on a dark
// machine never flashes dark. Only documentElement exists at this point.
(function () {
  try {
    var saved = localStorage.getItem("ontologic-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) {
    // A file:// page may have storage blocked entirely; follow the system then.
  }
})();
const MODEL = ${embedJson(model)};
</script>
</head>
<body>
<div class="shell">
  <aside class="rail">
    <div class="rail__head">
      <div class="rail__brand">
        <span class="rail__mark" aria-hidden="true">
          <svg viewBox="0 0 240 240" fill="none">
            <defs>
              <marker id="ol-amber" viewBox="0 0 8 8" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" fill="#FBBF24"/></marker>
              <marker id="ol-sky" viewBox="0 0 8 8" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" fill="#38BDF8"/></marker>
              <marker id="ol-orange" viewBox="0 0 8 8" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" fill="#F97316"/></marker>
              <marker id="ol-green" viewBox="0 0 8 8" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" fill="#34D399"/></marker>
            </defs>
            <path d="M 146.7 46.7 A 78 78 0 0 1 193.3 93.3" stroke="#38BDF8" stroke-width="7" stroke-linecap="round" marker-end="url(#ol-sky)"/>
            <path d="M 193.3 146.7 A 78 78 0 0 1 146.7 193.3" stroke="#F97316" stroke-width="7" stroke-linecap="round" marker-end="url(#ol-orange)"/>
            <path d="M 93.3 193.3 A 78 78 0 0 1 46.7 146.7" stroke="#34D399" stroke-width="7" stroke-linecap="round" marker-end="url(#ol-green)"/>
            <path d="M 46.7 93.3 A 78 78 0 0 1 93.3 46.7" stroke="#FBBF24" stroke-width="7" stroke-linecap="round" marker-end="url(#ol-amber)"/>
            <rect x="100" y="22" width="40" height="40" rx="10" fill="#FBBF24" transform="rotate(-7 120 42)"/>
            <rect x="178" y="100" width="40" height="40" rx="10" fill="#38BDF8" transform="rotate(7 198 120)"/>
            <rect x="100" y="178" width="40" height="40" rx="10" fill="#F97316" transform="rotate(7 120 198)"/>
            <rect x="22" y="100" width="40" height="40" rx="10" fill="#34D399" transform="rotate(-7 42 120)"/>
          </svg>
        </span>
        <span>
          <h1 class="rail__title">Domain Explorer</h1>
          <p class="rail__tag">Ontologic</p>
        </span>
      </div>
      <div class="rail__project">
        <div class="rail__project-label">Analysed</div>
        <p class="rail__root">${escapeHtml(model.root)}</p>
      </div>
      <input id="search" class="search" type="search" placeholder="Search the model…  /"
             aria-label="Search the model" autocomplete="off" spellcheck="false">
      <div id="filters" class="filters" role="group" aria-label="Filter by type"></div>
    </div>
    <nav class="rail__fixed" aria-label="Views">
      <a class="navlink navlink--view" data-view="" href="#/">Overview</a>
      <a class="navlink navlink--view" data-view="use-cases" href="#/use-cases">Use Cases</a>
    </nav>
    <nav id="nav" class="rail__nav" aria-label="Domain concepts"></nav>
    <div class="rail__foot">
      <div id="theme" class="theme" role="group" aria-label="Colour theme">
        <button class="theme__btn" type="button" data-theme-set="system" aria-pressed="true">System</button>
        <button class="theme__btn" type="button" data-theme-set="light" aria-pressed="false">Light</button>
        <button class="theme__btn" type="button" data-theme-set="dark" aria-pressed="false">Dark</button>
      </div>
      <p class="hint"><kbd>/</kbd> search · <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> open · <kbd>esc</kbd> clear</p>
    </div>
  </aside>
  <main id="main" class="main"></main>
</div>
<script>${APP_SCRIPT}</script>
</body>
</html>
`;
}

/**
 * What to call the codebase, from the path it was analysed at.
 *
 * `basename` alone produced "domain" for any path ending in `/domain` or
 * `/src`, which is most of them — so a generic leaf borrows its parent instead.
 * Shared with the CLI, which names the output file the same way.
 */
export function domainName(root: string): string {
  const GENERIC = new Set(["domain", "src", "app", "lib", "packages"]);

  const parts = root.split(/[\\/]+/).filter(Boolean);
  let leaf = parts[parts.length - 1] ?? "";

  for (
    let i = parts.length - 1;
    i >= 0 && GENERIC.has(leaf.toLowerCase());
    i--
  ) {
    leaf = parts[i - 1] ?? leaf;
  }

  return leaf || "Domain";
}

function domainTitle(root: string): string {
  return `${domainName(root)} domain model`;
}

/**
 * Serialise the model for embedding in a `<script>` block.
 *
 * Escaping `<` is what stops a string anywhere in the model — a predicate body
 * containing `</script>`, say — from closing the block early and breaking the
 * page. `<` is still a valid `<` to the JSON parser.
 */
function embedJson(model: DomainModel): string {
  return JSON.stringify(model).replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
