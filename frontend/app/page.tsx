import Link from "next/link";
import type { ReactNode } from "react";
import { CodeBlock } from "../components/CodeBlock";
import { Icon, TokenGlyph } from "../components/Icon";
import { SiteFooter } from "../components/SiteFooter";
import { Amount, Callout, ExampleTag, TokenBadge, TypeBadge } from "../components/ui";
import type { Transfer } from "../lib/api";
import { CONFIRMATION_SECONDS, COVERAGE, MAINTENANCE, SITE, TOKENS } from "../lib/config";
import { formatLongDate, groupInteger } from "../lib/format";

const THRESHOLD = groupInteger(COVERAGE.indexThreshold);
const RETURN_DATE = formatLongDate(MAINTENANCE.expectedReturn);

// Invented values for the illustration only. Always shown with an Example data tag.
const EXAMPLE_ROWS: Array<{ time: string; token: "USDC" | "USDT"; amount: string; type: Transfer["transferType"]; from: string; to: string }> = [
  { time: "14:03 UTC", token: "USDT", amount: "1250000", type: "normal", from: "0xa4c1…216f", to: "0xdaee…9e9c" },
  { time: "14:02 UTC", token: "USDC", amount: "348912.417203", type: "normal", from: "0x3b02…7a76", to: "0x7c76…2cec" },
  { time: "13:56 UTC", token: "USDC", amount: "5000000", type: "mint", from: "0x0000…0000", to: "0xe0ca…3e0a" },
  { time: "13:52 UTC", token: "USDT", amount: "2750000.5", type: "normal", from: "0x8183…9fc3", to: "0x5526…287c" },
  { time: "13:42 UTC", token: "USDC", amount: "12000000", type: "burn", from: "0x611a…142a", to: "0x0000…0000" },
];

const REQUEST_EXAMPLE = `curl "${SITE.origin}/api/transfers?token=USDT&minimumAmount=250000&limit=1"`;

const RESPONSE_EXAMPLE = `{
  "items": [{
    "chain": "ethereum", "chainId": 1,
    "token": "USDT",
    "tokenContract": "${TOKENS.USDT.contract}",
    "from": "0x818319478da6bd0c621de49f145fda9988c79fc3",
    "to": "0x5526f7eaed46725a2a7b860dcd6c8a1f8b46287c",
    "amount": "2750000.5",
    "rawAmount": "2750000500000",
    "threshold": "${COVERAGE.indexThreshold}",
    "blockNumber": 26248680,
    "blockTimestamp": "2026-10-22T13:52:59.000Z",
    "logIndex": 257,
    "transactionHash": "0xced9041d…6fd287db7",
    "transactionStatus": "success",
    "transferType": "normal",
    "detectedAt": "2026-10-22T13:54:41.512Z"
  }],
  "nextCursor": "eyJrZXkiOiIxOjB4Y2VkOTA0…",
  "total": 312,
  "counts": { "USDC": 0, "USDT": 312 },
  "refreshedAt": "2026-10-22T14:02:31.204Z"
}`;

