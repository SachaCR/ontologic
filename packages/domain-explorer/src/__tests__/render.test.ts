import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";

import { extractModel, renderHtml } from "../index";
import type { DomainModel } from "../extract/model";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

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
