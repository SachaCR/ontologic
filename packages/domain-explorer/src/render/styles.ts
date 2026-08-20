/**
 * The stylesheet, inlined into the generated page.
 *
 * Follows specs/DESIGN_SPEC.md: a dark rail, a light content area, and cards
 * carrying a 6px concept-coloured left border with a badge, a description and a
 * stats row.
 *
 * Two deviations from the spec, both deliberate:
 *
 * - **Entity is #B45309, not #F59E0B.** Against Aggregate #EAB308 the spec pair
 *   measures ΔE 5.3 in normal vision — below the 15 floor, and visible in the
 *   mock, where the Order and Customer cards read as the same colour. Likewise
 *   **Repository is #334155, not #64748B**, which sat ΔE 1.8 from Value Object.
 *   Both moves stay inside the hue family the spec chose.
 * - **Invariant is #DB2777.** The spec has no invariant colour. Its unused Domain
 *   Service green sat ΔE 3.7 from Error under deuteranopia; pink has the best
 *   worst-case separation of the candidates tested (7.0, against Value Object).
 *
 * Ten categorical hues cannot all separate, so colour is never the only channel:
 * every coloured element also carries its kind as text — the AGG/ENT/CMD/QRY
 * badges and the section headings do that work.
 *
 * NOTE: this is a plain template literal. No backtick and no dollar-brace may
 * appear anywhere below.
 */
