import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage, H2 } from "../../components/docs/DocsPage";
import { Icon } from "../../components/Icon";
import { Callout } from "../../components/ui";
import { CONFIRMATION_SECONDS, COVERAGE, MAINTENANCE, TOKENS } from "../../lib/config";
import { formatLongDate, groupInteger } from "../../lib/format";

export const metadata: Metadata = { title: "Documentation" };

const SECTIONS = [
  { href: "/docs/guide/", title: "Product guide", text: "What qualifies, how to filter and look up transactions, how to read a transfer, freshness and limits." },
  { href: "/docs/api/", title: "API reference", text: "The three read-only endpoints, parameters, schemas, cursor pagination and error codes." },
  { href: "/docs/architecture/", title: "Architecture and security", text: "How the indexer, storage, API and edge fit together, and how each piece is protected." },
  { href: "/docs/operations/", title: "Operations", text: "Local development, configuration, deployment, verification, maintenance and rollback." },
  { href: "/docs/history/", title: "Version history", text: "Earlier designs of the system, kept as historical records." },
];

export default function DocsOverview() {
  const threshold = groupInteger(COVERAGE.indexThreshold);
  return (
    <DocsPage
      section="Overview"
      title="Documentation"
      lead="Everything you need to use the monitor, call the API and understand how the system works."
      toc={[
        { id: "what", label: "What it does" },
        { id: "coverage", label: "Coverage" },
        { id: "sections", label: "Sections" },
      ]}
      next={{ href: "/docs/guide/", label: "Product guide" }}
    >
      {MAINTENANCE.paused ? (
        <Callout tone="paused">
          <p>
            Monitoring is paused for maintenance and is expected to resume on {formatLongDate(MAINTENANCE.expectedReturn)}.
          </p>
        </Callout>
      ) : null}

      <H2 id="what">What it does</H2>
      <p>
        Stablecoin Whale Monitor is a public, read-only record of large USDC and USDT transfers on Ethereum mainnet. It
        watches only transfers of {threshold} tokens or more, waits for {COVERAGE.confirmationBlocks} confirmations
        before recording them, keeps {COVERAGE.retentionDays} days of history, and links every record to Etherscan so
        you can check it against the chain.
      </p>
      <p>It serves three kinds of reader:</p>
      <ul>
        <li><strong>Analysts</strong> researching large movements, mints and burns.</li>
        <li><strong>Treasury and operations teams</strong> following an address and sharing the same view with colleagues.</li>
        <li><strong>Developers</strong> reading the same records from a small JSON API.</li>
      </ul>
      <p>There is no sign-in and no wallet connection.</p>

      <H2 id="coverage">Coverage</H2>
      <dl className="facts-table">
        <dt>Network</dt><dd>{COVERAGE.network}, chain ID {COVERAGE.chainId}</dd>
        <dt>Tokens</dt>
        <dd>
          USDC <code>{TOKENS.USDC.contract}</code>
          <br />
          USDT <code>{TOKENS.USDT.contract}</code>
        </dd>
        <dt>Qualifies at</dt><dd>{threshold} tokens or more</dd>
        <dt>Confirmation</dt><dd>{COVERAGE.confirmationBlocks} blocks, about {CONFIRMATION_SECONDS} seconds</dd>
        <dt>Retention</dt><dd>{COVERAGE.retentionDays} days</dd>
        <dt>Estimated delay</dt><dd>Roughly 1 to 3 minutes after the block</dd>
      </dl>
      <p className="small subtle" style={{ fontSize: 14 }}>
        These are the configured defaults. The delay estimate is based on the confirmation and refresh intervals.
      </p>

      <H2 id="sections">Sections</H2>
      <div className="stack gap-12" style={{ marginBottom: 20 }}>
        {SECTIONS.map((section) => (
          <Link key={section.href} className="card pad-20 stack gap-4" href={section.href} style={{ color: "var(--text)", textDecoration: "none" }}>
            <span className="h4 row gap-8">{section.title}<Icon name="arrow" size={14} /></span>
            <span className="small muted">{section.text}</span>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
