import {
  GraphWorkflow,
  InMemoryWorkflowStateRepository,
  Node,
  WorkflowNode,
  WorkflowStateRepository,
} from "../../workflows";

interface MyWorkflowInputs {
  url: string;
  greeting: string;
  data: number[];
  name: string;
}

class MyWorkflow extends GraphWorkflow<MyWorkflowInputs, string> {
  constructor(params: {
    id: string;
    input: MyWorkflowInputs;
    repository?: WorkflowStateRepository;
  }) {
    const repo = params.repository
      ? params.repository
      : new InMemoryWorkflowStateRepository();

    super({ ...params, name: "My Workflow", repository: repo });

    this.build(this.#buildWorkflow);
  }

  #buildWorkflow(inputs: MyWorkflowInputs) {
    const dataSource = new WorkflowNode({
      name: "Data Source",
      children: {},
      handler: async () => {
        await sleep(2000);
        inputs.url;
        return Promise.resolve({ data: inputs.data });
      },
    });

    const nameSource = new WorkflowNode({
      name: "Name Source",
      children: {},
      handler: async () => {
        await sleep(500);
        return Promise.resolve({ name: inputs.name });
      },
    });

    const summed = new WorkflowNode({
      name: "Sum",
      children: { source: dataSource },
      handler: async (input) => {
        await sleep(2000);
        return Promise.resolve({
          sum: input.source.data.reduce((s, c) => s + c),
        });
      },
    });

    const combined = new WorkflowNode({
      name: "Combine",
      children: { total: summed, tag: nameSource },
      handler: async (input) => {
        await sleep(2000);
        return Promise.resolve({
          message: `${input.tag.name} = ${input.total.sum}`,
        });
      },
    });

    const hello = new WorkflowNode({
      name: "Hello",
      children: {},
      handler: async () => {
        await sleep(1000);
        return Promise.resolve({
          message: inputs.greeting,
        });
      },
    });

    const uppercase = new WorkflowNode({
      name: "Uppercase",
      children: { combined, hello },
      handler: async (input): Promise<string> => {
        await sleep(2000);
        return Promise.resolve(
          input.hello.message.toUpperCase() +
            " " +
            input.combined.message.toUpperCase(),
        );
      },
    });

    return uppercase;
  }
}

async function run() {
  const repository = new InMemoryWorkflowStateRepository();

  const myWorkflow = new MyWorkflow({
    id: "123",
    input: {
      url: "https://ontologic.site",
      greeting: "Hello",
      data: [1, 2, 3, 4, 5],
      name: "Sacha",
    },
    repository,
  });

  myWorkflow.onChanges((event) => {
    switch (event.status) {
      case "DONE":
        console.log({ step: event.step, status: event.status });
        break;

      case "FAILED":
        console.log({ step: event.step, status: event.status });
        break;

      case "START":
        console.log(event);
        break;
    }
  });

  const graph = myWorkflow.getGraph();
  if (graph) {
    console.log(renderGraph(graph));
    console.log();
    console.log(renderGraph(graph, "boxed"));
  }

  const result = await myWorkflow.execute();

  console.log("RESULT:", result);
  console.log(await repository.getById("123"));
}

run().catch(console.error);

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type GraphFormat = "tree" | "boxed";

function renderGraph(node: Node, format: GraphFormat = "tree"): string {
  if (format === "boxed") {
    return renderGraphBoxed(node);
  }
  return renderTree(node, "", true, true);
}

function renderTree(
  node: Node,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
): string {
  const branch = isRoot ? "" : isLast ? "└── " : "├── ";
  const lines = [prefix + branch + node.name];
  const childPrefix = prefix + (isRoot ? "" : isLast ? "    " : "│   ");

  node.childs.forEach((child, i) => {
    lines.push(
      renderTree(child, childPrefix, i === node.childs.length - 1, false),
    );
  });

  return lines.join("\n");
}

type BoxedRender = {
  lines: string[];
  width: number;
  rootCol: number;
};

function renderGraphBoxed(root: Node): string {
  const rendered = renderBoxedNode(root);
  return rendered.lines.map((line) => line.replace(/\s+$/, "")).join("\n");
}

