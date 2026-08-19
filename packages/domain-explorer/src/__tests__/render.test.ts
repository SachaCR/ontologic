import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";

import { extractModel, renderHtml } from "../index";
import { APP_SCRIPT } from "../render/app";
import type { DomainModel } from "../extract/model";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

/** The JSON the page embeds, as text. */
function embeddedModel(html: string): string {
  return /const MODEL = (\{[\s\S]*?\});\n<\/script>/.exec(html)?.[1] ?? "{}";
}

describe("Given a domain model extracted from the Order example", () => {
  let model: DomainModel;
  let html: string;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(REPO_ROOT, "packages/ontologic/src/examples/order")],
    });
    html = renderHtml(model);
  });

  describe("When the documentation page is rendered", () => {
    it("Then it is a complete standalone document", () => {
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain("</html>");
      expect(html).toContain("<title>");
    });

    it("Then it requests nothing over the network", () => {
      // The page has to open from disk, from an email attachment, or inside a
      // sandbox that blocks every external host.
      expect(html).not.toMatch(/(src|href)="https?:\/\//);
      expect(html).not.toMatch(/@import/);
      expect(html).not.toMatch(/\bfetch\(/);
      expect(html).not.toMatch(/XMLHttpRequest/);
    });

    it("Then the model is embedded and parses back", () => {
      const match = /const MODEL = (\{[\s\S]*?\});\n<\/script>/.exec(html);
      expect(match).not.toBeNull();

      const embedded = JSON.parse(match?.[1] ?? "{}") as DomainModel;

      expect(embedded.nodes).toHaveLength(model.nodes.length);
      expect(embedded.edges).toHaveLength(model.edges.length);
    });

    it("Then the theme can be switched, and follows the system by default", () => {
      expect(html).toContain('data-theme-set="system"');
      expect(html).toContain('data-theme-set="light"');
      expect(html).toContain('data-theme-set="dark"');

      // No attribute on the served markup means "follow the system" — the CSS
      // keys the un-stamped state off prefers-color-scheme.
      expect(html).not.toContain('<html lang="en" data-theme');
    });

    it("Then a saved theme is restored before the body renders", () => {
      // The restore has to run in <head>. Below the body it would repaint, and a
      // forced-light page on a dark machine would flash dark first.
      const head = html.slice(0, html.indexOf("<body>"));

      expect(head).toContain("ontologic-theme");
      expect(head).toContain('setAttribute("data-theme"');
    });

    it("Then the page has exactly the two script blocks it writes", () => {
      expect(html.match(/<script/g)).toHaveLength(2);
      expect(html.match(/<\/script>/g)).toHaveLength(2);
    });

    it("Then both colour schemes are defined at token level", () => {
      // A colour whose only definition sits behind a media query renders one
      // theme's text on the other theme's ground.
      expect(html).toContain("@media (prefers-color-scheme: dark)");
      expect(html).toContain(':root:not([data-theme="light"])');
      expect(html).toContain(':root[data-theme="dark"]');
      expect(html).toMatch(/body\s*\{[^}]*background:\s*var\(--ground\)/);
    });

    it("Then wide content scrolls inside its own container", () => {
      expect(html).toMatch(/\.scroll\s*\{[^}]*overflow-x:\s*auto/);
    });

    it("Then the inlined script parses", () => {
      // The script is assembled as a template literal, so a stray quote or
      // backtick produces a page that renders a sidebar and a blank body — every
      // structural assertion here still passes. Compiling it is the only check
      // that reads it as code.
      expect(() => new Function(APP_SCRIPT)).not.toThrow();
    });

    it("Then the sidebar offers exactly two views", () => {
      const views = html.match(/<a class="navlink navlink--view"[^>]*>[^<]*<\/a>/g);

      expect(views).toHaveLength(2);
      expect(views?.join("")).toContain(">Overview<");
      expect(views?.join("")).toContain(">Use Cases<");
    });

    it("Then the object decides its view, not the address it was reached by", () => {
      // The whole point of the merge: resolve the id and dispatch on its kind
      // BEFORE looking at the route. If a route comparison came first, then
      // "#/entity/<id>" and "#/domain/<id>" could drift back into two pages for
      // one object, which is the bug this fixes.
      const dispatch = html.indexOf("VIEWS[node.kind](node)");
      const firstRouteTest = html.indexOf('route === "domain"');

      expect(dispatch).toBeGreaterThan(-1);
      expect(firstRouteTest).toBeGreaterThan(-1);
      expect(dispatch).toBeLessThan(firstRouteTest);
    });

    it("Then every stateful kind resolves to the same view", () => {
      expect(html).toMatch(
        /VIEWS = \{\s*entity: viewObject,\s*subEntity: viewObject,\s*valueObject: viewObject,/,
      );
    });

    it("Then nothing addresses the retired explorer route", () => {
      // "#/explore/<id>" still resolves so saved links work, but nothing on the
      // page produces one any more — the diagram used to, which is how clicking
      // an event landed on a dead end.
      expect(html).not.toContain('"#/explore/');
    });

    it("Then no page sends the reader somewhere else for the rest", () => {
      // The explorer used to bottom out in "Nothing below this — see its detail
      // page". There is no other page now.
      expect(html).not.toContain("Nothing below this");
      expect(html).not.toContain("its detail page");
    });

    it("Then the standalone graph screen is a redirect, not a view", () => {
      expect(html).not.toContain("function viewGraph");
      expect(html).toMatch(/route === "graph"[\s\S]{0,200}location\.replace/);
    });

    it("Then the overview no longer carries the event unions table", () => {
      // The unions stay in the model — the CLI summary and the
      // event-missing-from-union finding both read them — but the overview is
      // counts and findings only.
      expect(html).not.toContain("Event unions");
      expect(JSON.parse(embeddedModel(html)).eventUnions.length).toBeGreaterThan(
        0,
      );
    });
  });
});

describe("Given a codebase containing characters that are dangerous in HTML", () => {
  describe("When the page is rendered", () => {
    it("Then markup in a path is escaped rather than injected", () => {
      const html = renderHtml({
        root: "/tmp/<script>alert(1)</script>",
        nodes: [],
        edges: [],
        eventUnions: [],
        findings: [],
        aggregateRoots: [],
        graphs: [],
      });

      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("Then a predicate containing </script> cannot truncate the page", () => {
      // Entirely plausible: an invariant guarding user-supplied markup.
      const html = renderHtml({
        root: "/tmp/project",
        nodes: [
          {
            id: "invariant:a.ts#noScriptTags",
            kind: "invariant",
            name: "noScriptTags",
            description: "Body contains no script tags",
            stateTypeName: "PostState",
            predicate: '(state) => !state.body.includes("</script>")',
            location: { file: "a.ts", line: 1 },
          },
        ],
        edges: [],
        eventUnions: [],
        findings: [],
        aggregateRoots: [],
        graphs: [],
      });

      // Still exactly two blocks: the payload did not close one early.
      expect(html.match(/<\/script>/g)).toHaveLength(2);

      const match = /const MODEL = (\{[\s\S]*?\});\n<\/script>/.exec(html);
      const embedded = JSON.parse(match?.[1] ?? "{}") as DomainModel;

      expect(embedded.nodes[0]).toMatchObject({
        predicate: '(state) => !state.body.includes("</script>")',
      });
    });
  });
});
