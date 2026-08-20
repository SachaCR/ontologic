import ts from "typescript";

/**
 * Reading repository use out of a class body.
 *
 * Shared by use cases and read models: both are plain classes that take
 * repositories as constructor parameters and act on them, and both need the
 * same two answers — which parameter is which repository, and which of those
 * they read from versus write to.
 */

/** Repository methods that only observe. */
export const READ_METHODS = new Set([
  "getById",
  "list",
  "getEvents",
  "getEventsAfter",
]);

/** Repository methods that persist. */
export const WRITE_METHODS = new Set(["save", "saveWithEvents"]);

export const READ_PREFIXES = /^(find|search|count|get|list)/;

/**
 * Dependencies are constructor parameters — `constructor(private readonly
 * orders: OrderRepository)`. In the body they are reached as `this.orders`,
 * which `analyseRepositoryAccess` resolves by taking the last dotted segment.
 */
export function repositoryBindingsOfClass(
  node: ts.ClassDeclaration,
  repositoryNames: Set<string>,
): Map<string, string> {
  const sf = node.getSourceFile();
  const bindings = new Map<string, string>();

  const record = (
    nameNode: ts.BindingName | ts.PropertyName,
    typeNode: ts.TypeNode | undefined,
  ): void => {
    if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return;

    const typeName = typeNode.typeName.getText(sf);
    if (!repositoryNames.has(typeName)) return;

    bindings.set(nameNode.getText(sf), typeName);
  };

  const constructor = node.members.find(ts.isConstructorDeclaration);
  for (const parameter of constructor?.parameters ?? []) {
    record(parameter.name, parameter.type);
  }

  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member)) record(member.name, member.type);
  }

  return bindings;
}

/** Which repositories the body reads from, and which it writes to. */
export function analyseRepositoryAccess(
  body: ts.Node | undefined,
  bindings: Map<string, string>,
  sf: ts.SourceFile,
): { reads: string[]; writes: string[] } {
  const reads = new Set<string>();
  const writes = new Set<string>();

  if (!body) return { reads: [], writes: [] };

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.getText(sf);
      // Strip any `this.` or `dependencies.` prefix so every style resolves to
      // the same binding.
      const receiver =
        n.expression.expression.getText(sf).split(".").pop() ?? "";

      const repository = bindings.get(receiver);

      if (repository) {
        if (WRITE_METHODS.has(method)) writes.add(repository);
        else if (READ_METHODS.has(method) || READ_PREFIXES.test(method)) {
          reads.add(repository);
        }
      }
    }

    ts.forEachChild(n, visit);
  };

  visit(body);

  return { reads: [...reads], writes: [...writes] };
}
