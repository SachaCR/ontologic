/**
 * A live event-sourced shopping cart, for the Event Sourcing doc page.
 *
 * This runs the real `@ontologics/event-sourcing`: every click appends an event
 * to a list, and the cart on screen is `EventProjection.apply()` folding that
 * list from scratch on each render. Nothing here reimplements the library, so
 * the page cannot drift from what the package actually does — and the
 * `CartProjection` the docs show is this file's projection, verbatim.
 *
 * Time travel is deliberately non-destructive: viewing version 3 of 5 replays
 * the first three events and leaves the other two in the log, dimmed. The cart
 * buttons go disabled while scrubbed rather than rewriting history from the
 * middle, which is the whole point — an event stream is append-only.
 *
 * Payloads unfold on click, never on hover — see the note on `openVersion`.
 *
 * Server-rendered like the rest of the page, so the cart and its first event
 * are in the HTML before any JavaScript runs. Nothing in render is
 * non-deterministic — no clock, no randomness, no `Intl` — so the server's
 * markup matches the first client render and hydration is quiet.
 *
 * It was briefly wrapped in `BrowserOnly` out of necessity: `apply` deep-clones
 * the state and checked the clone against *this* realm's `Object.prototype` by
 * identity, and Docusaurus evaluates its server bundle in a `vm` context, so
 * the host's `structuredClone` handed back an object carrying the outer realm's
 * prototype — a perfectly plain object the check rejected, failing the whole
 * site build. The package now accepts any realm's plain object, so the wrapper
 * is gone.
 */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import { EventProjection } from "@ontologics/event-sourcing";

import styles from "./styles.module.css";

// ── The domain ──────────────────────────────────────────────────────────────

type CartLine = {
  sku: string;
  name: string;
  /** In cents. Money as a float is a bug waiting for a rounding error. */
  unitPrice: number;
  quantity: number;
};

/**
 * Note what is *not* here: no item count, no total. Both are derived from
 * `lines` at render time. Storing them would mean two places to keep in sync
 * and a state that can contradict itself.
 */
type CartState = {
  cartId: string;
  currency: string;
  lines: CartLine[];
};

type CartCreated = {
  name: "CART_CREATED";
  version: 1;
  payload: { cartId: string; currency: string };
};

type ItemAdded = {
  name: "ITEM_ADDED";
  version: 1;
  payload: { sku: string; name: string; unitPrice: number; quantity: number };
};

type ItemRemoved = {
  name: "ITEM_REMOVED";
  version: 1;
  payload: { sku: string };
};

type ItemQuantityChanged = {
  name: "ITEM_QUANTITY_CHANGED";
  version: 1;
  payload: { sku: string; quantity: number };
};

type CartEvent = CartCreated | ItemAdded | ItemRemoved | ItemQuantityChanged;

// ── The projection ──────────────────────────────────────────────────────────

/**
 * Built once at module scope. A projection holds no state of its own — it is a
 * set of appliers plus a fold — so one instance serves every render and every
 * reader on the page.
 */
const cartProjection = new EventProjection<
  CartState,
  CartEvent,
  "CART_CREATED"
>({
  name: "Cart",

  // Which event brings a cart into existence. Naming it lets a fold start from
  // nothing, and stops a stream replaying it onto a cart that already exists.
  creationEvent: "CART_CREATED",

  // One applier per event. The map is exhaustive over `CartEvent`: leave one
  // out and this does not compile.
  appliers: {
    // Declared like any other applier. The only difference is that it receives
    // no `state` — at the first event there is none, and asking for it would
    // not compile.
    CART_CREATED: ({ event }) => ({
      cartId: event.payload.cartId,
      currency: event.payload.currency,
      lines: [],
    }),

    ITEM_ADDED: ({ event, state }) => {
      const existing = state.lines.find(
        (line) => line.sku === event.payload.sku,
      );

      // Adding a sku already in the cart bumps its quantity rather than
      // opening a second line for the same product.
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((line) =>
            line.sku === event.payload.sku
              ? { ...line, quantity: line.quantity + event.payload.quantity }
              : line,
          ),
        };
      }

      return { ...state, lines: [...state.lines, { ...event.payload }] };
    },

    ITEM_REMOVED: ({ event, state }) => ({
      ...state,
      lines: state.lines.filter((line) => line.sku !== event.payload.sku),
    }),

    ITEM_QUANTITY_CHANGED: ({ event, state }) => ({
      ...state,
      lines: state.lines.map((line) =>
        line.sku === event.payload.sku
          ? { ...line, quantity: event.payload.quantity }
          : line,
      ),
    }),
  },
});

