/**
 * The command pill from the home page hero: the command, a copy button, and a
 * link to the package on npm.
 *
 * It lives here rather than on a page because two pages now show it, and the
 * copy button carries state — duplicating that is how the two drift apart.
 * Styling is the component's; *placement* is the caller's, passed as
 * `className`, since each hero wants its own margins.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";

import styles from "./styles.module.css";

function NpmIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="#CB3837"
      aria-hidden="true"
    >
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
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
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

type Props = {
  /** The command as the reader should copy it, verbatim. */
  command: string;
  /** The package's page on npm. */
  npmUrl: string;
  /** Placement only — margins and width belong to the hero, not the pill. */
  className?: string;
};

export default function InstallCommand({
  command,
  npmUrl,
  className,
}: Props): ReactNode {
  return (
    <div className={clsx(styles.install, className)}>
      <code>{command}</code>
      <CopyButton text={command} />
      <Link to={npmUrl} className={styles.npmLink} title="View on npm">
        <NpmIcon />
      </Link>
    </div>
  );
}
