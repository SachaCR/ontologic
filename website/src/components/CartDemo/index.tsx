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
 * Client-only, via `BrowserOnly`, and not merely because a widget nobody can
 * click is of little use pre-hydration. `apply` deep-clones the state with
 * `structuredClone` and then checks the clone is JSON-compatible, and that
 * check compares the prototype against *this* realm's `Object.prototype`.
 * Docusaurus evaluates its server bundle inside a `vm` context, so the host's
 * `structuredClone` returns an object carrying the *outer* realm's prototype —
 * a perfectly plain object that the check nonetheless rejects, failing the
 * whole site build with "The new state is not JSON compatible". Rendering only
 * in the browser keeps every object in one realm.
 */

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import BrowserOnly from "@docusaurus/BrowserOnly";

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
const cartProjection = new EventProjection<CartState, CartEvent>("Cart");

cartProjection.mountCreationEventApplier("CART_CREATED", ({ event }) => ({
  cartId: event.payload.cartId,
  currency: event.payload.currency,
  lines: [],
}));

cartProjection.mountEventApplier("ITEM_ADDED", ({ event, state }) => {
  const existing = state.lines.find((line) => line.sku === event.payload.sku);

  // Adding a sku already in the cart bumps its quantity rather than opening a
  // second line for the same product.
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
});

cartProjection.mountEventApplier("ITEM_REMOVED", ({ event, state }) => ({
  ...state,
  lines: state.lines.filter((line) => line.sku !== event.payload.sku),
}));

cartProjection.mountEventApplier(
  "ITEM_QUANTITY_CHANGED",
  ({ event, state }) => ({
    ...state,
    lines: state.lines.map((line) =>
      line.sku === event.payload.sku
        ? { ...line, quantity: event.payload.quantity }
        : line,
    ),
  }),
);

// ── Demo data and helpers ───────────────────────────────────────────────────

type CatalogItem = { sku: string; name: string; unitPrice: number };

const CATALOG: CatalogItem[] = [
  { sku: "MUG", name: "Ontologic Mug", unitPrice: 1200 },
  { sku: "TEE", name: "Model What Matters Tee", unitPrice: 3600 },
  { sku: "NOTES", name: "Domain Field Notes", unitPrice: 2400 },
];

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

function CartDemoClient({ className }: Props): ReactNode {
  const [events, setEvents] = useState<CartEvent[]>(() => [cartCreated()]);

  /** `null` means "follow the head of the stream". */
  const [viewedVersion, setViewedVersion] = useState<number | null>(null);

  /** Payload revealed by hover or focus; falls back to the pinned row. */
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [pinnedVersion, setPinnedVersion] = useState<number | null>(null);

  const latestVersion = events.length;
  const shown = viewedVersion ?? latestVersion;
  const isScrubbed = shown < latestVersion;

  // The fold. `shown` is never below 1, so the slice always starts with
  // CART_CREATED and `apply` always has its creation event.
  //
  // Every one of `apply`'s five error paths is excluded by construction, so the
  // catch should never fire. It is here because a throw in render unmounts the
  // whole React tree for the page: if an applier above is ever edited into
  // returning something the JSON check rejects, the reader should see which
  // error it was, not a blank article.
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
  const total = state.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  function record(event: CartEvent) {
    setEvents((previous) => [...previous, event]);
    setViewedVersion(null);
  }

  function reset() {
    setEvents([cartCreated()]);
    setViewedVersion(null);
    setOpenVersion(null);
    setPinnedVersion(null);
  }

  /** Move the viewed version without touching which payload is revealed. */
  function scrubTo(version: number) {
    setViewedVersion(version === latestVersion ? null : version);
  }

  function jumpToLatest() {
    setViewedVersion(null);
    setPinnedVersion(null);
    setOpenVersion(null);
  }

  /** A row click does both jobs: scrub there, and pin its payload open. */
  function selectEvent(version: number) {
    scrubTo(version);
    const nextPin = pinnedVersion === version ? null : version;
    setPinnedVersion(nextPin);
    setOpenVersion(nextPin);
  }

  return (
    <div className={clsx(styles.demo, className)}>
      <div className={styles.panels}>
        {/* ── Cart state ── */}
        <section className={styles.cart} aria-label="Cart state">
          <header className={styles.cartHeader}>
            <h4 className={styles.panelTitle}>
              Cart state{" "}
              <span className={styles.version}>
                {isScrubbed ? `at v${shown}` : `v${shown}`}
              </span>
            </h4>
            <p className={styles.derived}>
              <strong>{itemCount}</strong> {itemCount === 1 ? "item" : "items"} ·{" "}
              <strong>{formatCents(total)}</strong>
              <span className={styles.derivedNote}>derived, not stored</span>
            </p>
          </header>

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
                + {item.name}
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

          <ol className={styles.events}>
            {events.map((event, index) => {
              const version = index + 1;
              const isFuture = version > shown;
              const isOpen = openVersion === version;

              return (
                <li key={version}>
                  <button
                    type="button"
                    className={clsx(
                      styles.event,
                      isFuture && styles.eventFuture,
                      pinnedVersion === version && styles.eventPinned,
                    )}
                    aria-expanded={isOpen}
                    aria-controls={`cart-demo-payload-${version}`}
                    onMouseEnter={() => setOpenVersion(version)}
                    onMouseLeave={() => setOpenVersion(pinnedVersion)}
                    onFocus={() => setOpenVersion(version)}
                    onBlur={() => setOpenVersion(pinnedVersion)}
                    onClick={() => selectEvent(version)}
                  >
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

export default function CartDemo({ className }: Props): ReactNode {
  return (
    <BrowserOnly
      fallback={
        <div className={clsx(styles.demo, className)}>
          <p className={styles.fallback}>Loading the interactive cart…</p>
        </div>
      }
    >
      {() => <CartDemoClient className={className} />}
    </BrowserOnly>
  );
}
