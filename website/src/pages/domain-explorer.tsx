import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import Head from "@docusaurus/Head";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import CodeBlock from "@theme/CodeBlock";

import styles from "./domain-explorer.module.css";

const DEMO = "/demo/library-domain.html";
const COMMAND = "npx @ontologics/domain-explorer ./src/domain";

type Card = {
  id: string;
  accent: string;
  tag: string;
  title: string;
  body: string;
};

const cards: Card[] = [
  {
    id: "discover",
    accent: "#6366f1",
    tag: "Discover",
    title: "Any domain, without setup",
    body:
      "Point it at a codebase built on Ontologic and it reads the model straight " +
      "out of the source. Nothing to annotate, no database, no server — and it " +
      "does not need your dependencies installed.",
  },
  {
    id: "relations",
    accent: "#f59e0b",
    tag: "Relations",
    title: "What depends on what",
    body:
      "What an aggregate holds and what it only names by id. Which repository " +
      "persists it. Which events each behaviour emits, which errors it can " +
      "return, and which views are built from those events.",
  },
  {
    id: "flows",
    accent: "#10b981",
    tag: "Flows",
    title: "Use cases, and how they fail",
    body:
      "Every command and query drawn as an event-storming board: the happy path " +
      "left to right, then one row for each way the use case can be refused.",
  },
];

type Shot = {
  id: string;
  accent: string;
  tag: string;
  title: string;
  body: ReactNode;
  image: string;
  alt: string;
  reverse?: boolean;
};

const shots: Shot[] = [
  {
    id: "board",
    accent: "#10b981",
    tag: "Use case flows",
    title: "Read a use case as a story",
    image: "/img/domain-explorer/use-case-board.png",
    alt:
      "The DeclareBookLostUseCase board: a happy path that reads Book, calls " +
      "declareLost, writes Book and ends in a BookLostEvent, then two failure " +
      "paths ending in BookNotFoundError and BookAlreadyDeclaredLostError.",
    body: (
      <>
        <p className={styles.shotBody}>
          Each row runs left to right as one complete scenario — the command that
          started it, every aggregate it read or wrote, and where it ended.
        </p>
        <p className={styles.shotBody}>
          Failure paths repeat the prefix on purpose, so a refusal reads on its
          own rather than as a branch you have to trace back. Here the two
          refusals come from different places: the repository knows whether the
          copy exists, and only the aggregate knows it was already lost.
        </p>
      </>
    ),
  },
  {
    id: "structure",
    accent: "#eab308",
    tag: "Dependencies",
    title: "See what an aggregate holds",
    image: "/img/domain-explorer/aggregate-graph.png",
    alt:
      "The Loan aggregate page: its invariants, a structure diagram of the " +
      "aggregate and the events it produces, then its behaviours.",
    reverse: true,
    body: (
      <>
        <p className={styles.shotBody}>
          Every object gets one page — its invariants, a diagram of the aggregate
          it belongs to, its behaviours, the events and errors those produce, and
          the repository that stores it.
        </p>
        <p className={styles.shotBody}>
          Follow the same object from anywhere and you land on the same page. The
          kind of the thing decides what you see, never the link you happened to
          click.
        </p>
      </>
    ),
  },
  {
    id: "overview",
    accent: "#6366f1",
    tag: "Overview",
    title: "And where it contradicts itself",
    image: "/img/domain-explorer/overview.png",
    alt:
      "The overview: counters for entities, use cases, events, errors, " +
      "invariants, repositories and read models, above a findings section.",
    body: (
      <>
        <p className={styles.shotBody}>
          Every count opens what it counted. Beneath them, the findings: an
          invariant declared but attached to nothing, an event missing from its
          union, an error whose <code>instanceof</code> is broken at runtime, a
          use case whose failures were widened to <code>Error</code>.
        </p>
        <p className={styles.shotBody}>
          The same pass that builds the model reports them, with the file and
          line to go and fix.
        </p>
      </>
    ),
  },
];

