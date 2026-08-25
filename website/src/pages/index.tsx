import type { ReactNode } from "react";
import { useState } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import Head from "@docusaurus/Head";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import CodeBlock from "@theme/CodeBlock";

import InstallCommand from "@site/src/components/InstallCommand";

import styles from "./index.module.css";

const INSTALL_CMD = "npm install ontologic";

function GitHubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ marginRight: "0.5rem", verticalAlign: "middle" }}
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function FeatherIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <line x1="16" y1="8" x2="2" y2="22" />
      <line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  );
}

function GoodNewsCorner() {
  const [step, setStep] = useState(0);

  return (
    <div className={styles.heroCorner}>
      {step === 0 && (
        <button
          type="button"
          className={styles.heroCornerButton}
          onClick={() => setStep(1)}
        >
          Read a good news
        </button>
      )}

      {step >= 1 && (
        <span className={styles.heroBadge}>
          <PackageIcon />
          <span>
            <strong>0</strong> dependencies
          </span>
        </span>
      )}

      {step === 1 && (
        <button
          type="button"
          className={styles.heroCornerButton}
          onClick={() => setStep(2)}
        >
          Want another one?
        </button>
      )}

      {step >= 2 && (
        <span className={styles.heroBadge}>
          <FeatherIcon />
          <span>
            <strong>175kB</strong>
          </span>
        </span>
      )}
    </div>
  );
}