function renderBoxedNode(node: Node): BoxedRender {
  const label = ` ${node.name} `;
  const boxWidth = label.length + 2;
  const center = Math.floor(boxWidth / 2);
  const top = `┌${"─".repeat(boxWidth - 2)}┐`;
  const mid = `│${label}│`;
  const bot = `└${"─".repeat(boxWidth - 2)}┘`;

  if (node.childs.length === 0) {
    return { lines: [top, mid, bot], width: boxWidth, rootCol: center };
  }

  // Bottom of the parent box, with a "┴" at the center where the connector leaves.
  const botMerged = replaceCharAt(bot, center, "┴");

  // Recurse into children.
  const childRenders = node.childs.map(renderBoxedNode);

  // Merge: replace the "─" at each child's rootCol on its top row with "┬" so the
  // vertical connector visually plugs into the box.
  childRenders.forEach((c) => {
    if (c.lines.length > 0) {
      c.lines[0] = replaceCharAt(c.lines[0]!, c.rootCol, "┬");
    }
  });

  // Lay children out horizontally with a fixed gap.
  const gap = 2;
  let cursor = 0;
  const childOffsets = childRenders.map((c) => {
    const off = cursor;
    cursor += c.width + gap;
    return off;
  });
  const childrenWidth = cursor - gap;
  const childHeight = Math.max(...childRenders.map((c) => c.lines.length));

  // Combine children into a single block (uniform width per row).
  const childBlock: string[] = [];
  for (let row = 0; row < childHeight; row++) {
    let line = "";
    childRenders.forEach((child, i) => {
      if (i > 0) line += " ".repeat(gap);
      line += padRight(child.lines[row] ?? "", child.width);
    });
    childBlock.push(line);
  }

  // Center the parent box above the midpoint of its children's centers.
  const childCentersLocal = childRenders.map(
    (c, i) => childOffsets[i]! + c.rootCol,
  );
  const childMid = Math.floor(
    (childCentersLocal[0]! +
      childCentersLocal[childCentersLocal.length - 1]!) /
      2,
  );
  let boxLeft = childMid - center;
  let leftPad = 0;
  if (boxLeft < 0) {
    leftPad = -boxLeft;
    boxLeft = 0;
  }
  const totalWidth = Math.max(boxLeft + boxWidth, childrenWidth + leftPad);
  const parentCenter = boxLeft + center;
  const childCenters = childCentersLocal.map((c) => c + leftPad);

  const lines: string[] = [
    padRight(" ".repeat(boxLeft) + top, totalWidth),
    padRight(" ".repeat(boxLeft) + mid, totalWidth),
    padRight(" ".repeat(boxLeft) + botMerged, totalWidth),
  ];

  // Connector between the parent box and the children's tops.
  if (childRenders.length === 1) {
    lines.push(padRight(" ".repeat(parentCenter) + "│", totalWidth));
  } else {
    // Vertical drop from the parent.
    lines.push(padRight(" ".repeat(parentCenter) + "│", totalWidth));

    // Horizontal bar from first child's center to last child's center.
    const chars = new Array(totalWidth).fill(" ");
    const leftCol = Math.min(childCenters[0]!, parentCenter);
    const rightCol = Math.max(
      childCenters[childCenters.length - 1]!,
      parentCenter,
    );
    for (let col = leftCol; col <= rightCol; col++) {
      chars[col] = "─";
    }
    childCenters.forEach((c, idx) => {
      if (idx === 0) chars[c] = "┌";
      else if (idx === childCenters.length - 1) chars[c] = "┐";
      else chars[c] = "┬";
    });
    // Where the parent connects into the bar.
    if (
      parentCenter > childCenters[0]! &&
      parentCenter < childCenters[childCenters.length - 1]!
    ) {
      const existing = chars[parentCenter];
      if (existing === "─") chars[parentCenter] = "┴";
      else if (existing === "┬") chars[parentCenter] = "┼";
    }
    lines.push(chars.join(""));
  }

  // Children block, shifted right by leftPad if the box overhung to the left.
  childBlock.forEach((line) => {
    lines.push(padRight(" ".repeat(leftPad) + line, totalWidth));
  });

  return { lines, width: totalWidth, rootCol: parentCenter };
}

function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function replaceCharAt(s: string, index: number, char: string): string {
  if (index < 0 || index >= [...s].length) return s;
  const arr = [...s];
  arr[index] = char;
  return arr.join("");
}