const detected: { label: string; accent: string }[] = [
  { label: "Aggregates and entities", accent: "#eab308" },
  { label: "Value objects", accent: "#6b7280" },
  { label: "Domain events", accent: "#f97316" },
  { label: "Typed errors", accent: "#ef4444" },
  { label: "Invariants", accent: "#db2777" },
  { label: "Repositories", accent: "#334155" },
  { label: "Use cases", accent: "#2563eb" },
  { label: "Commands and queries", accent: "#0d9488" },
  { label: "Read models", accent: "#10b981" },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Ontologic Domain Explorer",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Node.js 20+",
  description:
    "Reads a TypeScript codebase built on Ontologic and generates a single " +
    "self-contained HTML page documenting its domain model: aggregates, events, " +
    "typed errors, invariants, repositories, use cases and read models.",
  url: "https://ontologic.site/domain-explorer",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

function Hero(): ReactNode {
  return (
    <header className={styles.hero}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          Domain Explorer
        </Heading>
        <p className={styles.heroSubtitle}>
          Discover and explore any domain modelled with Ontologic. See the
          dependencies and relations between your objects, and read every use
          case as a flow — including the ways it can fail.
        </p>

        <div className={styles.heroButtons}>
          <Link
            className={`button button--lg ${styles.btnPrimary}`}
            href={DEMO}
            target="_blank"
            rel="noopener"
          >
            Explore the library domain example →
          </Link>
        </div>

        <div className={styles.heroCommand}>
          <CodeBlock language="bash">{COMMAND}</CodeBlock>
          <p className={styles.heroNote}>
            One HTML file out, named after your codebase. Stylesheet, script and
            data all inlined, so it opens from disk and survives being emailed.
          </p>
        </div>

        {/* Inside the hero rather than below it: as its own section it carried a
            second gradient, and the two met in a visible seam. */}
        <div className={styles.cardGrid}>
          {cards.map((card) => (
            <div
              key={card.id}
              className={styles.card}
              style={{ "--accent": card.accent } as React.CSSProperties}
            >
              <span className={styles.cardTag}>{card.tag}</span>
              <Heading as="h2" className={styles.cardTitle}>
                {card.title}
              </Heading>
              <p className={styles.cardBody}>{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

export default function DomainExplorer(): ReactNode {
  return (
    <Layout
      title="Domain Explorer"
      description="Explore any domain modelled with Ontologic: dependencies and relations between objects, and use case flows with their failure paths."
    >
      <Head>
        <meta
          name="keywords"
          content="domain model documentation, DDD explorer, event storming board, TypeScript DDD, Ontologic"
        />
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Head>

      <Hero />

      <main>
        {shots.map((shot, index) => (
          <section
            key={shot.id}
            className={`${styles.shotSection} ${
              index % 2 === 1 ? styles.shotSectionAlt : ""
            }`}
            style={{ "--accent": shot.accent } as React.CSSProperties}
          >
            <div className="container">
              <div
                className={`${styles.shotInner} ${
                  shot.reverse ? styles.shotInnerReverse : ""
                }`}
              >
                <div className={styles.shotText}>
                  <span className={styles.shotTag}>{shot.tag}</span>
                  <Heading as="h2" className={styles.shotTitle}>
                    {shot.title}
                  </Heading>
                  {shot.body}
                </div>
                <figure className={styles.shotFigure}>
                  <a
                    className={styles.shotLink}
                    href={shot.image}
                    target="_blank"
                    rel="noopener"
                    aria-label={`${shot.title} — open the screenshot full size`}
                  >
                    <img
                      className={styles.shotImage}
                      src={shot.image}
                      alt={shot.alt}
                      loading="lazy"
                    />
                    <span className={styles.shotZoom} aria-hidden="true">
                      Full size ↗
                    </span>
                  </a>
                </figure>
              </div>
            </div>
          </section>
        ))}

        <section className={styles.detectSection}>
          <div className="container">
            <div className={styles.detectHead}>
              <Heading as="h2" className={styles.detectTitle}>
                What it finds
              </Heading>
              <p className={styles.shotBody}>
                Detection keys on Ontologic's base classes and type arguments,
                never on filenames — so it works whatever you named your folders,
                and whether your event union lives in its own file or inline.
              </p>
            </div>

            <ul className={styles.detectList}>
              {detected.map((item) => (
                <li
                  key={item.label}
                  className={styles.detectItem}
                  style={{ "--accent": item.accent } as React.CSSProperties}
                >
                  <span className={styles.detectDot} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.closing}>
          <div className="container">
            <Heading as="h2" className={styles.closingTitle}>
              Start with a domain you did not write
            </Heading>
            <p className={styles.closingBody}>
              The library example, generated by the tool itself. Search it, filter
              it, open an aggregate, follow an event to the view built from it.
            </p>
            <div className={styles.heroButtons}>
              <Link
                className={`button button--lg ${styles.btnPrimary}`}
                href={DEMO}
                target="_blank"
                rel="noopener"
              >
                Explore the library domain example →
              </Link>
              <Link
                className={`button button--lg ${styles.btnSecondary}`}
                to="/examples"
              >
                See the examples
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
