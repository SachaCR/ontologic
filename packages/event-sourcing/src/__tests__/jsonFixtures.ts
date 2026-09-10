/**
 * Builders for shapes the JSON checks are meant to catch but that cannot
 * reasonably be written as literals — a thousand-deep object, or a path long
 * enough to be abbreviated.
 */

/**
 * An object nested `depth` levels deep: `{ n: { n: … { n: {} } } }`.
 *
 * The innermost value is a plain object, so the chain holds `depth + 1`
 * objects in total.
 */
export function buildNestedObject(depth: number): unknown {
  let value: unknown = {};

  for (let index = 0; index < depth; index++) {
    value = { n: value };
  }

  return value;
}

/**
 * An object nested `depth` levels deep whose innermost value is `undefined`,
 * so the failure is reported at the very bottom of the path.
 *
 * Keys count down from the root — `$.k<depth - 1> … .k0.bad` — which makes it
 * visible which end of a long path was kept and which was trimmed.
 */
export function buildDeeplyInvalidObject(depth: number): unknown {
  let value: unknown = { bad: undefined };

  for (let index = 0; index < depth; index++) {
    value = { ["k" + index]: value };
  }

  return value;
}