export const STYLES = `
:root {
  --ground: #fafafa;
  --surface: #ffffff;
  --surface-sunken: #f4f4f5;
  --line: #e4e4e7;
  --line-strong: #d4d4d8;

  --ink: #09090b;
  --ink-muted: #52525b;
  --ink-faint: #71717a;

  --accent: #4f46e5;
  --accent-soft: #eef2ff;
  --accent-ink: #4338ca;

  /* The rail has its own surface so it can sit against the content area in
     either theme. Tokenised because it follows the theme — nothing in here may
     be a literal. */
  --rail-bg: #f4f4f5;
  --rail-ink: #18181b;
  --rail-ink-muted: #52525b;
  --rail-ink-faint: #6b6b73;
  --rail-line: #e4e4e7;
  --rail-active: #e4e4e7;
  --rail-active-ink: #09090b;
  --rail-field: #ffffff;
  --rail-field-line: #d4d4d8;

  /* Concept colours. Applied through --k / --k-soft, never referenced directly. */
  --c-aggregate: #eab308;      --c-aggregate-soft: #fffbeb;
  --c-entity: #b45309;         --c-entity-soft: #fef3c7;
  --c-value: #6b7280;          --c-value-soft: #f3f4f6;
  --c-event: #f97316;          --c-event-soft: #fff7ed;
  --c-error: #ef4444;          --c-error-soft: #fef2f2;
  --c-behaviour: #4f46e5;      --c-behaviour-soft: #eef2ff;
  --c-repository: #334155;     --c-repository-soft: #f8fafc;
  --c-command: #2563eb;        --c-command-soft: #eff6ff;
  --c-query: #0d9488;          --c-query-soft: #f0fdfa;
  --c-invariant: #db2777;      --c-invariant-soft: #fdf2f8;
  --c-readmodel: #10b981;      --c-readmodel-soft: #ecfdf5;

  /* Paper tints for the board. Mid-saturation so a note reads as paper and
     still takes dark ink — the concept colour is too strong to write on and
     the soft tint is too pale to read as a sticky. */
  --n-aggregate: #fde68a;
  --n-entity: #fcd34d;
  --n-value: #e5e7eb;
  --n-command: #bfdbfe;
  --n-query: #99f6e4;
  --n-readmodel: #a7f3d0;
  --n-event: #fed7aa;
  --n-error: #fecaca;
  --n-ink: #09090b;

  --danger: #dc2626;
  --danger-soft: #fef2f2;
  --warn: #b45309;
  --warn-soft: #fffbeb;

  --radius: 8px;
  --radius-sm: 6px;
  --rail: 260px;
  --inspector: 320px;

  --s1: 4px;
  --s2: 8px;
  --s3: 12px;
  --s4: 16px;
  --s5: 24px;
  --s6: 32px;

  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #0d0d10;
    --surface: #17171b;
    --surface-sunken: #1e1e24;
    --line: #2a2a32;
    --line-strong: #3d3d47;

    --ink: #f4f4f5;
    --ink-muted: #b4b4bd;
    --ink-faint: #8b8b96;

    --accent: #818cf8;
    --accent-soft: #23233a;
    --accent-ink: #a5b4fc;

    --rail-bg: #101014;
    --rail-ink: #fafafa;
    --rail-ink-muted: #a1a1aa;
    --rail-ink-faint: #82828d;
    --rail-line: #26262e;
    --rail-active: #27272a;
    --rail-active-ink: #ffffff;
    --rail-field: #27272a;
    --rail-field-line: #3f3f46;

    --c-aggregate: #facc15;      --c-aggregate-soft: #2a2410;
    --c-entity: #f59e0b;         --c-entity-soft: #2e2210;
    --c-value: #9ca3af;          --c-value-soft: #24252a;
    --c-event: #fb923c;          --c-event-soft: #2e2013;
    --c-error: #f87171;          --c-error-soft: #2f1a1a;
    --c-behaviour: #818cf8;      --c-behaviour-soft: #21233d;
    --c-repository: #94a3b8;     --c-repository-soft: #222730;
    --c-command: #60a5fa;        --c-command-soft: #16233d;
    --c-query: #2dd4bf;          --c-query-soft: #10312e;
    --c-invariant: #f472b6;      --c-invariant-soft: #2e1622;
    --c-readmodel: #34d399;      --c-readmodel-soft: #0d2a20;

    --n-aggregate: #5c4a10;
    --n-entity: #5c3f0c;
    --n-value: #33353b;
    --n-command: #1e3a6b;
    --n-query: #0f4a44;
    --n-readmodel: #0f3d2c;
    --n-event: #5c3517;
    --n-error: #5c1f1f;
    --n-ink: #f4f4f5;

    --danger: #f87171;
    --danger-soft: #2f1a1a;
    --warn: #fbbf24;
    --warn-soft: #2a2410;
  }
}

:root[data-theme="dark"] {
  --ground: #0d0d10;
  --surface: #17171b;
  --surface-sunken: #1e1e24;
  --line: #2a2a32;
  --line-strong: #3d3d47;

  --ink: #f4f4f5;
  --ink-muted: #b4b4bd;
  --ink-faint: #8b8b96;

  --accent: #818cf8;
  --accent-soft: #23233a;
  --accent-ink: #a5b4fc;

  --rail-bg: #101014;
  --rail-ink: #fafafa;
  --rail-ink-muted: #a1a1aa;
  --rail-ink-faint: #82828d;
  --rail-line: #26262e;
  --rail-active: #27272a;
  --rail-active-ink: #ffffff;
  --rail-field: #27272a;
  --rail-field-line: #3f3f46;

  --c-aggregate: #facc15;      --c-aggregate-soft: #2a2410;
  --c-entity: #f59e0b;         --c-entity-soft: #2e2210;
  --c-value: #9ca3af;          --c-value-soft: #24252a;
  --c-event: #fb923c;          --c-event-soft: #2e2013;
  --c-error: #f87171;          --c-error-soft: #2f1a1a;
  --c-behaviour: #818cf8;      --c-behaviour-soft: #21233d;
  --c-repository: #94a3b8;     --c-repository-soft: #222730;
  --c-command: #60a5fa;        --c-command-soft: #16233d;
  --c-query: #2dd4bf;          --c-query-soft: #10312e;
  --c-invariant: #f472b6;      --c-invariant-soft: #2e1622;
  --c-readmodel: #34d399;      --c-readmodel-soft: #0d2a20;

  --n-aggregate: #5c4a10;
  --n-entity: #5c3f0c;
  --n-value: #33353b;
  --n-command: #1e3a6b;
  --n-query: #0f4a44;
  --n-readmodel: #0f3d2c;
  --n-event: #5c3517;
  --n-error: #5c1f1f;
  --n-ink: #f4f4f5;

  --danger: #f87171;
  --danger-soft: #2f1a1a;
  --warn: #fbbf24;
  --warn-soft: #2a2410;
}

/* Per-kind roles. Every element that uses these also shows the kind as text. */
[data-kind="entity"]      { --k: var(--c-aggregate);  --k-soft: var(--c-aggregate-soft); --k-note: var(--n-aggregate); }
[data-kind="subEntity"]   { --k: var(--c-entity);     --k-soft: var(--c-entity-soft);    --k-note: var(--n-entity); }
[data-kind="valueObject"] { --k: var(--c-value);      --k-soft: var(--c-value-soft);     --k-note: var(--n-value); }
[data-kind="event"]       { --k: var(--c-event);      --k-soft: var(--c-event-soft);     --k-note: var(--n-event); }
[data-kind="error"]       { --k: var(--c-error);      --k-soft: var(--c-error-soft);     --k-note: var(--n-error); }
[data-kind="behaviour"]   { --k: var(--c-behaviour);  --k-soft: var(--c-behaviour-soft); --k-note: var(--n-command); }
[data-kind="repository"]  { --k: var(--c-repository); --k-soft: var(--c-repository-soft); --k-note: var(--n-value); }
[data-kind="useCase"]     { --k: var(--c-command);    --k-soft: var(--c-command-soft);   --k-note: var(--n-command); }
[data-kind="command"]     { --k: var(--c-command);    --k-soft: var(--c-command-soft);   --k-note: var(--n-command); }
[data-kind="query"]       { --k: var(--c-query);      --k-soft: var(--c-query-soft);     --k-note: var(--n-query); }
[data-kind="invariant"]   { --k: var(--c-invariant);  --k-soft: var(--c-invariant-soft); --k-note: var(--n-error); }
[data-kind="readModel"]   { --k: var(--c-readmodel);  --k-soft: var(--c-readmodel-soft); --k-note: var(--n-readmodel); }
[data-kind="family"]      { --k: var(--line-strong);  --k-soft: var(--surface-sunken);   --k-note: var(--n-value); }

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--accent-ink); text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }

.shell { display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); min-height: 100vh; }

/* ---------- rail ---------- */

.rail {
  position: sticky; top: 0; align-self: start;
  height: 100vh; display: flex; flex-direction: column;
  background: var(--rail-bg);
  color: var(--rail-ink);
  border-right: 1px solid var(--rail-line);
}

.rail__head { padding: 20px var(--s4) var(--s3); }

.rail__brand { display: flex; align-items: center; gap: 10px; }
/* The Ontologic mark, inlined in html.ts — it carries its own colours, so it
   needs no plate behind it. */
.rail__mark { width: 34px; height: 34px; flex: none; display: block; }
.rail__mark svg { width: 100%; height: 100%; display: block; }
.rail__title {
  margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; color: var(--rail-ink);
}
.rail__tag { margin: 2px 0 0; font-size: 11px; color: var(--rail-ink-faint); }

.rail__project {
  margin-top: var(--s4); padding: 9px 11px;
  background: var(--rail-field); border-radius: var(--radius-sm);
}
.rail__project-label {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--rail-ink-faint);
}
.rail__root {
  margin: 2px 0 0; font-family: var(--mono); font-size: 11px;
  color: var(--rail-ink-muted); word-break: break-all; line-height: 1.4;
}

.search {
  width: 100%; margin-top: var(--s3); padding: 7px 10px;
  font: inherit; font-size: 12.5px;
  color: var(--rail-ink); background: var(--rail-field);
  border: 1px solid var(--rail-field-line); border-radius: var(--radius-sm);
}
.search::placeholder { color: var(--rail-ink-faint); }

.filters { display: flex; flex-wrap: wrap; gap: 4px; margin-top: var(--s2); }

.filter {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px 2px 6px; border-radius: 999px;
  font-size: 10.5px; font-weight: 600; cursor: pointer;
  color: var(--rail-ink-muted); background: transparent;
  border: 1px solid var(--rail-field-line);
}
.filter:hover { color: var(--rail-ink); }
.filter[aria-pressed="true"] { background: var(--rail-active); border-color: var(--k); color: var(--rail-ink); }
.filter::before {
  content: ""; width: 7px; height: 7px; border-radius: 2px;
  background: var(--k, var(--rail-ink-faint)); flex: none;
}

.rail__fixed {
  padding: var(--s2) 10px; display: flex; flex-direction: column; gap: 2px;
  border-top: 1px solid var(--rail-line);
}
.rail__nav { overflow-y: auto; padding: var(--s2) 10px 28px; flex: 1; }

.group { margin-top: var(--s3); }
.group:first-child { margin-top: 2px; }
.group__label {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 0 8px 4px;
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--rail-ink-faint);
}
.group__count { font-variant-numeric: tabular-nums; font-weight: 500; }
.group--aggregate .group__label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0;
  text-transform: none; color: var(--c-aggregate);
}

.navlink {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px; border-radius: var(--radius-sm);
  font-size: 13px; color: var(--rail-ink-muted); text-decoration: none;
}
.navlink:hover { background: var(--rail-active); color: var(--rail-ink); }
.navlink[aria-current="page"], .navlink.is-active {
  background: var(--rail-active); color: var(--rail-active-ink); font-weight: 600;
}
.navlink--view { font-weight: 500; }
.navlink--concept { font-family: var(--mono); font-size: 12px; padding: 4px 10px; }
.navlink__dot { width: 7px; height: 7px; border-radius: 2px; flex: none; background: var(--k, var(--rail-ink-faint)); }
.navlink__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.navlink--flagged .navlink__text::after { content: " ●"; color: var(--c-aggregate); font-size: 9px; }

.rail__foot { border-top: 1px solid var(--rail-line); }

.theme {
  display: flex; gap: 2px; padding: 10px 12px 0;
}
.theme__btn {
  flex: 1; padding: 5px 0; cursor: pointer;
  font: inherit; font-size: 11px; font-weight: 600;
  color: var(--rail-ink-muted); background: transparent;
  border: 1px solid var(--rail-field-line); border-radius: var(--radius-sm);
}
.theme__btn:hover { color: var(--rail-ink); }
.theme__btn[aria-pressed="true"] {
  background: var(--rail-active); color: var(--rail-active-ink); border-color: var(--rail-ink-faint);
}

.hint { padding: 8px 12px; font-size: 10.5px; color: var(--rail-ink-faint); }
kbd {
  font-family: var(--mono); font-size: 10px; padding: 1px 4px;
  border: 1px solid var(--rail-field-line); border-radius: 3px; background: var(--rail-field); color: var(--rail-ink-muted);
}

/* ---------- main ---------- */

.main { min-width: 0; padding: var(--s6); background: var(--ground); }
.main--split {
  display: grid; grid-template-columns: minmax(0, 1fr) var(--inspector);
  gap: var(--s5); align-items: start;
}
.main__body { min-width: 0; }

.crumb { display: flex; align-items: center; gap: var(--s2); margin-bottom: var(--s2); flex-wrap: wrap; }

.title {
  margin: 0 0 var(--s1); font-size: 28px; font-weight: 700;
  letter-spacing: -0.02em; text-wrap: balance; word-break: break-word;
}
.title--mono { font-family: var(--mono); font-size: 25px; }

.subtitle { margin: 0 0 var(--s5); color: var(--ink-muted); font-size: 13px; }
.subtitle code { font-family: var(--mono); font-size: 12px; }

.section { margin-top: var(--s5); }
.section__head {
  margin: 0 0 var(--s3); font-size: 12px; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-faint);
}

/* A heading with a control beside it. */
.section__bar { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s3); }

.toggle {
  flex: none; padding: 4px 10px; cursor: pointer;
  font: inherit; font-size: 11px; font-weight: 600;
  color: var(--ink-muted); background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius-sm);
}
.toggle:hover { color: var(--ink); border-color: var(--line-strong); }
.toggle[aria-pressed="true"] {
  color: var(--k, var(--ink)); border-color: var(--k, var(--line-strong));
  background: var(--k-soft, var(--surface));
}

/* ---------- legend bar ---------- */

.legend {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s4);
  padding: 10px var(--s4); margin-bottom: var(--s5);
  background: var(--surface-sunken);
  border: 1px solid var(--line); border-radius: var(--radius);
  font-size: 12px;
}
.legend__title {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-faint);
}
.legend__item { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-muted); }
.legend__swatch {
  width: 11px; height: 11px; border-radius: 3px;
  background: var(--k-soft); border: 1.5px solid var(--k);
}

/* ---------- cards ---------- */

/* Every card is the same height, so a grid reads as a set rather than a
   ragged column. Overlong text truncates; the card links to the full detail. */
.cards {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--s3);
  grid-auto-rows: 142px;
}
.cards--one { grid-auto-rows: 112px; }
.cards--wide { grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); }
.cards--one { grid-template-columns: minmax(0, 1fr); }

.card {
  display: flex; flex-direction: column; gap: 6px;
  min-width: 0; overflow: hidden;
  padding: var(--s4); padding-left: var(--s4);
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 6px solid var(--k, var(--line-strong));
  border-radius: var(--radius);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  text-decoration: none; color: inherit;
}
a.card:hover { border-color: var(--k); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
.card--tinted { background: var(--k-soft); }
.card--flat { box-shadow: none; }

.card__top { display: flex; align-items: baseline; gap: var(--s2); flex: none; min-width: 0; }
.card__name {
  font-size: 16px; font-weight: 700; color: var(--ink);
  word-break: break-word; line-height: 1.3; min-width: 0;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden;
}
.card__name--mono { font-family: var(--mono); font-size: 14.5px; }
.card__go {
  margin-left: auto; flex: none;
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--accent-ink);
}
.card__desc {
  margin: 0; font-size: 13px; line-height: 1.45;
  color: var(--ink-muted); flex: none; min-height: 0;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden;
}
.card__stats {
  margin-top: auto; flex: none;
  display: flex; gap: 6px; align-items: center;
  font-size: 11px; font-weight: 500;
  overflow: hidden;
}
.card__stat { flex: none; white-space: nowrap; }
.card__stat {
  padding: 2px 8px; border-radius: 999px;
  background: var(--k-soft); color: var(--k);
  font-variant-numeric: tabular-nums;
}
.card--tinted .card__stat { background: var(--surface); }
.card__dash { color: var(--ink-faint); font-size: 11px; }

.badge {
  flex: none; padding: 1px 7px; border-radius: 5px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  background: var(--k); color: #ffffff;
}
.badge--soft { background: var(--k-soft); color: var(--k); }

/* ---------- chips ---------- */

.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 600; white-space: nowrap;
  background: var(--surface-sunken); color: var(--ink-muted);
  border: 1px solid var(--line);
}
.chip--kind { background: var(--k-soft); color: var(--k); border-color: var(--k); }
.chip--accent { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
.chip--danger { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
.chip--warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }

.tag {
  display: inline-flex; padding: 2px 9px; border-radius: var(--radius-sm);
  font-size: 11px; font-weight: 500;
  border: 1px solid var(--c-aggregate); color: var(--c-aggregate);
  text-decoration: none;
}
.tags {
  display: flex; gap: 6px; flex: none; margin-top: auto;
  overflow: hidden;
}
.tag { flex: none; white-space: nowrap; }

/* ---------- tiles ---------- */

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: var(--s3); }
.tile {
  display: block; padding: var(--s3) var(--s4); background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius);
  border-left: 6px solid var(--k, var(--line-strong));
  color: inherit; text-decoration: none;
}
a.tile:hover { border-color: var(--k); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
.tile__n {
  font-size: 26px; font-weight: 700;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.tile__k {
  margin-top: 2px; font-size: 11px; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--ink-faint);
}

.gfold { cursor: pointer; }

/* ---------- inspector ---------- */

.inspector {
  position: sticky; top: var(--s6);
  padding: var(--s4); background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius);
}
.inspector__top { display: flex; align-items: baseline; gap: var(--s2); margin-bottom: var(--s2); }
.inspector__name { font-size: 17px; font-weight: 700; word-break: break-word; }
.inspector__label {
  margin: var(--s4) 0 var(--s2); font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint);
}
.field {
  padding: 9px 11px; border: 1px solid var(--line);
  border-radius: var(--radius-sm); background: var(--surface);
}
.field + .field { margin-top: 6px; }
.field__top { display: flex; align-items: baseline; gap: var(--s2); }
.field__name { font-family: var(--mono); font-size: 12.5px; font-weight: 600; }
.field__type {
  margin-left: auto; font-family: var(--mono); font-size: 12px; color: var(--accent-ink);
  word-break: break-all; text-align: right;
}
.field__note { margin: 2px 0 0; font-size: 11.5px; color: var(--ink-faint); }

/* ---------- tables ---------- */

.scroll {
  overflow-x: auto; border: 1px solid var(--line);
  border-radius: var(--radius); background: var(--surface);
}

table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  text-align: left; padding: 9px var(--s4);
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--ink-faint);
  border-bottom: 1px solid var(--line); white-space: nowrap;
}
td { padding: 10px var(--s4); border-bottom: 1px solid var(--line); vertical-align: top; }
tr:last-child td { border-bottom: none; }

.mono { font-family: var(--mono); font-size: 12.5px; }
.muted { color: var(--ink-muted); }
.faint { color: var(--ink-faint); }
.nowrap { white-space: nowrap; }
.dash { color: var(--ink-faint); }
.sig { font-family: var(--mono); font-size: 12px; color: var(--ink-muted); display: block; margin-top: 2px; }
.sig b { color: var(--ink); font-weight: 600; }

/* ---------- findings ---------- */

.finding {
  display: grid; grid-template-columns: 4px 1fr;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); overflow: hidden;
}
.finding + .finding { margin-top: var(--s2); }
.finding__stripe { background: var(--warn); }
.finding--danger .finding__stripe { background: var(--danger); }
.finding__body { padding: var(--s3) var(--s4); }
.finding__code { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--warn); }
.finding--danger .finding__code { color: var(--danger); }
.finding__msg { margin: 4px 0 0; font-size: 13px; }
.finding__where { margin-top: 5px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-faint); }

/* ---------- code ---------- */

pre {
  margin: 0; padding: var(--s4) 18px; overflow-x: auto;
  background: #0b0b0e; color: #e4e4e7;
  border: 1px solid var(--line); border-radius: var(--radius);
  font-family: var(--mono); font-size: 12.5px; line-height: 1.6;
}
pre .k { color: #f472b6; }
pre .t { color: #7dd3fc; }
pre .p { color: #a5b4fc; }

.empty {
  padding: 18px; border: 1px dashed var(--line-strong); border-radius: var(--radius);
  color: var(--ink-faint); font-size: 13px;
}

/* ---------- board ---------- */

/* The board scrolls as one, not row by row: failure paths share their prefix
   with the happy path, so the columns have to stay aligned to be comparable. */
.board {
  display: flex; flex-direction: column; gap: var(--s3);
  overflow-x: auto; padding-bottom: 4px;
}
.board__inner { display: flex; flex-direction: column; gap: var(--s3); min-width: max-content; }
.board::-webkit-scrollbar { height: 8px; }
.board::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 4px; }

.board__row {
  min-width: max-content;
  padding: var(--s3) var(--s4);
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.board__row--failure { background: transparent; }

.board__label {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-faint); margin-bottom: var(--s2);
}
/* A label that is a name rather than a phrase. Uppercasing StatsReport flattens
   the humps that make it readable. */
.board__label--name { text-transform: none; letter-spacing: 0.02em; }

/* The path itself scrolls rather than wrapping — a wrapped path stops reading
   as a sequence. */
.board__path { display: flex; align-items: center; gap: 6px; }

/* A sticky note: solid paper, dark ink, barely rotated so the row looks placed
   rather than printed. The concept colour survives as the bottom edge, which is
   what keeps the legend meaningful. */
.note {
  /* Every note is the same size, so a row reads as a sequence of equal beats
     rather than a ragged skyline. Text that does not fit is truncated; the note
     links through to the full detail. */
  flex: none;
  width: 172px; height: 110px;
  display: flex; flex-direction: column;
  padding: 11px 13px 10px;
  background: var(--k-note, var(--surface-sunken));
  color: var(--n-ink);
  border-radius: 2px;
  border-bottom: 3px solid var(--k, var(--line-strong));
  box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.16);
  text-decoration: none;
  overflow: hidden;
  transform: rotate(-0.5deg);
}
.note:nth-child(4n + 3) { transform: rotate(0.6deg); }
.note:nth-child(4n + 1) { transform: rotate(0.3deg); }
a.note:hover { box-shadow: 2px 4px 8px rgba(0, 0, 0, 0.22); }

.note__kind {
  display: block; flex: none; font-size: 9px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.6;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.note__name {
  margin-top: 3px; flex: none; min-height: 0;
  font-size: 14px; font-weight: 700; line-height: 1.3;
  word-break: break-word;
  /* Three lines, then an ellipsis. */
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
  overflow: hidden;
}
.note__detail {
  display: block; flex: none; margin-top: auto; padding-top: 2px;
  font-family: var(--mono); font-size: 10.5px; opacity: 0.72;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* A note that leads somewhere lifts on hover; one that does not, stays put. */
a.note { cursor: pointer; }

.board__arrow { flex: none; color: var(--ink-faint); font-size: 13px; }

/* Several outcomes leave from one step: events saved together, or errors that
   are alternatives. They share a rank, so they stack rather than following one
   another — a row of them would imply an order that does not exist. */
.board__rank { flex: none; display: flex; flex-direction: column; gap: 5px; }
.board__rank--many { position: relative; padding-left: 11px; }
.board__rank--many::before {
  content: ""; position: absolute; left: 1px; top: 16px; bottom: 16px;
  width: 1px; background: var(--line-strong);
}
/* Wrapped so the group can be hidden as one. The wrapper is display:contents so
   the arrow and the rank stay direct flex items of the path — showing and hiding
   never changes the row's spacing, or the notes' tilt. */
.board__consumers { display: contents; }
.board[data-consumers="off"] .board__consumers { display: none; }

.board__alt {
  padding-left: 2px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-faint);
}

/* ---------- flow ---------- */

.flow { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.flow__item {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 6px 12px; border-radius: var(--radius-sm);
  font-family: var(--mono); font-size: 12.5px;
  background: var(--surface); border: 1px solid var(--k, var(--line));
  color: var(--k, inherit); font-weight: 600; text-decoration: none;
}
.flow__item--read { border-style: dashed; }
.flow__verb {
  font-family: var(--sans); font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.75;
}
.flow__arrow { color: var(--ink-faint); font-size: 14px; }

/* ---------- trail ---------- */

.trail {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-bottom: var(--s3); font-size: 12.5px;
}
.trail a { color: var(--accent-ink); text-decoration: none; }
.trail a:hover { text-decoration: underline; }
.trail__sep { color: var(--ink-faint); }
.trail__here { font-weight: 600; color: var(--ink); }

/* ---------- family ---------- */

.family {
  padding: var(--s3) var(--s4); background: var(--surface-sunken);
  border: 1px solid var(--line); border-radius: var(--radius);
}
.family__label { font-family: var(--mono); font-size: 11.5px; color: var(--ink-muted); margin-bottom: var(--s2); }
.family__label b { color: var(--ink); font-weight: 600; }

@media (max-width: 1100px) {
  .main--split { grid-template-columns: minmax(0, 1fr); }
  .inspector { position: static; }
}

@media (max-width: 860px) {
  .shell { grid-template-columns: 1fr; }
  .rail { position: static; height: auto; }
  .rail__nav { max-height: 320px; }
  .main { padding: var(--s5) var(--s4); }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;
