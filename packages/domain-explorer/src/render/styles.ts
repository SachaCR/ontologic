/**
 * The stylesheet, inlined into the generated page.
 *
 * Palette notes, because the type colours are computed rather than chosen:
 *
 * The page follows ontologic.site — indigo #4f46e5 on cool lavender-grey grounds.
 * There are eight object kinds, but eight categorical hues do not survive
 * validation: with every pair on screen at once (which is what this page does)
 * no ordering of eight clears the perceptual floors, and every fourth hue tried
 * failed the normal-vision ΔE floor of 15 against one of the first three.
 *
 * So the system is three validated hues + a neutral + reserved status colours,
 * with members of a family separated by fill weight rather than by hue:
 *
 *   indigo  structure   aggregate (solid) · sub-entity (tinted) · value object (outline)
 *   green   facts       events
 *   orange  application use cases (solid) · repositories (outline)
 *   neutral rules       invariants — deliberately quiet
 *   red     status      errors
 *   amber   status      findings
 *
 * The trio validates all-pairs in both modes: light worst CVD ΔE 9.2, normal
 * vision 27.6; dark worst CVD ΔE 8.4, normal vision 24.7. Two light hues sit
 * under 3:1 against the ground, so the relief rule applies — every coloured
 * element on this page also carries its type as text, and colour is never the
 * only channel.
 */