// ── Demo data and helpers ───────────────────────────────────────────────────

type CatalogItem = { sku: string; name: string; unitPrice: number };

const CATALOG: CatalogItem[] = [
  { sku: "APPLE", name: "Apple", unitPrice: 60 },
  { sku: "ORANGE", name: "Orange", unitPrice: 90 },
  { sku: "BANANA", name: "Banana", unitPrice: 40 },
];

/**
 * One hue per kind of fact, so the log can be read by colour before it is read
 * by word: something began, something arrived, something left, something was
 * adjusted. Every hex here is already in use elsewhere on the site.
 *
 * These are fixed colours, not theme variables, so they are only ever used for
 * a border, a caret or a tint — never as a text colour. Amber text on the
 * light theme's #d8dced would fail contrast, and the same value has to work on
 * the dark theme too.
 */
const EVENT_ACCENTS: Record<CartEvent["name"], string> = {
  CART_CREATED: "#6366f1",
  ITEM_ADDED: "#10b981",
  ITEM_REMOVED: "#ef4444",
  ITEM_QUANTITY_CHANGED: "#f59e0b",
};

/** Matches each fruit to its own dot in the catalog row. */
const CATALOG_ACCENTS: Record<string, string> = {
  APPLE: "#22c55e",
  ORANGE: "#f97316",
  BANANA: "#eab308",
};

/**
 * The cart id is a constant, not a `randomUUID()`. The page is
 * server-rendered, so anything random here would differ between the HTML and
 * the first client render and trip a hydration mismatch.
 */
const CART_ID = "cart-7f3a";

function cartCreated(): CartCreated {
  return {
    name: "CART_CREATED",
    version: 1,
    payload: { cartId: CART_ID, currency: "EUR" },
  };
}

/** Deterministic on purpose — `Intl` would resolve differently under SSR. */
function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

// ── The component ───────────────────────────────────────────────────────────

type Props = {
  /** Placement only — margins belong to the page, not the demo. */
  className?: string;
};

