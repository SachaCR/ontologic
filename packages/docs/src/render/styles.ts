/**
 * The stylesheet, inlined into the generated page.
 *
 * Design notes, so later edits stay coherent:
 *
 * - This is a reference instrument, not a document — it is scanned and
 *   operated. Information design leads: summary before detail, state encoded in
 *   form as well as in words.
 * - Neutrals carry a slight green-slate bias so they sit with the pine accent
 *   rather than reading as default grey.
 * - Three type roles, all from system stacks because the artifact CSP blocks
 *   font CDNs and a silent fallback is worse than an honest stack: a serif for
 *   headings, system-ui for chrome, and monospace for every identifier — the
 *   mono is semantic here, it means "this is a name from your code".
 * - Semantic colour is separate from the accent: events are the accent, failures
 *   are brick, findings are amber. Never reuse the accent for severity.
 */
export const STYLES = `
:root {
  --ground: #f4f6f5;
  --surface: #ffffff;
  --surface-sunken: #eceff0;
  --line: #d7dedc;
  --line-strong: #b9c4c1;

  --ink: #16201d;
  --ink-muted: #566661;
  --ink-faint: #7d8d88;

  --accent: #1f6f5c;
  --accent-soft: #e2efeb;
  --accent-ink: #14503f;

  --danger: #a4453a;
  --danger-soft: #f8e8e6;
  --warn: #96601a;
  --warn-soft: #fbf0e0;

  --radius: 6px;
  --rail: 264px;

  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #121715;
    --surface: #182220;
    --surface-sunken: #101614;
    --line: #2a3a36;
    --line-strong: #3d524c;

    --ink: #e6eeeb;
    --ink-muted: #9fb0ab;
    --ink-faint: #74857f;

    --accent: #6cc0a5;
    --accent-soft: #1c332c;
    --accent-ink: #a5dcc9;

    --danger: #e08b80;
    --danger-soft: #33201d;
    --warn: #d9a969;
    --warn-soft: #302518;
  }
}

:root[data-theme="dark"] {
  --ground: #121715;
  --surface: #182220;
  --surface-sunken: #101614;
  --line: #2a3a36;
  --line-strong: #3d524c;

  --ink: #e6eeeb;
  --ink-muted: #9fb0ab;
  --ink-faint: #74857f;

  --accent: #6cc0a5;
  --accent-soft: #1c332c;
  --accent-ink: #a5dcc9;

  --danger: #e08b80;
  --danger-soft: #33201d;
  --warn: #d9a969;
  --warn-soft: #302518;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--accent-ink); text-decoration-color: var(--line-strong); text-underline-offset: 2px; }
a:hover { text-decoration-color: currentColor; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }

.shell { display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); min-height: 100vh; }

/* ---------- rail ---------- */

.rail {
  position: sticky; top: 0; align-self: start;
  height: 100vh; display: flex; flex-direction: column;
  background: var(--surface-sunken);
  border-right: 1px solid var(--line);
}

.rail__head { padding: 20px 18px 14px; border-bottom: 1px solid var(--line); }

.rail__title {
  margin: 0; font-family: var(--serif); font-size: 19px; font-weight: 600;
  letter-spacing: -0.01em; text-wrap: balance;
}

.rail__root {
  margin: 4px 0 0; font-family: var(--mono); font-size: 11px;
  color: var(--ink-faint); word-break: break-all;
}

.search {
  width: 100%; margin-top: 12px; padding: 7px 10px;
  font: inherit; font-size: 13px;
  color: var(--ink); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius);
}
.search::placeholder { color: var(--ink-faint); }

.rail__fixed {
  padding: 10px 10px 4px; display: flex; flex-direction: column; gap: 2px;
  border-bottom: 1px solid var(--line);
}
.navlink--view { font-family: var(--sans); font-size: 13px; font-weight: 550; }

.rail__nav { overflow-y: auto; padding: 10px 10px 28px; flex: 1; }

.group { margin-top: 14px; }
.group:first-child { margin-top: 4px; }

.group__label {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 0 8px 5px;
  font-size: 10.5px; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--ink-faint);
}
.group__count { font-variant-numeric: tabular-nums; font-weight: 500; }

.navlink {
  display: block; padding: 4px 8px; border-radius: 4px;
  font-family: var(--mono); font-size: 12.5px;
  color: var(--ink-muted); text-decoration: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.navlink:hover { background: var(--surface); color: var(--ink); }
.navlink[aria-current="page"] {
  background: var(--accent-soft); color: var(--accent-ink); font-weight: 600;
}
.navlink--flagged::after { content: "●"; float: right; color: var(--warn); font-size: 9px; }

/* ---------- main ---------- */

.main { min-width: 0; padding: 32px 40px 96px; max-width: 1080px; }

.crumb {
  display: flex; align-items: center; gap: 9px; margin-bottom: 6px;
  font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-faint);
}

.title {
  margin: 0 0 4px; font-family: var(--mono); font-size: 27px; font-weight: 600;
  letter-spacing: -0.015em; text-wrap: balance; word-break: break-word;
}
.title--prose { font-family: var(--serif); font-weight: 600; }

.subtitle { margin: 0 0 26px; color: var(--ink-muted); font-size: 13.5px; }
.subtitle code { font-family: var(--mono); font-size: 12.5px; }

.section { margin-top: 30px; }
.section__head {
  margin: 0 0 10px; font-size: 11px; font-weight: 650;
  letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-faint);
}

/* ---------- chips ---------- */

.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 1px 7px; border-radius: 999px;
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.02em; white-space: nowrap;
  background: var(--surface-sunken); color: var(--ink-muted);
  border: 1px solid var(--line);
}
.chip--accent { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
.chip--danger { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
.chip--warn   { background: var(--warn-soft); color: var(--warn); border-color: transparent; }

/* ---------- tiles ---------- */

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(126px, 1fr)); gap: 10px; }

.tile {
  padding: 13px 15px; background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius);
}
.tile__n {
  font-family: var(--mono); font-size: 25px; font-weight: 600;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.tile__k {
  margin-top: 3px; font-size: 11px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--ink-faint);
}

/* ---------- tables ---------- */

.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }

table { width: 100%; border-collapse: collapse; font-size: 13.5px; }

th {
  text-align: left; padding: 8px 14px;
  font-size: 10.5px; font-weight: 650; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--ink-faint);
  border-bottom: 1px solid var(--line); white-space: nowrap;
}

td { padding: 9px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
tr:last-child td { border-bottom: none; }

.mono { font-family: var(--mono); font-size: 12.5px; }
.muted { color: var(--ink-muted); }
.faint { color: var(--ink-faint); }
.nowrap { white-space: nowrap; }

.dash { color: var(--ink-faint); }

/* ---------- findings ---------- */

.finding {
  display: grid; grid-template-columns: 3px 1fr; gap: 0;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); overflow: hidden;
}
.finding + .finding { margin-top: 8px; }
.finding__stripe { background: var(--warn); }
.finding--danger .finding__stripe { background: var(--danger); }
.finding__body { padding: 11px 14px; }
.finding__code {
  font-family: var(--mono); font-size: 11px; font-weight: 600;
  color: var(--warn); letter-spacing: 0.01em;
}
.finding--danger .finding__code { color: var(--danger); }
.finding__msg { margin: 4px 0 0; font-size: 13.5px; }
.finding__where { margin-top: 5px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-faint); }

/* ---------- code ---------- */

pre {
  margin: 0; padding: 13px 15px; overflow-x: auto;
  background: var(--surface-sunken); border: 1px solid var(--line);
  border-radius: var(--radius);
  font-family: var(--mono); font-size: 12.5px; line-height: 1.6;
}

.empty {
  padding: 18px; border: 1px dashed var(--line-strong); border-radius: var(--radius);
  color: var(--ink-faint); font-size: 13.5px;
}

/* ---------- flow (reads / writes) ---------- */

.flow { display: flex; flex-wrap: wrap; gap: 7px; }
.flow__item {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 11px; border-radius: var(--radius);
  font-family: var(--mono); font-size: 12.5px;
  background: var(--surface); border: 1px solid var(--line);
}
.flow__item--write { border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
.flow__item--read { border-style: dashed; color: var(--ink-muted); }
.flow__verb {
  font-family: var(--sans); font-size: 10px; font-weight: 650;
  letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-faint);
}
.flow__item--write .flow__verb { color: var(--accent); }

/* ---------- explorer ---------- */

.trail {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-bottom: 18px; font-size: 12.5px;
}
.trail a { font-family: var(--mono); text-decoration: none; }
.trail a:hover { text-decoration: underline; }
.trail__sep { color: var(--ink-faint); }
.trail__here { font-family: var(--mono); font-weight: 600; }

.blocks {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px;
}

.block {
  display: flex; flex-direction: column; gap: 6px;
  padding: 13px 15px; min-height: 84px;
  background: var(--surface); border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  text-decoration: none; color: inherit;
}
.block:hover { border-color: var(--accent); }

/* Terminal blocks are not links; make that legible rather than letting the
   affordance lie about being clickable. */
.block--terminal { border-style: dashed; border-color: var(--line); cursor: default; }
.block--terminal:hover { border-color: var(--line); }

.block__kind {
  font-size: 10px; font-weight: 650; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-faint);
}
.block__name {
  font-family: var(--mono); font-size: 14px; font-weight: 600;
  word-break: break-word; line-height: 1.3;
}
.block__meta { margin-top: auto; font-size: 11.5px; color: var(--ink-muted); }
.block__count {
  display: inline-block; padding: 0 6px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent-ink);
  font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums;
}

.block--event .block__kind { color: var(--accent); }
.block--error .block__kind { color: var(--danger); }

.block--ref {
  min-height: 0; padding: 8px 13px; border-style: dashed;
  flex-direction: row; align-items: baseline; gap: 8px;
}

.family {
  padding: 11px 13px; background: var(--surface-sunken);
  border: 1px solid var(--line); border-radius: var(--radius);
}
.family__label {
  font-family: var(--mono); font-size: 11.5px; color: var(--ink-muted);
  margin-bottom: 8px;
}
.family__label b { color: var(--ink); font-weight: 600; }

@media (max-width: 860px) {
  .shell { grid-template-columns: 1fr; }
  .rail { position: static; height: auto; border-right: none; border-bottom: 1px solid var(--line); }
  .rail__nav { max-height: 320px; }
  .main { padding: 24px 20px 64px; }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;