export default function HomePage() {
  const paused = MAINTENANCE.paused;

  return (
    <>
      <main id="content">
        <section className="hero">
          <svg className="hero-rings" aria-hidden="true" viewBox="0 0 800 800" fill="none">
            <circle cx="400" cy="400" r="380" stroke="#00CFFF" strokeWidth="1" />
            <circle cx="400" cy="400" r="290" stroke="#2FD3B6" strokeWidth="1" />
            <circle cx="400" cy="400" r="200" stroke="#00CFFF" strokeWidth="1" />
            <circle cx="400" cy="400" r="110" stroke="#2FD3B6" strokeWidth="1" />
          </svg>
          <div className="wrap hero-grid">
            <div className="stack gap-24">
              <span className="pill" style={{ alignSelf: "flex-start" }}>
                <TokenGlyph token="USDC" />USDC
                <TokenGlyph token="USDT" />USDT
                <span className="subtle">on Ethereum mainnet</span>
              </span>
              <h1 className="display">See every USDC and USDT transfer of {THRESHOLD} tokens or more on Ethereum.</h1>
              <p className="lead" style={{ maxWidth: 560 }}>
                Stablecoin Whale Monitor records large stablecoin transfers after {COVERAGE.confirmationBlocks} block
                confirmations, keeps them for {COVERAGE.retentionDays} days, and links each one to its on-chain record
                so you can verify it yourself.
              </p>
              {paused ? (
                <Callout tone="paused">
                  The monitor is resting until {RETURN_DATE}. The live feed and API are switched off during
                  maintenance. Everything else on this site works as usual.
                </Callout>
              ) : null}
              <div className="wrap-row gap-12">
                {paused ? (
                  <>
                    <Link className="btn btn-primary btn-lg" href="/docs/">Read documentation</Link>
                    <Link className="btn btn-secondary btn-lg" href="/status/">See maintenance details</Link>
                  </>
                ) : (
                  <>
                    <Link className="btn btn-primary btn-lg" href="/monitor/">
                      Open monitor
                      <Icon name="arrow" />
                    </Link>
                    <Link className="btn btn-secondary btn-lg" href="/docs/">Read documentation</Link>
                  </>
                )}
              </div>
              <div className="facts" aria-label="Coverage">
                <Fact label="Tokens" value="USDC, USDT" />
                <Fact label="Network" value={COVERAGE.network} />
                <Fact label="Qualifies at" value={`${THRESHOLD} tokens`} />
                <Fact label="Confirmation" value={`${COVERAGE.confirmationBlocks} blocks`} />
                <Fact label="Retention" value={`${COVERAGE.retentionDays} days`} />
              </div>
            </div>

            <figure className="stack gap-10">
              <div className="panel" style={{ overflow: "hidden" }}>
                <div className="row spread gap-12" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                  <div className="row gap-8">
                    <img className="logo" src="/logo.png" alt="" width={20} height={20} />
                    <span className="small strong">Transfer monitor</span>
                  </div>
                  <ExampleTag />
                </div>
                <div className="wrap-row gap-8" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
                  <span className="chip static"><span className="k">Token</span>All</span>
                  <span className="chip static"><span className="k">Min</span><span className="num">{THRESHOLD}</span></span>
                  <span className="small subtle num" style={{ marginLeft: "auto" }}>5 example transfers</span>
                </div>
                <div className="scroll-x">
                  <table className="tbl compact">
                    <caption className="sr-only">Example transfers, not live data</caption>
                    <thead>
                      <tr>
                        <th scope="col">Time</th>
                        <th scope="col">Token</th>
                        <th scope="col" className="r">Amount</th>
                        <th scope="col">From</th>
                        <th scope="col">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {EXAMPLE_ROWS.map((row) => (
                        <tr key={row.time + row.amount}>
                          <td className="small subtle num">{row.time}</td>
                          <td><TokenBadge token={row.token} /></td>
                          <td className="r">
                            <span className="row gap-8" style={{ justifyContent: "flex-end" }}>
                              <TypeBadge type={row.type} />
                              <Amount value={row.amount} />
                            </span>
                          </td>
                          <td><span className={`addr ${row.from.startsWith("0x0000") ? "zero" : ""}`}>{row.from}</span></td>
                          <td><span className={`addr ${row.to.startsWith("0x0000") ? "zero" : ""}`}>{row.to}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <figcaption className="small subtle">
                Illustration of the monitor using example data. Addresses and amounts are not real transfers.
              </figcaption>
            </figure>
          </div>
        </section>

        {paused ? (
          <section className="sec" aria-labelledby="available-h">
            <div className="wrap stack gap-24">
              <div className="sec-head">
                <span className="overline">Available during maintenance</span>
                <h2 className="h2" id="available-h">Everything except the live feed works.</h2>
              </div>
              <div className="grid-auto-240">
                <QuickLink href="/docs/guide/" title="Product guide" text="What qualifies, filters, freshness and limits" />
                <QuickLink href="/docs/api/" title="API reference" text="Endpoints, schema and error codes, ready for when the API returns" />
                <QuickLink href="/docs/architecture/" title="Architecture and security" text="How the indexer, storage and API fit together" />
                <QuickLink href="/status/" title="Status" text="What is paused and when it returns" />
              </div>
            </div>
          </section>
        ) : null}

        <section className="sec" aria-labelledby="how-h">
          <div className="wrap stack" style={{ gap: 40 }}>
            <div className="sec-head">
              <span className="overline">How it works</span>
              <h2 className="h1" id="how-h">Observe, filter, inspect, verify.</h2>
            </div>
            <ol className="plain-list grid-auto-240">
              <Step n="01" icon="api" title="Observe">
                The indexer reads Transfer logs from the USDC and USDT contracts {COVERAGE.confirmationBlocks} blocks
                behind the chain tip and records every transfer of {THRESHOLD} tokens or more.
              </Step>
              <Step n="02" icon="filters" title="Filter">
                Narrow the feed by token, a higher minimum amount, or one address on either side of the transfer. Each
                view has its own link you can share.
              </Step>
              <Step n="03" icon="search" title="Inspect">
                Open a transfer for the exact amount, raw base units, block, log index and the time it was recorded.
                Look up a transaction to see all of its qualifying transfers.
              </Step>
              <Step n="04" icon="external" title="Verify">
                Every transaction, address and block links to Etherscan, so you can check each record against the
                chain yourself.
              </Step>
            </ol>
          </div>
        </section>

        <section className="sec" aria-labelledby="who-h">
          <div className="wrap stack" style={{ gap: 40 }}>
            <div className="sec-head">
              <span className="overline">Who it is for</span>
              <h2 className="h1" id="who-h">One record of large transfers, three ways to use it.</h2>
            </div>
            <div className="grid-auto-320">
              <Audience title="Analysts" href="/docs/guide/#details" link="Reading transfer details">
                Research large movements, mints and burns without wading through every small transfer. Start from the
                feed, open a transfer, and take the transaction hash to Etherscan or your own tools.
              </Audience>
              <Audience title="Treasury and operations" href="/docs/guide/#filters" link="Filtering by address">
                Follow an address you care about. The address filter matches the sender or the receiver, and the link
                keeps the filter, so a teammate opens exactly the same view.
              </Audience>
              <Audience title="Developers" href="/docs/api/" link="API reference">
                Read the same records from a small read-only JSON API with exact decimal amounts, raw base units,
                cursor pagination and a health endpoint that reports freshness.
              </Audience>
            </div>
          </div>
        </section>

        <section className="sec" aria-labelledby="data-h">
          <div className="wrap grid-split">
            <div className="stack gap-20">
              <span className="overline">Data and freshness</span>
              <h2 className="h1" id="data-h">Where the data comes from and how current it is.</h2>
              <p className="muted">
                A transfer appears in the monitor after the confirmation buffer plus the indexer and API refresh
                intervals. That is usually under three minutes after its block, not instantly.
              </p>
              <dl className="kv-list">
                <dt>Source</dt>
                <dd>Transfer logs on {COVERAGE.network} (chain ID {COVERAGE.chainId}), read over JSON-RPC</dd>
                <dt>USDC contract</dt>
                <dd><span className="full-hex">{TOKENS.USDC.contract}</span></dd>
                <dt>USDT contract</dt>
                <dd><span className="full-hex">{TOKENS.USDT.contract}</span></dd>
                <dt>Confirmation buffer</dt>
                <dd className="num">{COVERAGE.confirmationBlocks} blocks, about {CONFIRMATION_SECONDS} seconds</dd>
                <dt>Refresh cadence</dt>
                <dd className="num">
                  Indexer polls every {COVERAGE.pollIntervalSeconds} s. API reloads every {COVERAGE.apiRefreshSeconds} s
                </dd>
                <dt>Retention</dt>
                <dd className="num">{COVERAGE.retentionDays} days, then removed from the API and from storage</dd>
              </dl>
            </div>
            <div className="card pad-28 stack gap-16">
              <h3 className="h3">Limitations</h3>
              <ul className="bullets muted">
                <li>Only USDC and USDT on {COVERAGE.network}. No other tokens, chains or event types.</li>
                <li>Transfers below {THRESHOLD} tokens are never stored, so a lower display filter cannot reveal them.</li>
                <li>Amounts are token units. There is no USD pricing and no total volume.</li>
                <li>Addresses carry no labels. An address does not tell you who owns it.</li>
                <li>History covers the last {COVERAGE.retentionDays} days only.</li>
                <li>
                  {COVERAGE.confirmationBlocks} confirmations reduce exposure to chain reorganizations but do not
                  guarantee finality. Published records are not rewritten after a deep reorganization.
                </li>
              </ul>
              <Link className="small row gap-6" href="/status/">Check current service status<Icon name="arrow" size={14} /></Link>
            </div>
          </div>
        </section>

        <section className="sec" aria-labelledby="dev-h">
          <div className="wrap grid-split">
            <div className="stack gap-20">
              <span className="overline">For developers</span>
              <h2 className="h1" id="dev-h">A small, read-only API.</h2>
              <p className="muted">
                The monitor runs on the same public endpoints you can call. Responses are JSON from the same origin as
                the site. No key is required.
              </p>
              {paused ? (
                <Callout tone="paused">The API is paused until {RETURN_DATE}. Requests to /api will not be answered until then.</Callout>
              ) : null}
              <ul className="bullets small muted" style={{ gap: 8 }}>
                <li><code className="ic-code">GET /api/transfers</code> newest first, filter by token, minimum amount or address, 1 to {COVERAGE.pageSize} per page</li>
                <li><code className="ic-code">GET /api/transfers/{"{txHash}"}</code> every retained qualifying transfer in one transaction</li>
                <li><code className="ic-code">GET /api/health</code> index freshness and chain progress</li>
                <li>
                  {COVERAGE.rateLimitRequests} requests per minute per IP address. Exceeding it returns 429 and blocks
                  for {COVERAGE.rateLimitWindowSeconds} seconds.
                </li>
              </ul>
              <div className="wrap-row gap-12">
                <Link className="btn btn-secondary" href="/docs/api/">API reference</Link>
                <Link className="btn btn-ghost" href="/docs/api/#http200">Why HTTP 200 is not always healthy</Link>
              </div>
            </div>
            <div className="stack gap-12" style={{ minWidth: 0 }}>
              <CodeBlock title="Request" code={REQUEST_EXAMPLE} />
              <CodeBlock title="Response" label="Response · 200" code={RESPONSE_EXAMPLE} example />
              <p className="small subtle">Hash and cursor shortened for display. Real responses return full values.</p>
            </div>
          </div>
        </section>

        <section className="sec" aria-labelledby="infra-h">
          <div className="wrap stack" style={{ gap: 32 }}>
            <div className="row spread gap-24" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="sec-head">
                <span className="overline">Infrastructure and security</span>
                <h2 className="h1" id="infra-h">Built on Google Cloud, locked down by default.</h2>
              </div>
              <Link className="btn btn-secondary" href="/docs/architecture/">Architecture and security docs</Link>
            </div>
            <div className="grid-auto-260">
              <InfraCard title="Two small services">
                An indexer on a single Cloud Run worker pool instance and a read-only API on Cloud Run, behind one HTTPS
                load balancer with the static site.
              </InfraCard>
              <InfraCard title="Private, idempotent storage">
                Events land as deterministic NDJSON objects in a private Cloud Storage bucket. The checkpoint advances
                only after its range is written.
              </InfraCard>
              <InfraCard title="Guarded edge">
                Cloud Armor rate limits the API per IP, the API accepts traffic only from the load balancer, and TLS 1.2
                is the minimum.
              </InfraCard>
              <InfraCard title="Least privilege, gated releases">
                One service account per workload, the RPC URL in Secret Manager, Terraform for infrastructure, and
                approval-gated deploys of immutable image digests.
              </InfraCard>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}


function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span className="caption subtle">{label}</span>
      <span className="small num">{value}</span>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: string; icon: "api" | "filters" | "search" | "external"; title: string; children: ReactNode }) {
  return (
    <li className="card pad-24 stack gap-12">
      <div className="row gap-10 tone-info">
        <Icon name={icon} size={20} />
        <span className="mono subtle">{n}</span>
      </div>
      <h3 className="h3">{title}</h3>
      <p className="small muted">{children}</p>
    </li>
  );
}

function Audience({ title, href, link, children }: { title: string; href: string; link: string; children: ReactNode }) {
  return (
    <article className="card pad-28 stack gap-12">
      <h3 className="h3">{title}</h3>
      <p className="muted">{children}</p>
      <Link className="small row gap-6" href={href} style={{ marginTop: "auto" }}>
        {link}
        <Icon name="arrow" size={14} />
      </Link>
    </article>
  );
}

function InfraCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card pad-24 stack gap-8">
      <h3 className="h4">{title}</h3>
      <p className="small muted">{children}</p>
    </div>
  );
}

function QuickLink({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link className="card pad-20 stack gap-4" href={href} style={{ color: "var(--text)", textDecoration: "none" }}>
      <span className="h4 row gap-8">{title}<Icon name="arrow" size={14} /></span>
      <span className="small muted">{text}</span>
    </Link>
  );
}
