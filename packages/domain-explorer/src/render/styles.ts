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

  /* The rail is dark in both themes. */
  --rail-bg: #18181b;
  --rail-item: #a1a1aa;
  --rail-item-active-bg: #27272a;
  --rail-line: #27272a;

  /* Concept colours. Applied through --k / --k-soft, never referenced directly. */
  --c-aggregate: #eab308;      --c-aggregate-soft: #fffbeb;
  --c-entity: #b45309;         --c-entity-soft: #fef3c7;
  --c-value: #6b7280;          --c-value-soft: #f3f4f6;
  --c-event: #f97316;          --c-event-soft: #fff7ed;
  --c-error: #ef4444;          --c-error-soft: #fef2f2;
  --c-behaviour: #4f46e5;      --c-behaviour-soft: #eef2ff;
  --c-repository: #334155;     --c-repository-soft: #f8fafc;
  --c-command: #8b5cf6;        --c-command-soft: #f5f3ff;
  --c-query: #0ea5e9;          --c-query-soft: #f0f9ff;
  --c-invariant: #db2777;      --c-invariant-soft: #fdf2f8;

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
    --rail-item: #a1a1aa;
    --rail-item-active-bg: #26262e;
    --rail-line: #26262e;

    --c-aggregate: #facc15;      --c-aggregate-soft: #2a2410;
    --c-entity: #f59e0b;         --c-entity-soft: #2e2210;
    --c-value: #9ca3af;          --c-value-soft: #24252a;
    --c-event: #fb923c;          --c-event-soft: #2e2013;
    --c-error: #f87171;          --c-error-soft: #2f1a1a;
    --c-behaviour: #818cf8;      --c-behaviour-soft: #21233d;
    --c-repository: #94a3b8;     --c-repository-soft: #222730;
    --c-command: #a78bfa;        --c-command-soft: #26203c;
    --c-query: #38bdf8;          --c-query-soft: #142834;
    --c-invariant: #f472b6;      --c-invariant-soft: #2e1622;

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
  --rail-item: #a1a1aa;
  --rail-item-active-bg: #26262e;
  --rail-line: #26262e;

  --c-aggregate: #facc15;      --c-aggregate-soft: #2a2410;
  --c-entity: #f59e0b;         --c-entity-soft: #2e2210;
  --c-value: #9ca3af;          --c-value-soft: #24252a;
  --c-event: #fb923c;          --c-event-soft: #2e2013;
  --c-error: #f87171;          --c-error-soft: #2f1a1a;
  --c-behaviour: #818cf8;      --c-behaviour-soft: #21233d;
  --c-repository: #94a3b8;     --c-repository-soft: #222730;
  --c-command: #a78bfa;        --c-command-soft: #26203c;
  --c-query: #38bdf8;          --c-query-soft: #142834;
  --c-invariant: #f472b6;      --c-invariant-soft: #2e1622;

  --danger: #f87171;
  --danger-soft: #2f1a1a;
  --warn: #fbbf24;
  --warn-soft: #2a2410;
}

/* Per-kind roles. Every element that uses these also shows the kind as text. */
[data-kind="entity"]      { --k: var(--c-aggregate);  --k-soft: var(--c-aggregate-soft); }
[data-kind="subEntity"]   { --k: var(--c-entity);     --k-soft: var(--c-entity-soft); }
[data-kind="valueObject"] { --k: var(--c-value);      --k-soft: var(--c-value-soft); }
[data-kind="event"]       { --k: var(--c-event);      --k-soft: var(--c-event-soft); }
[data-kind="error"]       { --k: var(--c-error);      --k-soft: var(--c-error-soft); }
[data-kind="behaviour"]   { --k: var(--c-behaviour);  --k-soft: var(--c-behaviour-soft); }
[data-kind="repository"]  { --k: var(--c-repository); --k-soft: var(--c-repository-soft); }
[data-kind="useCase"]     { --k: var(--c-command);    --k-soft: var(--c-command-soft); }
[data-kind="command"]     { --k: var(--c-command);    --k-soft: var(--c-command-soft); }
[data-kind="query"]       { --k: var(--c-query);      --k-soft: var(--c-query-soft); }
[data-kind="invariant"]   { --k: var(--c-invariant);  --k-soft: var(--c-invariant-soft); }
[data-kind="family"]      { --k: var(--line-strong);  --k-soft: var(--surface-sunken); }

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
  color: #fafafa;
}

