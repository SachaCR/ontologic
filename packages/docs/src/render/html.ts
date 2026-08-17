import { basename } from "node:path";

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
  const title = `${basename(model.root) || "Domain"} domain model`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="shell">
  <aside class="rail">
    <div class="rail__head">
      <h1 class="rail__title">${escapeHtml(title)}</h1>
      <p class="rail__root">${escapeHtml(model.root)}</p>
      <input id="search" class="search" type="search" placeholder="Filter concepts…"
             aria-label="Filter concepts" autocomplete="off" spellcheck="false">
    </div>
    <nav id="nav" class="rail__nav" aria-label="Domain concepts"></nav>
  </aside>
  <main id="main" class="main"></main>
</div>
<script>
const MODEL = ${embedJson(model)};
</script>
<script>${APP_SCRIPT}</script>
</body>
</html>
`;
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