export default function CartDemo({ className }: Props): ReactNode {
  const [events, setEvents] = useState<CartEvent[]>(() => [cartCreated()]);

  /** `null` means "follow the head of the stream". */
  const [viewedVersion, setViewedVersion] = useState<number | null>(null);

  /**
   * Which row has its payload open. Click-only, deliberately: revealing on
   * hover meant every mouse move re-rendered the list, and once a payload
   * expanded it pushed the rows below it out from under the cursor — which
   * fired mouseleave, collapsed the payload, moved the row back, and flickered
   * for as long as the pointer sat there. With ~15 events it was unusable.
   */
  const [openVersion, setOpenVersion] = useState<number | null>(null);

  const logRef = useRef<HTMLOListElement>(null);

  const latestVersion = events.length;
  const shown = viewedVersion ?? latestVersion;
  const isScrubbed = shown < latestVersion;

  // The fold. `shown` is never below 1, so the slice always starts with
  // CART_CREATED and `apply` always has its creation event.
  //
  // Every one of `apply`'s error paths is excluded by construction, so the
  // catch should never fire. It is here because this component renders during
  // `docusaurus build`: a throw would fail the whole site build, not merely
  // blank this panel. If an applier above is ever edited into returning
  // something the JSON check rejects, the page should say which error it was.
  const view = useMemo<
    { ok: true; state: CartState } | { ok: false; error: string }
  >(() => {
    try {
      const { state } = cartProjection.apply({
        events: events.slice(0, shown),
      });
      return { ok: true, state };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [events, shown]);

  /**
   * Keep the newest event in view: once the log overflows its panel, an
   * appended event lands below the fold and the reader has to go looking for
   * the thing they just caused.
   *
   * Keyed on the event count alone, deliberately. Depending on `shown` or
   * `openVersion` too would mean clicking an early row to inspect it scrolled
   * the list away from that very row.
   */
  useEffect(() => {
    const log = logRef.current;

    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [events.length]);

  /**
   * Bring a freshly unfolded payload into view. Unfolding the last event was
   * the worst case: the log is already scrolled to the bottom, so the payload
   * opens entirely below the fold and the reader has to scroll to see the
   * thing they just asked for.
   *
   * Measured with rects rather than `offsetTop`, which is relative to the
   * nearest positioned ancestor and not to the scrollport. Only the log's own
   * `scrollTop` is touched, never `scrollIntoView`, so the article behind the
   * demo never moves under the reader.
   */
  useEffect(() => {
    const log = logRef.current;

    if (!log || openVersion === null) {
      return;
    }

    const row = log.querySelector<HTMLElement>(
      `[data-version="${openVersion}"]`,
    );

    if (!row) {
      return;
    }

    const logBox = log.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();

    if (rowBox.height >= logBox.height || rowBox.top < logBox.top) {
      // Taller than the scrollport, or hanging off the top: align its top.
      log.scrollTop += rowBox.top - logBox.top;
    } else if (rowBox.bottom > logBox.bottom) {
      log.scrollTop += rowBox.bottom - logBox.bottom;
    }
  }, [openVersion]);

  if (!view.ok) {
    return (
      <div className={clsx(styles.demo, className)}>
        <p className={styles.error}>
          The cart projection could not fold this stream:{" "}
          <code>{view.error}</code>
        </p>
      </div>
    );
  }

  const state = view.state;
  const itemCount = state.lines.reduce((count, l) => count + l.quantity, 0);
  const total = state.lines.reduce(
    (sum, l) => sum + l.unitPrice * l.quantity,
    0,
  );

  function record(event: CartEvent) {
    setEvents((previous) => [...previous, event]);
    setViewedVersion(null);
  }

  function reset() {
    setEvents([cartCreated()]);
    setViewedVersion(null);
    setOpenVersion(null);
  }

  /** Move the viewed version without touching which payload is revealed. */
  function scrubTo(version: number) {
    setViewedVersion(version === latestVersion ? null : version);
  }

  function jumpToLatest() {
    setViewedVersion(null);
    setOpenVersion(null);
  }

  /** A row click does both jobs: scrub there, and toggle its payload open. */
  function selectEvent(version: number) {
    scrubTo(version);
    setOpenVersion(openVersion === version ? null : version);
  }

  return (
    <div className={clsx(styles.demo, className)}>
      <div className={styles.panels}>
        {/* ── Cart state ── */}
        <section className={styles.cart} aria-label="Cart state">
          <h4 className={styles.panelTitle}>
            Cart state{" "}
            <span className={styles.version}>
              {isScrubbed ? `at v${shown}` : `v${shown}`}
            </span>
          </h4>
          {state.lines.length === 0 ? (
            <p className={styles.empty}>
              The cart is empty. It has one event so far — the fact that it
              exists.
            </p>
          ) : (
            <ul className={styles.lines}>
              {state.lines.map((line) => (
                <li key={line.sku} className={styles.line}>
                  <span className={styles.lineName}>{line.name}</span>
                  <span className={styles.lineQty}>
                    <button
                      type="button"
                      className={styles.stepper}
                      disabled={isScrubbed || line.quantity <= 1}
                      aria-label={`Decrease quantity of ${line.name}`}
                      onClick={() =>
                        record({
                          name: "ITEM_QUANTITY_CHANGED",
                          version: 1,
                          payload: {
                            sku: line.sku,
                            quantity: line.quantity - 1,
                          },
                        })
                      }
                    >
                      −
                    </button>
                    <span className={styles.qtyValue}>{line.quantity}</span>
                    <button
                      type="button"
                      className={styles.stepper}
                      disabled={isScrubbed}
                      aria-label={`Increase quantity of ${line.name}`}
                      onClick={() =>
                        record({
                          name: "ITEM_QUANTITY_CHANGED",
                          version: 1,
                          payload: {
                            sku: line.sku,
                            quantity: line.quantity + 1,
                          },
                        })
                      }
                    >
                      +
                    </button>
                  </span>
                  <span className={styles.linePrice}>
                    {formatCents(line.unitPrice * line.quantity)}
                  </span>
                  <button
                    type="button"
                    className={styles.remove}
                    disabled={isScrubbed}
                    aria-label={`Remove ${line.name}`}
                    onClick={() =>
                      record({
                        name: "ITEM_REMOVED",
                        version: 1,
                        payload: { sku: line.sku },
                      })
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className={styles.derived}>
            <strong>{itemCount}</strong> {itemCount === 1 ? "item" : "items"} ·{" "}
            <span className={styles.total}>{formatCents(total)}</span>
            <span className={styles.derivedNote}>derived, not stored</span>
          </p>

          <div className={styles.catalog}>
            {CATALOG.map((item) => (
              <button
                key={item.sku}
                type="button"
                className={styles.add}
                disabled={isScrubbed}
                onClick={() =>
                  record({
                    name: "ITEM_ADDED",
                    version: 1,
                    payload: { ...item, quantity: 1 },
                  })
                }
              >
                <span
                  className={styles.dot}
                  style={
                    { "--accent": CATALOG_ACCENTS[item.sku] } as CSSProperties
                  }
                  aria-hidden="true"
                />
                {item.name}
                <span className={styles.addPrice}>
                  {formatCents(item.unitPrice)}
                </span>
              </button>
            ))}
          </div>

          {isScrubbed && (
            <p className={styles.hint} role="status">
              You are looking at history. The stream is append-only, so the cart
              can only change at its head —{" "}
              <button
                type="button"
                className={styles.inlineLink}
                onClick={jumpToLatest}
              >
                jump to v{latestVersion}
              </button>{" "}
              to keep shopping.
            </p>
          )}
        </section>

        {/* ── Event log ── */}
        <section className={styles.log} aria-label="Event stream">
          <h4 className={styles.panelTitle}>
            Event stream <span className={styles.version}>{latestVersion}</span>
          </h4>

          <ol className={styles.events} ref={logRef}>
            {events.map((event, index) => {
              const version = index + 1;
              const isFuture = version > shown;
              const isOpen = openVersion === version;

              return (
                <li
                  key={version}
                  data-version={version}
                  style={
                    { "--accent": EVENT_ACCENTS[event.name] } as CSSProperties
                  }
                >
                  <button
                    type="button"
                    className={clsx(
                      styles.event,
                      isFuture && styles.eventFuture,
                      isOpen && styles.eventOpen,
                    )}
                    aria-expanded={isOpen}
                    aria-controls={`cart-demo-payload-${version}`}
                    onClick={() => selectEvent(version)}
                  >
                    <span className={styles.caret} aria-hidden="true">
                      ›
                    </span>
                    <span className={styles.eventVersion}>v{version}</span>
                    <span className={styles.eventName}>{event.name}</span>
                    {isFuture && (
                      <span className={styles.srOnly}>
                        — not yet applied at the version you are viewing
                      </span>
                    )}
                  </button>
                  <pre
                    id={`cart-demo-payload-${version}`}
                    className={styles.payload}
                    hidden={!isOpen}
                  >
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </li>
              );
            })}
          </ol>

          <div className={styles.controls}>
            <label className={styles.scrubber}>
              <span className={styles.srOnly}>Cart version</span>
              <input
                type="range"
                min={1}
                max={latestVersion}
                value={shown}
                disabled={latestVersion === 1}
                onChange={(e) => scrubTo(Number(e.target.value))}
              />
            </label>
            <p className={styles.readout} role="status">
              Viewing <strong>v{shown}</strong> of {latestVersion}
            </p>
            <div className={styles.buttons}>
              <button
                type="button"
                className={styles.control}
                disabled={!isScrubbed}
                onClick={jumpToLatest}
              >
                Jump to latest
              </button>
              <button
                type="button"
                className={styles.control}
                disabled={latestVersion === 1}
                onClick={reset}
              >
                Reset
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