.rail__head { padding: 20px var(--s4) var(--s3); }

.rail__brand { display: flex; align-items: center; gap: 10px; }
.rail__mark {
  width: 30px; height: 30px; border-radius: 7px; flex: none;
  background: var(--c-command);
  display: grid; place-items: center;
  font-size: 15px; font-weight: 700; color: #ffffff;
}
.rail__title {
  margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; color: #fafafa;
}
.rail__tag { margin: 2px 0 0; font-size: 11px; color: #71717a; }

.rail__project {
  margin-top: var(--s4); padding: 9px 11px;
  background: #27272a; border-radius: var(--radius-sm);
}
.rail__project-label {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.09em;
  text-transform: uppercase; color: #71717a;
}
.rail__root {
  margin: 2px 0 0; font-family: var(--mono); font-size: 11px;
  color: #d4d4d8; word-break: break-all; line-height: 1.4;
}

.search {
  width: 100%; margin-top: var(--s3); padding: 7px 10px;
  font: inherit; font-size: 12.5px;
  color: #fafafa; background: #27272a;
  border: 1px solid #3f3f46; border-radius: var(--radius-sm);
}
.search::placeholder { color: #71717a; }

.filters { display: flex; flex-wrap: wrap; gap: 4px; margin-top: var(--s2); }

.filter {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px 2px 6px; border-radius: 999px;
  font-size: 10.5px; font-weight: 600; cursor: pointer;
  color: #a1a1aa; background: transparent;
  border: 1px solid #3f3f46;
}
.filter:hover { color: #fafafa; }
.filter[aria-pressed="true"] { background: #27272a; border-color: var(--k); color: #fafafa; }
.filter::before {
  content: ""; width: 7px; height: 7px; border-radius: 2px;
  background: var(--k, #71717a); flex: none;
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
  text-transform: uppercase; color: #71717a;
}
.group__count { font-variant-numeric: tabular-nums; font-weight: 500; }
.group--aggregate .group__label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0;
  text-transform: none; color: var(--c-aggregate);
}

.navlink {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px; border-radius: var(--radius-sm);
  font-size: 13px; color: var(--rail-item); text-decoration: none;
}
.navlink:hover { background: #27272a; color: #fafafa; }
.navlink[aria-current="page"], .navlink.is-active {
  background: var(--rail-item-active-bg); color: #ffffff; font-weight: 600;
}
.navlink--view { font-weight: 500; }
.navlink--concept { font-family: var(--mono); font-size: 12px; padding: 4px 10px; }
.navlink__dot { width: 7px; height: 7px; border-radius: 2px; flex: none; background: var(--k, #52525b); }
.navlink__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.navlink--flagged .navlink__text::after { content: " ●"; color: var(--c-aggregate); font-size: 9px; }

.hint { padding: 8px 12px; font-size: 10.5px; color: #52525b; border-top: 1px solid var(--rail-line); }
kbd {
  font-family: var(--mono); font-size: 10px; padding: 1px 4px;
  border: 1px solid #3f3f46; border-radius: 3px; background: #27272a; color: #a1a1aa;
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

.cards {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--s3); align-items: start;
}
.cards--wide { grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); }
.cards--one { grid-template-columns: minmax(0, 1fr); }

.card {
  display: flex; flex-direction: column; gap: 6px;
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

.card__top { display: flex; align-items: baseline; gap: var(--s2); }
.card__name {
  font-size: 16px; font-weight: 700; color: var(--ink);
  word-break: break-word; line-height: 1.3;
}
.card__name--mono { font-family: var(--mono); font-size: 14.5px; }
.card__go {
  margin-left: auto; flex: none;
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--accent-ink);
}
.card__desc { margin: 0; font-size: 13px; color: var(--ink-muted); }
.card__stats {
  margin-top: auto; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  font-size: 11px; font-weight: 500;
}
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
.tags { display: flex; flex-wrap: wrap; gap: 6px; }

/* ---------- tiles ---------- */

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: var(--s3); }
.tile {
  padding: var(--s3) var(--s4); background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius);
  border-left: 6px solid var(--k, var(--line-strong));
}
.tile__n {
  font-size: 26px; font-weight: 700;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.tile__k {
  margin-top: 2px; font-size: 11px; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--ink-faint);
}

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
