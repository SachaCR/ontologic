import { WorkflowStatus } from "../interfaces";

export type Graph = {
  name: string;
  childs: Graph[];
  status: WorkflowStatus;
  toString(options?: RenderTreeOptions): string;
};

type TreeStyle = "thin" | "heavy";

export type RenderTreeOptions = {
  indent?: number; // characters between sibling columns (min 2, default 4)
  verticalSpace?: boolean; // add a skeleton row before each child (default false)
  style?: TreeStyle; // glyph set (default "thin")
};

type Glyphs = { tee: string; ell: string; pipe: string; dash: string };

const GLYPH_SETS: Record<TreeStyle, Glyphs> = {
  thin: { tee: "├", ell: "└", pipe: "│", dash: "─" },
  heavy: { tee: "┣", ell: "┗", pipe: "┃", dash: "━" },
};

type ResolvedOptions = {
  indent: number;
  verticalSpace: boolean;
  glyphs: Glyphs;
};

export function renderGraph(
  graph: Graph,
  options: RenderTreeOptions = {},
): string {
  const resolved: ResolvedOptions = {
    indent: Math.max(2, options.indent ?? 4),
    verticalSpace: options.verticalSpace ?? true,
    glyphs: GLYPH_SETS[options.style ?? "thin"],
  };

  return renderTree(graph, "", true, true, resolved);
}

function renderTree(
  graph: Graph,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  opts: ResolvedOptions,
): string {
  const { indent, verticalSpace, glyphs } = opts;
  const dashes = glyphs.dash.repeat(indent - 2);
  const branch = isRoot
    ? ""
    : (isLast ? glyphs.ell : glyphs.tee) + dashes + " ";
  const lines = [prefix + branch + graph.name];

  const childPrefix =
    prefix +
    (isRoot ? "" : (isLast ? " " : glyphs.pipe) + " ".repeat(indent - 1));

  graph.childs.forEach((child, i) => {
    if (verticalSpace) {
      lines.push(childPrefix + glyphs.pipe);
    }
    lines.push(
      renderTree(
        child,
        childPrefix,
        i === graph.childs.length - 1,
        false,
        opts,
      ),
    );
  });

  return lines.join("\n");
}
