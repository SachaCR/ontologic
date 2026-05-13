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
  verticalSpace?: boolean; // add a skeleton row before each child (default true)
  style?: TreeStyle; // glyph set (default "thin")
  color?: boolean; // colorize node names by status (default false)
};

type Glyphs = { tee: string; ell: string; pipe: string; dash: string };

const GLYPH_SETS: Record<TreeStyle, Glyphs> = {
  thin: { tee: "├", ell: "└", pipe: "│", dash: "─" },
  heavy: { tee: "┣", ell: "┗", pipe: "┃", dash: "━" },
};

const ANSI_RESET = "\x1b[0m";
const ANSI_BY_STATUS: Record<WorkflowStatus, string> = {
  TODO: "\x1b[90m", // gray
  IN_PROGRESS: "\x1b[38;5;208m", // orange (256-color)
  DONE: "\x1b[32m", // green
  FAILED: "\x1b[31m", // red
};

type ResolvedOptions = {
  indent: number;
  verticalSpace: boolean;
  glyphs: Glyphs;
  color: boolean;
};

export function renderGraph(
  graph: Graph,
  options: RenderTreeOptions = {},
): string {
  const resolved: ResolvedOptions = {
    indent: Math.max(2, options.indent ?? 4),
    verticalSpace: options.verticalSpace ?? true,
    glyphs: GLYPH_SETS[options.style ?? "thin"],
    color: options.color ?? false,
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
  const name = opts.color
    ? `${ANSI_BY_STATUS[graph.status]}${graph.name}${ANSI_RESET}`
    : graph.name;
  const lines = [prefix + branch + name];

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
