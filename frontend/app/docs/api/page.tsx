import type { Metadata } from "next";
import { CodeBlock } from "../../../components/CodeBlock";
import { DocsPage, H2, H3 } from "../../../components/docs/DocsPage";
import { Callout } from "../../../components/ui";
import { COVERAGE, MAINTENANCE, SITE, TOKENS } from "../../../lib/config";
import { formatLongDate } from "../../../lib/format";

export const metadata: Metadata = { title: "API reference" };

const BASE = SITE.origin;
const MAX = COVERAGE.pageSize;
const TX = "0xced9041dff02cee737443e210471948d33296c87009e8a7f770d9106fd287db7";

const TRANSFER_JSON = `{
  "chain": "ethereum",
  "chainId": 1,
  "token": "USDT",
  "tokenContract": "${TOKENS.USDT.contract}",
  "transactionHash": "${TX}",
  "blockNumber": 26248680,
  "blockTimestamp": "2026-10-22T13:52:59.000Z",
  "logIndex": 257,
  "from": "0x818319478da6bd0c621de49f145fda9988c79fc3",
  "to": "0x5526f7eaed46725a2a7b860dcd6c8a1f8b46287c",
  "rawAmount": "2750000500000",
  "amount": "2750000.5",
  "threshold": "${COVERAGE.indexThreshold}",
  "transactionStatus": "success",
  "transferType": "normal",
  "detectedAt": "2026-10-22T13:54:41.512Z"
}`;

const indent = (text: string, spaces: number) => text.split("\n").map((line, i) => (i ? " ".repeat(spaces) + line : line)).join("\n");

const LIST_RESPONSE = `{
  "items": [
    ${indent(TRANSFER_JSON, 4)}
  ],
  "nextCursor": "eyJrZXkiOiIxOjB4Y2VkOTA0MWRmZjAyY2VlNzM3NDQzZTIxMDQ3MTk0OGQzMzI5NmM4NzAwOWU4YTdmNzcwZDkxMDZmZDI4N2RiNzoyNTcifQ",
  "total": 312,
  "counts": { "USDC": 0, "USDT": 312 },
  "refreshedAt": "2026-10-22T14:04:52.204Z"
}`;

const TX_RESPONSE = `{
  "transactionHash": "${TX}",
  "items": [
    ${indent(TRANSFER_JSON, 4)},
    { "...": "a second qualifying transfer, logIndex 240" }
  ],
  "total": 2,
  "refreshedAt": "2026-10-22T14:04:52.204Z"
}`;

const HEALTH_RESPONSE = `{
  "status": "ok",
  "chainId": 1,
  "lastProcessedBlock": 26248735,
  "chainHeadBlock": ${26248735 + COVERAGE.confirmationBlocks},
  "checkpointUpdatedAt": "2026-10-22T14:04:29.118Z",
  "checkpointAgeSeconds": 41,
  "retentionDays": ${COVERAGE.retentionDays},
  "indexThreshold": "${COVERAGE.indexThreshold}",
  "confirmationBuffer": ${COVERAGE.confirmationBlocks},
  "pollIntervalSeconds": ${COVERAGE.pollIntervalSeconds},
  "indexedEvents": 4812,
  "indexRefreshedAt": "2026-10-22T14:04:52.204Z",
  "indexError": null,
  "lastRefreshError": null,
  "checkpointError": null
}`;

const BIGINT_EXAMPLE = `const units = BigInt(item.rawAmount); // 2750000500000n
const whole = units / 1_000_000n;      // 2750000n`;