export const STYLES = `
:root {
  --ground: #eef0f8;
  --surface: #ffffff;
  --surface-sunken: #e5e8f4;
  --line: #d3d8ea;
  --line-strong: #b3bcd8;

  --ink: #1a1c2e;
  --ink-muted: #4d5372;
  --ink-faint: #767d9c;

  --accent: #4f46e5;
  --accent-soft: #e5e4fb;
  --accent-ink: #3730a3;

  /* Type channel — validated trio + neutral. */
  --t-structure: #4f46e5;
  --t-structure-soft: #e5e4fb;
  --t-fact: #1baf7a;
  --t-fact-soft: #ddf3ea;
  --t-app: #eb6834;
  --t-app-soft: #fbe7dd;
  --t-rule: #6b7280;
  --t-rule-soft: #e8eaef;

  /* Reserved status — never used as a categorical hue. */
  --danger: #c02a2a;
  --danger-soft: #fae4e4;
  --warn: #96601a;
  --warn-soft: #fbf0e0;

  --radius: 6px;
  --rail: 272px;

  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #161a2e;
    --surface: #1e2439;
    --surface-sunken: #12162a;
    --line: #2e3550;
    --line-strong: #454e70;

    --ink: #e8eaf6;
    --ink-muted: #a6adca;
    --ink-faint: #7a83a3;

    --accent: #818cf8;
    --accent-soft: #272e4d;
    --accent-ink: #a5b4fc;

    --t-structure: #7480f0;
    --t-structure-soft: #272e4d;
    --t-fact: #26ad80;
    --t-fact-soft: #14352b;
    --t-app: #dc7040;
    --t-app-soft: #3a2419;
    --t-rule: #98a1b8;
    --t-rule-soft: #262c42;

    --danger: #e88080;
    --danger-soft: #3a1f22;
    --warn: #d9a969;
    --warn-soft: #332618;
  }
}

:root[data-theme="dark"] {
  --ground: #161a2e;
  --surface: #1e2439;
  --surface-sunken: #12162a;
  --line: #2e3550;
  --line-strong: #454e70;

  --ink: #e8eaf6;
  --ink-muted: #a6adca;
  --ink-faint: #7a83a3;

  --accent: #818cf8;
  --accent-soft: #272e4d;
  --accent-ink: #a5b4fc;

  --t-structure: #7480f0;
  --t-structure-soft: #272e4d;
  --t-fact: #26ad80;
  --t-fact-soft: #14352b;
  --t-app: #dc7040;
  --t-app-soft: #3a2419;
  --t-rule: #98a1b8;
  --t-rule-soft: #262c42;

  --danger: #e88080;
  --danger-soft: #3a1f22;
  --warn: #d9a969;
  --warn-soft: #332618;
}

/* Per-kind roles. Every element that uses these also shows the kind as text. */
[data-kind="entity"]      { --k: var(--t-structure); --k-soft: var(--t-structure-soft); }
[data-kind="subEntity"]   { --k: var(--t-structure); --k-soft: var(--t-structure-soft); }
[data-kind="valueObject"] { --k: var(--t-structure); --k-soft: transparent; }
[data-kind="event"]       { --k: var(--t-fact);      --k-soft: var(--t-fact-soft); }
[data-kind="useCase"]     { --k: var(--t-app);       --k-soft: var(--t-app-soft); }
[data-kind="repository"]  { --k: var(--t-app);       --k-soft: transparent; }
[data-kind="invariant"]   { --k: var(--t-rule);      --k-soft: var(--t-rule-soft); }
[data-kind="error"]       { --k: var(--danger);      --k-soft: var(--danger-soft); }
[data-kind="family"]      { --k: var(--line-strong); --k-soft: transparent; }

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

.rail__head { padding: 18px 16px 12px; border-bottom: 1px solid var(--line); }

.rail__title {
  margin: 0; font-family: var(--serif); font-size: 19px; font-weight: 600;
  letter-spacing: -0.01em; text-wrap: balance;
}

.rail__root {
  margin: 3px 0 0; font-family: var(--mono); font-size: 11px;
  color: var(--ink-faint); word-break: break-all;
}

.search {
  width: 100%; margin-top: 10px; padding: 7px 10px;
  font: inherit; font-size: 13px;
  color: var(--ink); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius);
}
.search::placeholder { color: var(--ink-faint); }

.filters { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }

.filter {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px 2px 6px; border-radius: 999px;
  font-size: 11px; font-weight: 600; cursor: pointer;
  color: var(--ink-muted); background: transparent;
  border: 1px solid var(--line-strong);
}
.filter:hover { border-color: var(--k, var(--line-strong)); color: var(--ink); }
.filter[aria-pressed="true"] {
  background: var(--k-soft); border-color: var(--k); color: var(--ink);
}
.filter::before {
  content: ""; width: 7px; height: 7px; border-radius: 2px;
  background: var(--k, var(--ink-faint)); flex: none;
}

.rail__fixed {
  padding: 8px 10px 6px; display: flex; flex-direction: column; gap: 2px;
  border-bottom: 1px solid var(--line);
}
.navlink--view { font-family: var(--sans); font-size: 13px; font-weight: 550; }

.rail__nav { overflow-y: auto; padding: 8px 10px 28px; flex: 1; }

.group { margin-top: 12px; }
.group:first-child { margin-top: 2px; }

.group__label {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 0 8px 4px;
  font-size: 10.5px; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ink-faint);
}
.group__count { font-variant-numeric: tabular-nums; font-weight: 500; }

.group--aggregate .group__label {
  font-family: var(--mono); font-size: 11.5px; letter-spacing: 0;
  text-transform: none; color: var(--t-structure); font-weight: 600;
}

.navlink {
  display: flex; align-items: center; gap: 7px;
  padding: 3px 8px; border-radius: 4px;
  font-family: var(--mono); font-size: 12.5px;
  color: var(--ink-muted); text-decoration: none;
}
.navlink:hover { background: var(--surface); color: var(--ink); }
.navlink[aria-current="page"], .navlink.is-active {
  background: var(--k-soft, var(--accent-soft)); color: var(--ink); font-weight: 600;
}
.navlink__dot {
  width: 7px; height: 7px; border-radius: 2px; flex: none;
  background: var(--k, var(--ink-faint));
}
.navlink__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.navlink--flagged .navlink__text::after { content: " ●"; color: var(--warn); font-size: 9px; }

.hint {
  padding: 6px 10px; font-size: 11px; color: var(--ink-faint);
  border-top: 1px solid var(--line);
}
kbd {
  font-family: var(--mono); font-size: 10px; padding: 1px 4px;
  border: 1px solid var(--line-strong); border-radius: 3px; background: var(--surface);
}

/* ---------- main ---------- */

.main { min-width: 0; padding: 30px 40px 96px; max-width: 1080px; }

.crumb {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}

.title {
  margin: 0 0 4px; font-family: var(--mono); font-size: 27px; font-weight: 600;
  letter-spacing: -0.015em; text-wrap: balance; word-break: break-word;
}
.title--prose { font-family: var(--serif); font-weight: 600; }

.subtitle { margin: 0 0 24px; color: var(--ink-muted); font-size: 13.5px; }
.subtitle code { font-family: var(--mono); font-size: 12.5px; }

.section { margin-top: 28px; }
.section__head {
  margin: 0 0 10px; font-size: 11px; font-weight: 650;
  letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-faint);
}

/* ---------- chips ---------- */

.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 1px 8px; border-radius: 999px;
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.02em; white-space: nowrap;
  background: var(--surface-sunken); color: var(--ink-muted);
  border: 1px solid var(--line);
}
.chip--kind {
  background: var(--k-soft); color: var(--k); border-color: var(--k);
}
.chip--accent { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
.chip--danger { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
.chip--warn   { background: var(--warn-soft); color: var(--warn); border-color: transparent; }

/* ---------- tiles ---------- */

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(126px, 1fr)); gap: 10px; }

.tile {
  padding: 12px 14px; background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius);
  border-left: 3px solid var(--k, var(--line-strong));
}
.tile__n {
  font-family: var(--mono); font-size: 25px; font-weight: 600;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.tile__k {
  margin-top: 2px; font-size: 11px; letter-spacing: 0.06em;
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

.sig {
  font-family: var(--mono); font-size: 12px; color: var(--ink-muted);
  display: block; margin-top: 2px;
}
.sig b { color: var(--ink); font-weight: 600; }

/* ---------- findings ---------- */

.finding {
  display: grid; grid-template-columns: 3px 1fr;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); overflow: hidden;
}
.finding + .finding { margin-top: 8px; }
.finding__stripe { background: var(--warn); }
.finding--danger .finding__stripe { background: var(--danger); }
.finding__body { padding: 11px 14px; }
.finding__code {
  font-family: var(--mono); font-size: 11px; font-weight: 600;
  color: var(--warn);
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

/* ---------- flow ---------- */

.flow { display: flex; flex-wrap: wrap; gap: 7px; }
.flow__item {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 11px; border-radius: var(--radius);
  font-family: var(--mono); font-size: 12.5px;
  background: var(--surface); border: 1px solid var(--line);
  color: inherit; text-decoration: none;
}
.flow__item--write { border-color: var(--t-app); color: var(--t-app); font-weight: 600; }
.flow__item--read { border-style: dashed; color: var(--ink-muted); }
.flow__verb {
  font-family: var(--sans); font-size: 10px; font-weight: 650;
  letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-faint);
}
.flow__item--write .flow__verb { color: var(--t-app); }

/* ---------- explorer ---------- */

.trail {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-bottom: 16px; font-size: 12.5px;
}
.trail a { font-family: var(--mono); text-decoration: none; }
.trail a:hover { text-decoration: underline; }
.trail__sep { color: var(--ink-faint); }
.trail__here { font-family: var(--mono); font-weight: 600; }

.blocks {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px;
}

.block {
  display: flex; flex-direction: column; gap: 5px;
  padding: 11px 13px 11px 14px; min-height: 82px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--k, var(--line-strong));
  border-radius: var(--radius);
  text-decoration: none; color: inherit;
}
.block:hover { border-color: var(--k, var(--accent)); border-left-color: var(--k); }

.block--terminal { background: var(--surface-sunken); cursor: default; }
.block--terminal:hover { border-color: var(--line); border-left-color: var(--k); }

.block__kind {
  font-size: 10px; font-weight: 650; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--k, var(--ink-faint));
}
.block__name {
  font-family: var(--mono); font-size: 14px; font-weight: 600;
  word-break: break-word; line-height: 1.3;
}
.block__meta { margin-top: auto; font-size: 11.5px; color: var(--ink-muted); }
.block__count {
  display: inline-block; padding: 0 6px; border-radius: 999px;
  background: var(--k-soft, var(--accent-soft)); color: var(--k, var(--accent-ink));
  font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums;
}

.block--ref {
  min-height: 0; padding: 7px 12px; border-style: dashed;
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

/* ---------- legend ---------- */

.legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; }
.legend__item { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-muted); }
.legend__swatch {
  width: 11px; height: 11px; border-radius: 3px;
  background: var(--k-soft); border: 1.5px solid var(--k);
}

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
