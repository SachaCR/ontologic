/**
 * Checks that a value is a plain JavaScript object, JSON-compatible:
 * `JSON.parse(JSON.stringify(x))` yields a structure identical to `x`.
 *
 * Rejected:
 *   - undefined, function, symbol, bigint
 *   - NaN, Infinity, -Infinity (serialized as null)
 *   - class instances and built-ins (Map, Set, RegExp, Date…)
 *   - symbol keys (dropped on serialization)
 *   - circular references
 *   - structures nested deeper than MAX_DEPTH
 *
 * Accepted, by design:
 *   - sparse arrays (holes come back as null)
 *   - null-prototype objects (parsing gives them back Object.prototype)
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonInvalidCode =
  | "unsupported-type"
  | "non-finite-number"
  | "non-plain-object"
  | "symbol-key"
  | "circular-reference"
  | "max-depth-exceeded";

export type JsonValidation =
  | { readonly isValid: true }
  | {
      readonly isValid: false;
      /** Stable discriminant, so callers can branch without parsing `reason`. */
      readonly code: JsonInvalidCode;
      /** Human-readable message, meant for display. Its wording is not stable. */
      readonly reason: string;
      /** Location of the first problem found, e.g. `$.users[1].cb`. */
      readonly path: string;
    };

/**
 * How many nodes a subtree must cost before it gets cached.
 * Below that, re-walking it is cheaper than a WeakSet insertion.
 */
const MEMO_THRESHOLD = 32;

/**
 * Maximum accepted nesting depth.
 *
 * The walk is recursive: without a cap, an over-deep structure throws a
 * RangeError instead of returning a result. The engine's actual limit is
 * unstable — it depends on stack size, engine and JIT state — and sits below
 * JSON.stringify's own limit, which would produce unpredictable false
 * negatives. 1000 is deliberately conservative: well under every measured
 * limit, and far beyond what a realistic JSON payload contains.
 */
const MAX_DEPTH = 1000;

/** Past this, the error path is abbreviated to its head and tail. */
const MAX_PATH_SEGMENTS = 12;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

interface Failure {
  code: JsonInvalidCode;
  reason: string;
  /** Path segments, collected from leaf to root as the stack unwinds. */
  segments: string[];
}

interface Context {
  /**
   * Ancestor chain of the current node. Entries are removed on the way back
   * up, so that an object referenced several times among siblings is not
   * mistaken for a cycle.
   */
  readonly path: WeakSet<object>;
  /**
   * Expensive subtrees already validated, to avoid re-walking them.
   * Only successes are memoized: a failure aborts the whole walk, so a
   * rejected node is never revisited.
   */
  readonly validated: WeakSet<object>;
  /** Global count of visited nodes, used to measure a subtree's cost. */
  visited: number;
  /** Depth of the current node. */
  depth: number;
}

const fail = (code: JsonInvalidCode, reason: string): Failure => ({
  code,
  reason,
  segments: [],
});

/** Returns `null` if the value is valid, otherwise the first problem found. */
function check(value: unknown, ctx: Context): Failure | null {
  if (value === null) return null;

  switch (typeof value) {
    case "string":
    case "boolean":
      return null;

    case "number":
      return Number.isFinite(value)
        ? null
        : fail("non-finite-number", `${value} would be serialized as null`);

    case "object":
      break;

    case "undefined":
      return fail("unsupported-type", "undefined is dropped on serialization");

    case "function":
      return fail("unsupported-type", "a function is dropped on serialization");

    case "symbol":
      return fail("unsupported-type", "a symbol is dropped on serialization");

    case "bigint":
      return fail("unsupported-type", "a bigint makes JSON.stringify throw");

    default:
      return fail("unsupported-type", `non-serializable type: ${typeof value}`);
  }

  const obj = value as object;

  // Order matters: `path` first, so a cycle wins over the cache.
  if (ctx.path.has(obj))
    return fail("circular-reference", "circular reference");

  // Then depth, before the cache: a subtree validated elsewhere may still be
  // too deep from the current position.
  if (ctx.depth >= MAX_DEPTH) {
    return fail("max-depth-exceeded", `nested deeper than ${MAX_DEPTH} levels`);
  }

  if (ctx.validated.has(obj)) return null;

  ctx.path.add(obj);
  ctx.depth++;

  const visitedBefore = ++ctx.visited;

  let failure: Failure | null = null;
  const symbols = Object.getOwnPropertySymbols(obj);

  if (symbols.length > 0) {
    failure = fail(
      "symbol-key",
      `key ${String(symbols[0])} is dropped on serialization`,
    );
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (!(i in obj)) continue; // hole: comes back as null, accepted

      failure = check(obj[i], ctx);

      if (failure) {
        failure.segments.push(`[${i}]`);
        break;
      }
    }
  } else {
    const proto = Object.getPrototypeOf(obj);

    // A plain object is one whose prototype has no prototype of its own —
    // every realm's `Object.prototype` satisfies that, and so does `null`.
    //
    // Comparing against *this* realm's `Object.prototype` by identity instead
    // would reject a perfectly plain object that was built somewhere else: a
    // `vm` context, a `worker_threads` message, an iframe. `structuredClone`
    // returns exactly such an object when the host provides it from outside
    // the running realm, so the stricter test made `EventProjection.apply`
    // reject the clone it had just made of a valid state.
    //
    // `Date`, `Map`, `Set`, `RegExp` and class instances are still rejected:
    // their prototype's prototype is `Object.prototype`, which is not null.
    if (proto !== null && Object.getPrototypeOf(proto) !== null) {
      const name = obj.constructor?.name ?? "?";

      failure = fail(
        "non-plain-object",
        `${name} instance instead of a plain object`,
      );
    } else {
      const record = obj as Record<string, unknown>;

      for (const key of Object.keys(record)) {
        failure = check(record[key], ctx);

        if (failure) {
          failure.segments.push(
            IDENTIFIER.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`,
          );
          break;
        }
      }
    }
  }

  ctx.path.delete(obj); // leaving this branch
  ctx.depth--;

  if (!failure && ctx.visited - visitedBefore >= MEMO_THRESHOLD) {
    ctx.validated.add(obj);
  }

  return failure;
}

function formatPath(segments: string[]): string {
  segments.reverse(); // collected from leaf to root
  if (segments.length <= MAX_PATH_SEGMENTS) return "$" + segments.join("");
  const head = segments.slice(0, 8).join("");
  const tail = segments.slice(-3).join("");
  return `$${head} … (${segments.length - 11} levels) … ${tail}`;
}

/** Validates the value and describes the first problem found, if any. */
export function validateJsonValue(value: unknown): JsonValidation {
  const failure = check(value, {
    path: new WeakSet(),
    validated: new WeakSet(),
    visited: 0,
    depth: 0,
  });

  if (failure === null) return { isValid: true };

  return {
    isValid: false,
    code: failure.code,
    reason: failure.reason,
    path: formatPath(failure.segments),
  };
}

/**
 * Boolean form of {@link validateJsonValue}, for when the verdict is all you
 * need. It is not a type predicate and narrows nothing — use
 * `validateJsonValue` when you want to know *what* is wrong and where.
 */
export function isJsonValue(value: unknown): boolean {
  return validateJsonValue(value).isValid;
}