export default function ApiPage() {
  return (
    <DocsPage
      section="API reference"
      title="API reference"
      lead="Three read-only JSON endpoints that serve the same records as the monitor."
      toc={[
        { id: "overview", label: "Overview" },
        { id: "transfers", label: "GET /api/transfers" },
        { id: "amounts", label: "amount and rawAmount" },
        { id: "cursor", label: "Pagination and cursor expiry" },
        { id: "counts", label: "What total and counts mean" },
        { id: "errors", label: "Errors" },
        { id: "transaction", label: "GET /api/transfers/{txHash}" },
        { id: "health", label: "GET /api/health" },
        { id: "http200", label: "HTTP 200 is not always healthy" },
      ]}
      previous={{ href: "/docs/guide/", label: "Product guide" }}
      next={{ href: "/docs/architecture/", label: "Architecture and security" }}
    >
      {MAINTENANCE.paused ? (
        <Callout tone="paused">
          <p>
            The API is paused for maintenance and is expected to resume on {formatLongDate(MAINTENANCE.expectedReturn)}.
          </p>
        </Callout>
      ) : null}

      <H2 id="overview">Overview</H2>
      <dl className="facts-table">
        <dt>Base path</dt><dd><code>/api</code> on the same origin as the website, <code>{BASE}</code></dd>
        <dt>Authentication</dt><dd>None. Read-only</dd>
        <dt>Format</dt><dd>JSON, UTF-8</dd>
        <dt>Rate limit</dt>
        <dd>
          {COVERAGE.rateLimitRequests} requests per minute per IP. Over the limit: 429 for{" "}
          {COVERAGE.rateLimitWindowSeconds} seconds
        </dd>
        <dt>Caching</dt><dd><code>Cache-Control: no-store</code></dd>
      </dl>

      <div className="endpoint" id="transfers">
        <span className="method">GET</span>
        <h2 style={{ margin: 0 }} className="mono">/api/transfers</h2>
      </div>
      <p>Returns retained qualifying transfers, newest first, with optional filters and cursor pagination.</p>

      <H3 id="params">Query parameters</H3>
      <p>All parameters are optional and can be combined. An empty value is treated as absent.</p>
      <table className="dtbl">
        <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Rules</th></tr></thead>
        <tbody>
          <tr><td><code>token</code></td><td>string</td><td><code>USDC</code> or <code>USDT</code>, any letter case.</td></tr>
          <tr>
            <td><code>minimumAmount</code></td><td>decimal string</td>
            <td>Digits with up to 6 decimal places, no commas or exponent. Compared exactly in base units. Values below the indexing threshold return the same results as no minimum.</td>
          </tr>
          <tr><td><code>address</code></td><td>string</td><td><code>0x</code> plus 40 hexadecimal characters, any letter case. Matches the sender or the receiver.</td></tr>
          <tr><td><code>limit</code></td><td>integer</td><td>1 to {MAX}. Default {MAX}.</td></tr>
          <tr><td><code>cursor</code></td><td>string</td><td>The <code>nextCursor</code> from a previous response with the same filters. Up to 512 characters.</td></tr>
        </tbody>
      </table>

      <H3 id="examples">Examples</H3>
      <p>Newest {MAX} qualifying transfers:</p>
      <CodeBlock title="curl" code={`curl "${BASE}/api/transfers"`} />
      <p>USDT transfers of at least 250,000, ten at a time:</p>
      <CodeBlock title="curl" code={`curl "${BASE}/api/transfers?token=USDT&minimumAmount=250000&limit=10"`} />
      <p>Everything sent or received by one address:</p>
      <CodeBlock title="curl" code={`curl "${BASE}/api/transfers?address=0x818319478da6bd0c621de49f145fda9988c79fc3"`} />
      <p>The next page, keeping the same filters:</p>
      <CodeBlock title="curl" code={`curl "${BASE}/api/transfers?token=USDT&minimumAmount=250000&limit=10&cursor=<nextCursor>"`} />

      <H3 id="response">Response</H3>
      <CodeBlock title="Response" label="200 OK" code={LIST_RESPONSE} example />

      <H3 id="envelope">Envelope</H3>
      <table className="dtbl">
        <thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
          <tr><td><code>items</code></td><td>array</td><td>Transfers on this page, newest first by block number, then log index.</td></tr>
          <tr><td><code>nextCursor</code></td><td>string or null</td><td>Pass as <code>cursor</code> for the next, older page. <code>null</code> on the last page.</td></tr>
          <tr><td><code>total</code></td><td>integer</td><td>Number of retained transfers that match the filters, across all pages.</td></tr>
          <tr><td><code>counts</code></td><td>object</td><td>The same filtered set split by token: <code>USDC</code> and <code>USDT</code>.</td></tr>
          <tr><td><code>refreshedAt</code></td><td>ISO 8601 string</td><td>When the API last reloaded its index from storage.</td></tr>
        </tbody>
      </table>

      <H3 id="object">Transfer object</H3>
      <table className="dtbl">
        <thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
          <tr><td><code>chain</code>, <code>chainId</code></td><td>string, integer</td><td>Always <code>&quot;ethereum&quot;</code> and <code>1</code>.</td></tr>
          <tr><td><code>token</code></td><td>string</td><td><code>&quot;USDC&quot;</code> or <code>&quot;USDT&quot;</code>.</td></tr>
          <tr><td><code>tokenContract</code></td><td>string</td><td>Lowercase contract address that emitted the event.</td></tr>
          <tr><td><code>from</code>, <code>to</code></td><td>string</td><td>Lowercase sender and receiver addresses.</td></tr>
          <tr><td><code>amount</code></td><td>decimal string</td><td>Exact token amount, up to 6 decimals, trailing zeros removed.</td></tr>
          <tr><td><code>rawAmount</code></td><td>integer string</td><td>Exact amount in base units.</td></tr>
          <tr><td><code>threshold</code></td><td>decimal string</td><td>Indexing threshold when the transfer was recorded.</td></tr>
          <tr><td><code>blockNumber</code></td><td>integer</td><td>Block containing the transfer.</td></tr>
          <tr><td><code>blockTimestamp</code></td><td>ISO 8601 string</td><td>Block time in UTC.</td></tr>
          <tr><td><code>logIndex</code></td><td>integer</td><td>Position of the event in its block.</td></tr>
          <tr><td><code>transactionHash</code></td><td>string</td><td>Lowercase transaction hash.</td></tr>
          <tr><td><code>transactionStatus</code></td><td>string</td><td>Always <code>&quot;success&quot;</code>. Failed transactions emit no Transfer events.</td></tr>
          <tr><td><code>transferType</code></td><td>string</td><td><code>&quot;mint&quot;</code> when <code>from</code> is the zero address, <code>&quot;burn&quot;</code> when <code>to</code> is, otherwise <code>&quot;normal&quot;</code>.</td></tr>
          <tr><td><code>detectedAt</code></td><td>ISO 8601 string</td><td>When the indexer recorded the transfer.</td></tr>
        </tbody>
      </table>
      <p>
        A transfer is uniquely identified by <code>chainId</code>, <code>transactionHash</code> and{" "}
        <code>logIndex</code>. One transaction can appear in several items.
      </p>

      <H2 id="amounts">amount and rawAmount</H2>
      <p>
        Both fields carry the same exact value. <code>amount</code> is for people: <code>&quot;2750000.5&quot;</code>.{" "}
        <code>rawAmount</code> is for arithmetic: <code>&quot;2750000500000&quot;</code>, which is the amount multiplied
        by 1,000,000 (10 to the power of 6).
      </p>
      <p>
        Both are strings so no precision is lost. Do the math on <code>rawAmount</code> with a big integer type.
        Converting <code>amount</code> to a floating point number can round large values.
      </p>
      <CodeBlock title="JavaScript" code={BIGINT_EXAMPLE} />
      <p>Amounts are token units. The API does not return prices or USD values.</p>

      <H2 id="cursor">Pagination and cursor expiry</H2>
      <p>
        Results are always newest first. To read older transfers, pass <code>nextCursor</code> back as{" "}
        <code>cursor</code> with the same filters. The cursor points at the last transfer of the page you received, and
        the next page starts right after it.
      </p>
      <ul>
        <li>New transfers arriving at the top do not shift later pages, because each page is anchored to a transfer rather than an offset.</li>
        <li>There is no previous cursor. To go back, keep the cursors you used and reuse them.</li>
        <li>
          When the anchor transfer ages out of the {COVERAGE.retentionDays}-day window, the cursor stops working and
          the API returns 400 <code>Cursor is invalid or no longer available</code>. Start again without a cursor.
        </li>
        <li>A cursor that cannot be decoded returns 400 <code>Malformed cursor</code>.</li>
      </ul>

      <H2 id="counts">What total and counts mean</H2>
      <p>
        <code>total</code> and <code>counts</code> describe the retained transfers that match your filters at{" "}
        <code>refreshedAt</code>. They can fall between requests as old transfers are removed, and they ignore <code>limit</code> and{" "}
        <code>cursor</code>.
      </p>

      <H2 id="errors">Errors</H2>
      <p>Errors from the API use one shape:</p>
      <CodeBlock title="JSON" code={`{ "error": "Invalid address filter" }`} />
      <table className="dtbl">
        <thead><tr><th scope="col">Status</th><th scope="col">Message</th><th scope="col">What to do</th></tr></thead>
        <tbody>
          <tr>
            <td>400</td>
            <td><code>Invalid token filter</code>, <code>Invalid minimumAmount filter</code>, <code>Invalid address filter</code>, <code>Invalid limit</code>, <code>limit must be between 1 and {MAX}</code>, <code>Invalid cursor</code></td>
            <td>Fix the parameter. See the rules above.</td>
          </tr>
          <tr><td>400</td><td><code>Cursor is invalid or no longer available</code></td><td>The page aged out. Request again without <code>cursor</code>.</td></tr>
          <tr><td>429</td><td>From the load balancer, may not be JSON</td><td>More than {COVERAGE.rateLimitRequests} requests in a minute from your IP. Wait {COVERAGE.rateLimitWindowSeconds} seconds, then slow down.</td></tr>
          <tr><td>500</td><td><code>Internal server error</code></td><td>Details are hidden on purpose. Retry later.</td></tr>
          <tr><td>503</td><td><code>Event index could not be refreshed</code></td><td>The index has never loaded or is over {COVERAGE.maxStaleMinutes} minutes old. Check <code>/api/health</code> and retry later.</td></tr>
        </tbody>
      </table>

      <div className="endpoint" id="transaction">
        <span className="method">GET</span>
        <h2 style={{ margin: 0 }} className="mono">{"/api/transfers/{txHash}"}</h2>
      </div>
      <p>Returns every retained qualifying transfer in one transaction.</p>
      <dl className="facts-table">
        <dt>Path parameter</dt><dd><code>txHash</code>: <code>0x</code> plus 64 hexadecimal characters, any letter case</dd>
        <dt>Order</dt><dd>Newest first, the same order as the feed</dd>
      </dl>
      <CodeBlock title="curl" code={`curl "${BASE}/api/transfers/${TX}"`} />
      <CodeBlock title="Response" label="200 OK" code={TX_RESPONSE} example />
      <table className="dtbl">
        <thead><tr><th scope="col">Status</th><th scope="col">Message</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
          <tr><td>400</td><td><code>Invalid transaction hash</code></td><td>The path is not a 32-byte hash.</td></tr>
          <tr>
            <td>404</td><td><code>Transaction was not found in the indexed transfers</code></td>
            <td>No matching transfers are currently indexed for this transaction.</td>
          </tr>
          <tr><td>503</td><td><code>Event index could not be refreshed</code></td><td>Same as for <code>/api/transfers</code>.</td></tr>
        </tbody>
      </table>

      <div className="endpoint" id="health">
        <span className="method">GET</span>
        <h2 style={{ margin: 0 }} className="mono">/api/health</h2>
      </div>
      <p>Reports index freshness and chain progress. The monitor and the status page read it every {COVERAGE.monitorRefreshSeconds} seconds.</p>
      <CodeBlock title="curl" code={`curl "${BASE}/api/health"`} />
      <CodeBlock title="Response" label="200 OK" code={HEALTH_RESPONSE} example />
      <table className="dtbl">
        <thead><tr><th scope="col">Field</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
          <tr><td><code>status</code></td><td><code>&quot;ok&quot;</code>, or <code>&quot;degraded&quot;</code> when any of the three error fields is set.</td></tr>
          <tr><td><code>lastProcessedBlock</code></td><td>The last block the indexer finished and saved. <code>null</code> before the first checkpoint.</td></tr>
          <tr><td><code>chainHeadBlock</code></td><td>The newest block the indexer had seen when it saved that checkpoint. The gap to <code>lastProcessedBlock</code> is normally the confirmation buffer. <code>null</code> until a checkpoint records it.</td></tr>
          <tr><td><code>checkpointUpdatedAt</code>, <code>checkpointAgeSeconds</code></td><td>When that checkpoint was written and how old it was when the API answered.</td></tr>
          <tr><td><code>retentionDays</code></td><td>The retention window the API applies.</td></tr>
          <tr><td><code>indexThreshold</code></td><td>The minimum transfer amount the indexer keeps, as a decimal string in whole tokens.</td></tr>
          <tr><td><code>confirmationBuffer</code></td><td>How many of the newest blocks the indexer waits behind before reading a block.</td></tr>
          <tr><td><code>pollIntervalSeconds</code></td><td>The pause between indexer cycles. <code>indexThreshold</code>, <code>confirmationBuffer</code> and <code>pollIntervalSeconds</code> are <code>null</code> when the API is not configured with them.</td></tr>
          <tr><td><code>indexedEvents</code></td><td>Transfers held in memory, inside the retention window.</td></tr>
          <tr><td><code>indexRefreshedAt</code></td><td>When the API last reloaded its index from storage.</td></tr>
          <tr><td><code>indexError</code></td><td>Set when the index has never loaded or is older than {COVERAGE.maxStaleMinutes} minutes. The response is then HTTP 503.</td></tr>
          <tr><td><code>lastRefreshError</code></td><td>The last refresh failed. The API keeps serving its last good index.</td></tr>
          <tr><td><code>checkpointError</code></td><td>The API could not read the indexer checkpoint.</td></tr>
        </tbody>
      </table>
      <p>
        The endpoint answers 503 with the same JSON body when <code>indexError</code> is set, and 200 otherwise, even
        when <code>status</code> is <code>&quot;degraded&quot;</code>.
      </p>

      <H2 id="http200">Why HTTP 200 does not always mean healthy</H2>
      <p>
        The transfer endpoints answer 200 as long as the index refreshed within the last {COVERAGE.maxStaleMinutes}{" "}
        minutes. A response can therefore be correct but several minutes old, and the indexer behind it can be stalled
        even while the API keeps serving.
      </p>
      <ul>
        <li>Compare <code>refreshedAt</code> with the current time to see how old the index is.</li>
        <li>
          Call <code>GET /api/health</code>. It can answer 200 with <code>&quot;status&quot;: &quot;degraded&quot;</code>{" "}
          when a refresh or checkpoint read failed, and its <code>checkpointAgeSeconds</code> shows whether the indexer
          is still moving.
        </li>
        <li>Treat the data as current only when the status is <code>&quot;ok&quot;</code> and both ages are small. The status page applies these rules for you.</li>
      </ul>
    </DocsPage>
  );
}
