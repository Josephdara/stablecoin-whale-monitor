import type { Metadata } from "next";
import { DocsPage, H2 } from "../../../components/docs/DocsPage";
import { Callout } from "../../../components/ui";
import { CONFIRMATION_SECONDS, COVERAGE } from "../../../lib/config";
import { groupInteger } from "../../../lib/format";

export const metadata: Metadata = { title: "Product guide" };

const T = groupInteger(COVERAGE.indexThreshold);
const DAYS = COVERAGE.retentionDays;

export default function GuidePage() {
  return (
    <DocsPage
      section="Get started"
      title="Product guide"
      lead="How to find transfers, use filters, and read the results."
      note="Values in this guide are the current configuration defaults."
      toc={[
        { id: "what", label: "What the monitor does" },
        { id: "qualifies", label: "What qualifies" },
        { id: "filters", label: "Filtering the feed" },
        { id: "lookup", label: "Looking up a transaction" },
        { id: "details", label: "Reading transfer details" },
        { id: "mint-burn", label: "Mint and burn" },
        { id: "freshness", label: "Freshness" },
        { id: "retention", label: "Retention" },
        { id: "maintenance", label: "Maintenance" },
        { id: "faq", label: "Common questions" },
      ]}
      previous={{ href: "/docs/", label: "Overview" }}
      next={{ href: "/docs/api/", label: "API reference" }}
    >
      <H2 id="what">What the monitor does</H2>
      <p>
        Stablecoin Whale Monitor records large USDC and USDT transfers on Ethereum mainnet and shows them newest first.
        You can narrow the list, open any transfer to see its full record, look up a transaction, and follow links to
        Etherscan to check each record against the chain.
      </p>
      <p>The monitor is public and read-only. There is no sign-in and no wallet connection.</p>

      <H2 id="qualifies">What qualifies</H2>
      <p>A transfer is recorded when all of these are true:</p>
      <ul>
        <li>
          It is a <code>Transfer</code> event from the USDC contract <code>0xa0b8…eb48</code> or the USDT contract{" "}
          <code>0xdac1…1ec7</code> on Ethereum mainnet (chain ID 1).
        </li>
        <li>Its amount is at or above the indexing threshold, currently {T} tokens. Both tokens use 6 decimals.</li>
        <li>Its block is at least {COVERAGE.confirmationBlocks} blocks behind the newest block.</li>
      </ul>
      <Callout tone="info">
        <p>Transfers under the threshold are never stored. Lowering the minimum amount filter below {T} cannot show them.</p>
      </Callout>

      <H2 id="filters">Filtering the feed</H2>
      <p>
        Three filters can be combined. Each applied filter appears as a chip above the results. Remove a chip to drop
        that filter, or use Reset all.
      </p>
      <table className="dtbl">
        <thead><tr><th scope="col">Filter</th><th scope="col">Accepts</th><th scope="col">Matches</th></tr></thead>
        <tbody>
          <tr><td>Token</td><td>All, USDC or USDT</td><td>Transfers of that token</td></tr>
          <tr><td>Minimum amount</td><td>A number with up to 6 decimal places. Commas are removed</td><td>Transfers at or above the amount, in tokens</td></tr>
          <tr><td>Address</td><td><code>0x</code> plus 40 hexadecimal characters</td><td>Transfers where the address is the sender or the receiver</td></tr>
        </tbody>
      </table>
      <p>
        Copy the page URL to share your filters, for example <code>/monitor/?token=USDT&amp;min=250000</code>.
        The total counts all transfers that match your filters across all pages. The per-token counts split that
        total into USDC and USDT.
      </p>
      <p>
        Results are pages of {COVERAGE.pageSize}. Use Older and Newer to move between pages. Shared links always open
        at the newest transfers.
      </p>

      <H2 id="lookup">Looking up a transaction</H2>
      <p>
        Paste a transaction hash to find matching transfers in the last {DAYS} days. A single transaction may contain
        several matching transfers.
      </p>

      <H2 id="details">Reading transfer details</H2>
      <p>
        Select a transfer to view its details. Automatic refresh pauses while the details are open. Copy the URL to
        share the selected transfer.
      </p>
      <table className="dtbl">
        <thead><tr><th scope="col">Field</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
          <tr><td>Amount</td><td>The full amount in token units, with an abbreviated value alongside it.</td></tr>
          <tr><td>Raw amount</td><td>The same value as an integer in base units. With 6 decimals, 1 token is 1,000,000 base units.</td></tr>
          <tr><td>From, To</td><td>Sender and receiver addresses in full. Addresses are not labeled and do not identify their owners.</td></tr>
          <tr><td>Transfer type</td><td>Mint, burn or transfer. See below.</td></tr>
          <tr><td>Block, block time</td><td>Where and when the transfer happened on chain, in UTC.</td></tr>
          <tr><td>Log index</td><td>The position of this event inside its block. Together with the transaction hash it identifies the transfer.</td></tr>
          <tr><td>Transaction</td><td>The transaction hash, with a link to Etherscan.</td></tr>
          <tr><td>Token contract</td><td>The USDC or USDT contract that emitted the event.</td></tr>
          <tr><td>Detected at</td><td>When the indexer recorded the transfer. It is later than the block time by the confirmation buffer and polling delay.</td></tr>
          <tr><td>Threshold</td><td>The indexing threshold in force when the transfer was recorded.</td></tr>
        </tbody>
      </table>

      <H2 id="mint-burn">Mint and burn</H2>
      <p>Classification uses only the zero address, <code>0x0000…0000</code>:</p>
      <ul>
        <li><strong>Mint.</strong> The sender is the zero address. New tokens were created.</li>
        <li><strong>Burn.</strong> The receiver is the zero address. Tokens were removed from supply.</li>
        <li>Everything else is a normal transfer.</li>
      </ul>
      <p>
        Not every change in supply shows up this way. USDT issuance and redemption, for example, use the contract&apos;s
        own Issue and Redeem events rather than a Transfer to or from the zero address, so they are not indexed as mints
        or burns.
      </p>

      <H2 id="freshness">Freshness</H2>
      <p>A transfer is not shown the moment it is mined. It passes through four steps:</p>
      <ol className="steps">
        <li className="card"><span className="small strong">Confirmation</span><br /><span className="small muted">{COVERAGE.confirmationBlocks} blocks, about {CONFIRMATION_SECONDS} s</span></li>
        <li className="card"><span className="small strong">Indexer poll</span><br /><span className="small muted">Up to {COVERAGE.pollIntervalSeconds} s</span></li>
        <li className="card"><span className="small strong">API refresh</span><br /><span className="small muted">Up to {COVERAGE.apiRefreshSeconds} s</span></li>
        <li className="card"><span className="small strong">Monitor refresh</span><br /><span className="small muted">Up to {COVERAGE.monitorRefreshSeconds} s, or press Refresh now</span></li>
      </ol>
      <p>
        The configured confirmation and refresh intervals suggest a delay of roughly 1 to 3 minutes. The status strip
        at the top of the monitor shows three signals to help you check freshness:
      </p>
      <ul>
        <li><strong>API:</strong> whether the last request succeeded.</li>
        <li><strong>Index refreshed:</strong> when the API last reloaded stored transfers.</li>
        <li><strong>Chain progress:</strong> the last block the indexer finished and how old that checkpoint is.</li>
      </ul>
      <p>
        The confirmation buffer reduces exposure to chain reorganizations but is not a finality guarantee. Records
        already published are not rewritten if a deeper reorganization happens.
      </p>

      <H2 id="retention">Retention</H2>
      <p>
        The monitor keeps {DAYS} days of transfers, based on block time. Totals can decrease as older transfers expire.
      </p>

      <H2 id="maintenance">Maintenance</H2>
      <p>
        During maintenance, the monitor and status pages show the expected return date.
      </p>
      <p>
        After a long pause, history can start later than {DAYS} days ago. The monitor shows the date history starts
        from until the full window has filled in again.
      </p>

      <H2 id="faq">Common questions</H2>
      <dl className="faq">
        <dt>A transfer is on Etherscan but not in the monitor. Why?</dt>
        <dd>
          It may be under {T} tokens, a different token, older than {DAYS} days, or too recent to have passed the
          confirmation buffer and refresh cycle. Check the status page if you expected it within the last few minutes.
        </dd>
        <dt>Can I see the value in US dollars?</dt>
        <dd>No. Amounts are token units as recorded on chain. The monitor does not price tokens.</dd>
        <dt>Who owns this address?</dt>
        <dd>The monitor does not know. It shows addresses only. Any label you find elsewhere is that source&apos;s claim.</dd>
        <dt>Why did the total change when nothing new arrived?</dt>
        <dd>Transfers older than {DAYS} days are removed continuously, so totals can fall between refreshes.</dd>
        <dt>Why did I get &quot;That page is no longer available&quot;?</dt>
        <dd>
          Pages after the first are anchored to a specific transfer. When that transfer ages out of the {DAYS}-day
          window, the page can no longer be built. The monitor starts again from the newest transfers.
        </dd>
        <dt>Can I get alerts for large transfers?</dt>
        <dd>Transfer alerts are currently unavailable.</dd>
        <dt>Is a recorded transfer final?</dt>
        <dd>
          It has at least {COVERAGE.confirmationBlocks} confirmations, which makes a reversal unlikely but not
          impossible. Records are not rewritten after a deep reorganization.
        </dd>
      </dl>
    </DocsPage>
  );
}