function HomepageHeader() {
  return (
    <header className={styles.heroBanner}>
      <GoodNewsCorner />
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          Ontologic
        </Heading>
        <p className={styles.heroSubtitle}>Model What Matters</p>
        <div className={styles.buttons}>
          <Link
            className={clsx("button button--lg", styles.btnPrimary)}
            to="/docs/intro"
          >
            Get started
          </Link>
          <Link
            className={clsx("button button--lg", styles.btnSecondary)}
            to="https://github.com/sachacr/ontologic"
          >
            <GitHubIcon />
            GitHub
          </Link>
        </div>
        <InstallCommand
          command={INSTALL_CMD}
          npmUrl="https://www.npmjs.com/package/ontologic"
          className={styles.install}
        />

        <div className={styles.themeGrid}>
          {themeCards.map((card) => (
            <Link
              key={card.id}
              to={card.anchor}
              className={styles.themeCard}
              style={{ "--accent": card.accent } as React.CSSProperties}
            >
              <span className={styles.themeCardIcon}>{card.icon}</span>
              <span className={styles.themeCardTag}>{card.tag}</span>
              <Heading as="h3" className={styles.themeCardTitle}>
                {card.title}
              </Heading>
              <p className={styles.themeCardDescription}>{card.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

type ConceptSectionProps = {
  id: string;
  tag: string;
  title: string;
  description: ReactNode;
  link: string;
  linkLabel: string;
  code: string;
  codeTitle: string;
  accent: string;
  reverse?: boolean;
  hasBackground?: boolean;
};

function SectionDivider({ title, id }: { title: string; id?: string }) {
  return (
    <div className={styles.sectionDivider}>
      <div className="container">
        <Heading as="h2" id={id} className={styles.sectionDividerTitle}>
          {title}
        </Heading>
      </div>
    </div>
  );
}

type ThemeCard = {
  id: string;
  tag: string;
  accent: string;
  title: string;
  description: string;
  anchor: string;
  icon: ReactNode;
};

function DomainModelIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function WorkflowsIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="11.49" />
    </svg>
  );
}

function EventBusIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

const themeCards: ThemeCard[] = [
  {
    id: "theme-domain-model",
    tag: "Domain Model",
    accent: "#6366f1",
    title: "Model your business",
    description:
      "Entities, events, invariants and the Result pattern are primitives that keep your domain logic explicit, protected, and easy to test.",
    anchor: "#domain-model",
    icon: <DomainModelIcon />,
  },
  {
    id: "theme-event-bus",
    tag: "Event Bus",
    accent: "#8b5cf6",
    title: "Deliver every event",
    description:
      "Built-in outbox pattern, pluggable connectors for any broker, and a message relay that resumes after crashes without losing events.",
    anchor: "#event-bus-builtin",
    icon: <EventBusIcon />,
  },
  {
    id: "theme-workflows",
    tag: "Workflows",
    accent: "#22c55e",
    title: "Orchestrate multi-step processes",
    description:
      "Step-by-step workflows for linear pipelines and graph workflows for parallel branches. Both typed end to end and resumable after failure.",
    anchor: "#workflows",
    icon: <WorkflowsIcon />,
  },
];

function ScrollSeparator() {
  const handleScrollDown = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById("domain-model");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.pushState(null, "", "#domain-model");
    }
  };

  return (
    <div className={styles.scrollSeparator}>
      <span className={styles.scrollSeparatorLabel}>Discover</span>
      <a
        href="#domain-model"
        onClick={handleScrollDown}
        className={styles.scrollSeparatorButton}
        aria-label="Scroll to Domain Model section"
      >
        <svg
          className={styles.scrollSeparatorChevron}
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </a>
    </div>
  );
}

function DomainModelBanner() {
  return (
    <div className={styles.videoSection}>
      <div className="container">
        <Heading
          as="h2"
          id="domain-model"
          className={styles.sectionDividerTitle}
        >
          Domain Model
        </Heading>
        <div className={styles.videoWrapper}>
          <video controls autoPlay>
            <source src="/videos/Introduction.mp4" />
          </video>
        </div>
        <details className={styles.videoTranscript}>
          <summary>What this video covers</summary>
          <p>
            A walk-through of how Ontologic models a domain in TypeScript.
            Entities own their state and expose behavior rather than setters.
            Invariants. Rules like “balance must stay positive” are checked on
            every state read, so corrupted data is caught the moment it enters
            the system. Domain events record what happened in past tense,
            immutably, and form a versioned contract for the rest of the system.
            The Result pattern makes expected failures (insufficient funds,
            validation errors) into typed return values that callers cannot
            ignore. The Repository persists entity state and events atomically
            in the same transaction.
          </p>
        </details>
      </div>
    </div>
  );
}

function ConceptSection({
  id,
  tag,
  title,
  description,
  link,
  linkLabel,
  code,
  codeTitle,
  accent,
  reverse,
  hasBackground,
}: ConceptSectionProps) {
  return (
    <section
      className={clsx(
        styles.conceptSection,
        hasBackground && styles.conceptSectionAlt,
      )}
    >
      <div className="container">
        <div
          className={clsx(
            styles.conceptInner,
            reverse && styles.conceptInnerReverse,
          )}
        >
          <div className={styles.conceptText}>
            <span
              className={styles.conceptTag}
              style={{ "--accent": accent } as React.CSSProperties}
            >
              {tag}
            </span>
            <Heading as="h2" id={id} className={styles.conceptTitle}>
              {title}
            </Heading>
            <div className={styles.conceptDescription}>{description}</div>
            <Link className="button button--primary" to={link}>
              {linkLabel}
            </Link>
          </div>
          <div className={styles.conceptCode}>
            <CodeBlock language="typescript" title={codeTitle}>
              {code}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

const domainModelSections: ConceptSectionProps[] = [
  {
    id: "domain-entities",
    tag: "Domain Entity",
    accent: "#6366f1",
    title: "Entities that protect themselves",
    description: (
      <>
        <p>
          A Domain Entity owns its state. External code can read it, but cannot
          mutate it directly. The entity is the single authority on what it can
          and cannot do.
        </p>
        <p>
          No more validation logic scattered across services and controllers.
          The rules live where they belong.
        </p>
      </>
    ),
    link: "/docs/domain-model/domain-entity",
    linkLabel: "Learn about Domain Entities",
    codeTitle: "bank-account.ts",
    code: `class BankAccount extends DomainEntity<State> {
  deposit(amount: number): MoneyDeposited {
    this.state.balance += amount;
    return new MoneyDeposited(this.id(), { amount });
  }

  withdraw(amount: number)
    : Result<MoneyWithdrawn, InsufficientFunds> {

    if (this.state.balance < amount) {
      return err(new InsufficientFunds({
        available: this.state.balance,
        requested: amount,
      }));
    }
    this.state.balance -= amount;
    return ok(new MoneyWithdrawn(this.id(), { amount }));
  }
}`,
  },
  {
    id: "domain-events",
    tag: "Domain Events",
    accent: "#10b981",
    title: "History you can trust",
    description: (
      <>
        <p>
          A Domain Event is a record that something meaningful happened — past
          tense, immutable, and named after a business fact.
        </p>
        <p>
          Events are a versioned contract. Once consumers depend on them, they
          are public API. The Outbox pattern ensures every saved event is
          eventually delivered, with no risk of silent loss.
        </p>
      </>
    ),
    link: "/docs/domain-model/domain-events",
    linkLabel: "Learn about Domain Events",
    codeTitle: "money-withdrawn.event.ts",
    code: `class MoneyWithdrawn extends DomainEvent<
  "MONEY_WITHDRAWN",
  1,
  { amount: number }
> {
  constructor(entityId: string, payload: { amount: number }) {
    super({ name: "MONEY_WITHDRAWN", version: 1,
            entityId, payload });
  }
}

// Payload is deep-cloned at construction — immutable
const event = new MoneyWithdrawn(account.id(), { amount: 200 });
event.payload.amount = 0; // has no effect`,
  },
  {
    id: "invariants",
    tag: "Invariants",
    accent: "#ec4899",
    title: "Rules that never sleep",
    description: (
      <>
        <p>
          An invariant is a rule that must always be true — not just after
          certain operations, but at all times, including when loading data from
          the database.
        </p>
        <p>
          Invariants are checked on every state read. Corrupted data is caught
          the moment it enters the system, before it can cause any damage.
        </p>
      </>
    ),
    link: "/docs/domain-model/invariants",
    linkLabel: "Learn about Invariants",
    codeTitle: "bank-account.invariants.ts",
    code: `const balanceIsPositive =
  new BaseDomainInvariant<BankAccountState>(
    "Balance must be positive",
    (state) => state.balance >= 0
  );

const balanceIsUnderLimit =
  new BaseDomainInvariant<BankAccountState>(
    "Balance is under limit",
    (state) => state.balance <= 1_000_000
  );

// Compose with logical operators
const validBalance =
  balanceIsPositive.and(balanceIsUnderLimit);`,
  },
  {
    id: "result-pattern",
    tag: "Result Pattern",
    accent: "#f59e0b",
    title: "Failures with meaning",
    description: (
      <>
        <p>
          Not all failures are unexpected. In a business domain, some failures
          are entirely normal — and the caller should be expected to handle
          them.
        </p>
        <p>
          The Result pattern makes this explicit. Domain failures are typed
          return values, not hidden exceptions. The type system forces callers
          to deal with every outcome.
        </p>
      </>
    ),
    link: "/docs/domain-model/result-pattern",
    linkLabel: "Learn about the Result Pattern",
    codeTitle: "debit-balance.use-case.ts",
    code: `class InsufficientFunds extends DomainError<
  "INSUFFICIENT_FUNDS",
  { available: number; requested: number }
> {}

// The caller cannot ignore the failure case
const result = account.withdraw(500);

if (result.isErr()) {
  console.log(result.error.context.available);
  return;
}

// TypeScript knows we succeeded here
await repository.saveWithEvents(account, [result.value]);`,
  },
  {
    id: "repository",
    tag: "Repository",
    accent: "#3b82f6",
    title: "Persistence without compromise",
    description: (
      <>
        <p>
          The Repository hides all database details behind a clean,
          domain-friendly interface. Your entities stay free of infrastructure
          concerns and remain easy to test.
        </p>
        <p>
          Saving an entity and its events in the same transaction guarantees
          consistency. You get both, or neither — never a state change without a
          record of what happened.
        </p>
      </>
    ),
    link: "/docs/domain-model/repository",
    linkLabel: "Learn about the Repository",
    codeTitle: "bank-account.repository.ts",
    code: `// Extend the built-in generic — no boilerplate needed
class BankAccountRepository
  extends InMemoryRepository<BankAccount> {
  constructor() {
    super(BankAccount.fromState);
  }
}

// Ready for tests and prototyping instantly
const repository = new BankAccountRepository();

// Entity state and event saved atomically
await repository.saveWithEvents(account, result.value);`,
  },
];

const eventBusSections: ConceptSectionProps[] = [
  {
    id: "event-bus",
    tag: "Event Bus",
    accent: "#8b5cf6",
    title: "Deliver events to your system",
    description: (
      <>
        <p>
          The Event Bus handles delivery of domain events to the rest of your
          system. A pluggable connector interface keeps the publisher and
          listener logic independent of any specific broker.
        </p>
        <p>
          Swap the connector to target SQS, Kafka, RabbitMQ, Redis, or any other
          broker. In-memory connectors are included for tests and local
          prototyping.
        </p>
      </>
    ),
    link: "/docs/event-bus",
    linkLabel: "Learn about the Event Bus",
    codeTitle: "order-events.listener.ts",
    code: `const listener = new DomainEventBusListener<OrderEvents>({
  listenerConnector: myConnector,
  options: { validator: parseOrderEvents },
});

listener.listenTo("ORDER_PLACED", async (event, metadata) => {
  // event is a real OrderPlaced instance
  await notifyWarehouse(event.payload.orderId);
});

listener.listenTo("PAYMENT_RECEIVED", async (event, metadata) => {
  await generateInvoice(event.payload);
});

await listener.start();`,
  },
  {
    id: "message-relay",
    tag: "Message Relay",
    accent: "#06b6d4",
    title: "Deliver every event, survive every failure",
    description: (
      <>
        <p>
          The Message Relay reads events from the outbox table and forwards them
          to the event bus. It tracks exactly what has been published, so after
          a crash it resumes precisely where it left off.
        </p>
        <p>
          Each event is checkpointed individually. A failure mid-batch never
          causes events to be skipped or the relay to restart from scratch.
        </p>
      </>
    ),
    link: "/docs/event-bus/message-relay",
    linkLabel: "Learn about the Message Relay",
    codeTitle: "message-relay.ts",
    code: `const relay = new MessageRelay(
  repository,
  new InMemoryMessageRelayStateRepository(),
  "Order",
  publisher,
);

relay.onError((error) => {
  logger.error("relay error", { error });
});

// Trigger the relay whenever an entity is saved
repository.onChanges(relay.handler);`,
  },
];

const workflowSections: ConceptSectionProps[] = [
  {
    id: "step-workflow",
    tag: "Step Workflow",
    accent: "#22c55e",
    title: "Step by step processes",
    description: (
      <>
        <p>
          A Step by step Workflow threads typed steps into a sequential
          pipeline. Each step's output flows into the next step's input, and the
          type system enforces the order, reordering the chain is a compile
          error.
        </p>
        <p>
          Plug in a repository and the state is persisted in any case. A crashed
          run resumes exactly where it left off, with no re-execution of work
          that already succeeded.
        </p>
      </>
    ),
    link: "/docs/workflows/step-workflow",
    linkLabel: "Learn about Step Workflows",
    codeTitle: "step-workflow.ts",
    code: `const workflow = new WorkflowBuilder<SepaPaymentRequest>({
  id: randomUUID(),
  name: "SEPA Payment",
  input: { accountId, receiverIban, amount },
})
  .addStep(checkAccountBalance)
  .addStep(checkReceiverIsValid)
  .addStep(checkAmlRisk)
  .addStep(createSepaTransfer);

// Persist the state, resume after a crash
const transfer = await workflow.execute(repository);`,
  },
  {
    id: "graph-workflow",
    tag: "Graph Workflow",
    accent: "#22c55e",
    title: "Complex Workflow with parallel branches",
    description: (
      <>
        <p>
          A Graph Workflow is a DAG of nodes. Each node names its children, runs
          them concurrently, and receives their outputs as a typed record.
        </p>
        <p>
          Same observability, persistence, and resume guarantees as the step
          flavor. A crashed run skips any node whose result is already persisted
          and re-runs only what's missing.
        </p>
      </>
    ),
    link: "/docs/workflows/graph-workflow",
    linkLabel: "Learn about Graph Workflows",
    codeTitle: "graph-workflow.ts",
    code: `class SepaWorkflow extends GraphWorkflow<Inputs, Transfer> {
  constructor(params: { id: string; input: Inputs }) {
    super({ ...params, name: "SEPA", repository });
    this.build((input) => this.#root(input));
  }

  #root(input: Inputs) {
    const balance = new WorkflowNode({
      name: "Check Balance", children: {},
      handler: async () => ({ ok: input.amount <= 3000 }),
    });
    const aml = new WorkflowNode({
      name: "AML Check", children: {},
      handler: async () => ({ score: 0.12 }),
    });
    return new WorkflowNode({
      name: "Create Transfer",
      children: { balance, aml },
      handler: async ({ balance, aml }) =>
        buildTransfer(input, balance, aml),
    });
  }
}`,
  },
];

function EventBusBanner() {
  return (
    <div className={styles.videoSection}>
      <div className="container">
        <Heading
          as="h2"
          id="event-bus-builtin"
          className={styles.sectionDividerTitle}
        >
          Built-In Event Bus
        </Heading>
        <p className={styles.videoSectionSubtitle}>
          (powered by outbox pattern)
        </p>
        <div className={styles.videoWrapper}>
          <video controls width="30%" loop autoPlay>
            <source src="/videos/MessageRelay.mp4" />
          </video>
        </div>
        <details className={styles.videoTranscript}>
          <summary>What this video covers</summary>
          <p>
            A demo of the outbox pattern built into Ontologic. Domain events are
            written to an outbox in the same transaction as the entity state,
            guaranteeing they cannot be lost on a crash. The Message Relay reads
            from the outbox, forwards events to the event bus, and checkpoints
            each one individually so after a failure, delivery resumes precisely
            where it stopped, with no skipped events and no need to restart the
            relay from scratch. Pluggable connectors let you target SQS, Kafka,
            RabbitMQ, Redis, or any other broker without touching the publisher
            or listener logic.
          </p>
        </details>
      </div>
    </div>
  );
}

function WorkflowsBanner() {
  return (
    <div className={styles.videoSection}>
      <div className="container">
        <Heading as="h2" id="workflows" className={styles.sectionDividerTitle}>
          Workflows
        </Heading>
        <div className={styles.videoWrapper}>
          <video controls autoPlay>
            <source src="/videos/Workflow.mp4" />
          </video>
        </div>
        <details className={styles.videoTranscript}>
          <summary>What this video covers</summary>
          <p>
            A tour of Ontologic's two workflow flavors. Step workflows thread
            typed steps into a sequential pipeline. Each step's output feeds the
            next step's input, and the type system rejects out-of-order
            composition at compile time. Graph workflows model the same idea as
            a directed acyclic graph: each node names its children, runs them
            concurrently, and receives their results as a typed record. Both
            flavors persist state to a repository, so when a multi-step business
            process crashes mid-run, you simply restart the workflow and it
            resumes from the last completed step. No recovery scripts, no
            replaying already-successful work.
          </p>
        </details>
      </div>
    </div>
  );
}

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "Ontologic",
  description:
    "Ontologic is a TypeScript toolkit for Domain-Driven Design: typed entities, invariants, domain events with built-in outbox pattern, and resumable workflows. Zero dependencies.",
  codeRepository: "https://github.com/SachaCR/ontologic",
  programmingLanguage: "TypeScript",
  license: "https://opensource.org/licenses/MIT",
  url: "https://ontologic.site",
  author: {
    "@type": "Person",
    name: "Sacha Clerc-Renaud",
  },
};

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Ontologic — TypeScript DDD toolkit: typed entities, invariants, domain events with outbox pattern, and resumable workflows. Zero dependencies."
    >
      <Head>
        <meta
          name="keywords"
          content="TypeScript DDD, Domain-Driven Design TypeScript, TypeScript DDD library, outbox pattern TypeScript, domain events TypeScript, resumable workflows, TypeScript saga, aggregate TypeScript, invariants TypeScript"
        />
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Head>
      <HomepageHeader />
      <main>
        <ScrollSeparator />
        <DomainModelBanner />
        {domainModelSections.map((section, idx) => (
          <ConceptSection
            key={section.id}
            {...section}
            reverse={idx % 2 === 1}
            hasBackground={idx % 2 === 1}
          />
        ))}

        <EventBusBanner />
        {eventBusSections.map((section, idx) => (
          <ConceptSection
            key={section.id}
            {...section}
            reverse={idx % 2 === 1}
            hasBackground={idx % 2 === 1}
          />
        ))}

        <WorkflowsBanner />
        {workflowSections.map((section, idx) => (
          <ConceptSection
            key={section.id}
            {...section}
            reverse={idx % 2 === 1}
            hasBackground={idx % 2 === 1}
          />
        ))}
      </main>
    </Layout>
  );
}
