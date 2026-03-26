import type {ReactNode} from 'react';
import {useState} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

const INSTALL_CMD = 'npm install ontologic';

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{marginRight: '0.5rem', verticalAlign: 'middle'}}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function NpmIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#CB3837" aria-hidden="true">
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/>
    </svg>
  );
}

function CopyButton({text}: {text: string}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      className={styles.copyButton}
      onClick={handleCopy}
      aria-label="Copy to clipboard"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function HomepageHeader() {
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          Ontologic
        </Heading>
        <p className={styles.heroSubtitle}>
          A toolkit for building software that speaks your domain's language.
        </p>
        <div className={styles.buttons}>
          <Link className={clsx('button button--lg', styles.btnPrimary)} to="/docs/intro">
            Get started
          </Link>
          <Link className={clsx('button button--lg', styles.btnSecondary)} to="https://github.com/sachacr/ontologic">
            <GitHubIcon />
            GitHub
          </Link>
        </div>
        <div className={styles.install}>
          <code>{INSTALL_CMD}</code>
          <CopyButton text={INSTALL_CMD} />
          <Link
            to="https://www.npmjs.com/package/ontologic"
            className={styles.npmLink}
            title="View on npm"
          >
            <NpmIcon />
          </Link>
        </div>
      </div>
    </header>
  );
}

type ConceptSectionProps = {
  tag: string;
  title: string;
  description: ReactNode;
  link: string;
  linkLabel: string;
  code: string;
  codeTitle: string;
  accent: string;
  reverse?: boolean;
};

function ConceptSection({tag, title, description, link, linkLabel, code, codeTitle, accent, reverse}: ConceptSectionProps) {
  return (
    <section className={clsx(styles.conceptSection, reverse && styles.conceptSectionReverse)}>
      <div className="container">
        <div className={clsx(styles.conceptInner, reverse && styles.conceptInnerReverse)}>
          <div className={styles.conceptText}>
            <span className={styles.conceptTag} style={{'--accent': accent} as React.CSSProperties}>
              {tag}
            </span>
            <Heading as="h2" className={styles.conceptTitle}>{title}</Heading>
            <div className={styles.conceptDescription}>{description}</div>
            <Link className="button button--primary" to={link}>
              {linkLabel}
            </Link>
          </div>
          <div className={styles.conceptCode}>
            <CodeBlock language="typescript" title={codeTitle}>{code}</CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

const conceptSections: ConceptSectionProps[] = [
  {
    tag: 'Domain Entity',
    accent: '#6366f1',
    title: 'Entities that protect themselves',
    description: (
      <>
        <p>A Domain Entity owns its state. External code can read it, but cannot mutate it directly. The entity is the single authority on what it can and cannot do.</p>
        <p>No more validation logic scattered across services and controllers. The rules live where they belong.</p>
      </>
    ),
    link: '/docs/domain-entity',
    linkLabel: 'Learn about Domain Entities',
    codeTitle: 'bank-account.ts',
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
    tag: 'Domain Events',
    accent: '#10b981',
    title: 'History you can trust',
    description: (
      <>
        <p>A Domain Event is a record that something meaningful happened — past tense, immutable, and named after a business fact.</p>
        <p>Events are a versioned contract. Once consumers depend on them, they are public API. The Outbox pattern ensures every saved event is eventually delivered, with no risk of silent loss.</p>
      </>
    ),
    link: '/docs/domain-events',
    linkLabel: 'Learn about Domain Events',
    codeTitle: 'money-withdrawn.event.ts',
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
    tag: 'Invariants',
    accent: '#ec4899',
    title: 'Rules that never sleep',
    description: (
      <>
        <p>An invariant is a rule that must always be true — not just after certain operations, but at all times, including when loading data from the database.</p>
        <p>Invariants are checked on every state read. Corrupted data is caught the moment it enters the system, before it can cause any damage.</p>
      </>
    ),
    link: '/docs/invariants',
    linkLabel: 'Learn about Invariants',
    codeTitle: 'bank-account.invariants.ts',
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
    tag: 'Result Pattern',
    accent: '#f59e0b',
    title: 'Failures with meaning',
    description: (
      <>
        <p>Not all failures are unexpected. In a business domain, some failures are entirely normal — and the caller should be expected to handle them.</p>
        <p>The Result pattern makes this explicit. Domain failures are typed return values, not hidden exceptions. The type system forces callers to deal with every outcome.</p>
      </>
    ),
    link: '/docs/result-pattern',
    linkLabel: 'Learn about the Result Pattern',
    codeTitle: 'debit-balance.use-case.ts',
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
    tag: 'Repository',
    accent: '#3b82f6',
    title: 'Persistence without compromise',
    description: (
      <>
        <p>The Repository hides all database details behind a clean, domain-friendly interface. Your entities stay free of infrastructure concerns and remain easy to test.</p>
        <p>Saving an entity and its events in the same transaction guarantees consistency. You get both, or neither — never a state change without a record of what happened.</p>
      </>
    ),
    link: '/docs/repository',
    linkLabel: 'Learn about the Repository',
    codeTitle: 'bank-account.repository.ts',
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

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="A TypeScript toolkit for Domain-Driven Design">
      <HomepageHeader />
      <main>
        {conceptSections.map((section, idx) => (
          <ConceptSection key={idx} {...section} reverse={idx % 2 === 1} />
        ))}
      </main>
    </Layout>
  );
}
