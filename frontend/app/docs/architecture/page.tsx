import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DocsPage, H2, H3 } from "../../../components/docs/DocsPage";
import { Icon } from "../../../components/Icon";
import { Callout } from "../../../components/ui";
import { CONFIRMATION_SECONDS, COVERAGE } from "../../../lib/config";
import { groupInteger } from "../../../lib/format";

export const metadata: Metadata = { title: "Architecture and security" };

function Node({ title, children, kind }: { title: string; children: ReactNode; kind?: "ext" | "off" | "off ext" }) {
  return (
    <div className={`nd ${kind ?? ""}`}>
      <b>{title}</b>
      <span>{children}</span>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="ar" aria-hidden="true">
      <Icon name="arrow" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export default function ArchitecturePage() {
  const T = groupInteger(COVERAGE.indexThreshold);
  return (
    <DocsPage
      section="Architecture and security"
      title="Architecture and security"
      lead="How the system collects, stores, and serves transfers, and the security controls protecting it."
      note={
        <>
          This page describes the v3 design implemented in the application and Terraform configuration. Earlier designs
          are in <Link href="/docs/history/">Version history</Link>.
        </>
      }
      toc={[
        { id: "overview", label: "Overview" },
        { id: "compute", label: "Compute and service boundaries" },
        { id: "flow", label: "Data flow" },
        { id: "reorgs", label: "Reorganizations" },
        { id: "security", label: "Security" },
        { id: "identity", label: "Identity and permissions" },
        { id: "delivery", label: "Build and deployment" },
        { id: "monitoring", label: "Monitoring and failure handling" },
        { id: "alerting", label: "Alerting" },
      ]}
      previous={{ href: "/docs/api/", label: "API reference" }}
      next={{ href: "/docs/operations/", label: "Operations guide" }}
    >
      <H2 id="overview">Overview</H2>
      <p>
        An indexer reads Ethereum and writes qualifying transfers to Cloud Storage. A
        read-only API loads those transfers into memory and answers queries. A static website and the API share one
        HTTPS load balancer, so the browser talks to a single origin.
      </p>

      <H2 id="compute">Compute and service boundaries</H2>
      <p>
        The indexer runs continuously in a Cloud Run worker pool because collecting transfers is background work.
        It polls Ethereum even when nobody has the website open. The pool is configured for one instance while
        monitoring is enabled, giving the checkpoint a single writer.
      </p>
      <p>
        The API runs as a separate Cloud Run service with its own CPU, memory, request concurrency, timeout, and
        instance limits. Its CPU remains allocated between requests so it can refresh its index on a timer. Each
        instance builds its own index from storage. API capacity can therefore change independently of the indexer.
      </p>
      <p>
        Both workloads use the same container image with different startup commands and service accounts. The
        website is a Next.js static export served from Cloud Storage through Cloud CDN. This keeps page delivery
        independent of transfer collection and API availability.
      </p>

      <H2 id="flow">Data flow</H2>
      <figure className="card flow" aria-labelledby="flow-caption">
        <span className="lane">Ingest</span>
        <div className="flow-row">
          <Node title="Ethereum JSON-RPC" kind="ext">Mainnet node provider. URL kept in Secret Manager</Node>
          <Arrow />
          <Node title="Indexer">Cloud Run worker pool, one continuous instance. Polls every {COVERAGE.pollIntervalSeconds} s, {COVERAGE.confirmationBlocks} blocks behind the tip</Node>
          <Arrow label="1 write" />
          <Node title="Events bucket">Private Cloud Storage. One NDJSON object per block range with qualifying transfers</Node>
          <Arrow label="2 then" />
          <Node title="State bucket">Separate private bucket holding the checkpoint: last processed block and its hash</Node>
        </div>
        <hr className="divider" />
        <span className="lane">Serve</span>
        <div className="flow-row">
          <Node title="Events bucket">Read only by the API</Node>
          <Arrow label={`${COVERAGE.apiRefreshSeconds} s`} />
          <Node title="API">Cloud Run. In-memory index, deduplicated, newest first, pruned to {COVERAGE.retentionDays} days</Node>
          <Arrow label="/api/*" />
          <Node title="HTTPS load balancer">Cloud Armor rate limit on the API. TLS 1.2 minimum. Static site from a private bucket behind Cloud CDN</Node>
          <Arrow />
          <Node title="Browser" kind="ext">One origin for the site and the API</Node>
        </div>
        <hr className="divider" />
        <span className="lane">Alerting · implemented, disabled in this deployment</span>
        <div className="flow-row">
          <Node title="Storage event" kind="off">New object in the events bucket</Node>
          <Arrow />
          <Node title="Pub/Sub topic" kind="off">Dead-letter topic for failed deliveries</Node>
          <Arrow label="auth push" />
          <Node title="Alerter" kind="off">Private Cloud Run service with its own threshold</Node>
          <Arrow />
          <Node title="Email" kind="off ext">Operator inbox</Node>
        </div>
        <figcaption id="flow-caption" className="small subtle" style={{ fontSize: 13 }}>
          Solid boxes show the monitoring path. Dashed boxes mark external components or the disabled alerting path.
        </figcaption>
      </figure>

      <H3 id="indexer">1. Reading the chain</H3>
      <p>
        The indexer runs as a single continuous instance on a Cloud Run worker pool. Every {COVERAGE.pollIntervalSeconds}{" "}
        seconds it asks the JSON-RPC node for the newest block and reads only up to {COVERAGE.confirmationBlocks}{" "}
        blocks behind it, about {CONFIRMATION_SECONDS} seconds of confirmation. It requests Transfer logs from the USDC
        and USDT contracts in small block ranges, decodes them, and keeps transfers of {T} tokens or more. Each log&apos;s
        block hash is checked against the block it claims to come from.
      </p>

      <H3 id="storage">2. Writing ranges, then the checkpoint</H3>
      <p>
        Each processed block range that contains qualifying transfers becomes one NDJSON object, one transfer per line,
        named from the range itself, for example <code>ethereum/ranges/000026248680-000026248684.json</code>. The same
        range always uses the same object name. Ranges with nothing to record write no object.
      </p>
      <p>
        Range objects are written with a Cloud Storage precondition that only allows creation, so writing a range that
        already exists does not create a second copy. Only after the range is stored does the indexer advance the
        checkpoint in a separate state bucket, using a generation precondition so two writers cannot both move it. If
        the indexer stops between those two steps, it reprocesses the same range on restart and the write is a no-op.
      </p>
      <p>
        For example, if blocks 100 through 104 were stored before the process stopped, but the checkpoint still says
        99, the next cycle starts at 100 again. The existing range object is preserved, and the checkpoint can advance
        after the range is processed. If another writer changes the checkpoint first, the generation check rejects
        the conflicting update.
      </p>
      <p>Transfer data, processing progress, and infrastructure state have separate storage responsibilities:</p>
      <table className="dtbl">
        <thead><tr><th scope="col">Store</th><th scope="col">Contents</th><th scope="col">Purpose</th></tr></thead>
        <tbody>
          <tr><td>Events bucket</td><td>Transfer records grouped by block range</td><td>Durable input for rebuilding the API index</td></tr>
          <tr><td>Application-state bucket</td><td>Checkpoint and token metadata</td><td>Tracks where indexing should resume</td></tr>
          <tr><td>Terraform state bucket</td><td>Terraform resource state</td><td>Tracks infrastructure managed by the operator</td></tr>
        </tbody>
      </table>
      <p>
        The API applies the {COVERAGE.retentionDays}-day history window using each transfer&apos;s block time. A
        separate bucket lifecycle rule deletes event objects according to their object age. Terraform state is
        bootstrapped separately with private access and object versioning so earlier state generations can be recovered.
      </p>

      <H3 id="api">3. Serving from memory</H3>
      <p>
        The API keeps every retained transfer in memory. Every {COVERAGE.apiRefreshSeconds} seconds it lists new range
        objects, loads them, removes duplicates by chain, transaction hash and log index, sorts newest first and drops
        anything older than {COVERAGE.retentionDays} days. Filtering and pagination operate on that in-memory index.
      </p>
      <p>
        Requests also check index age and can trigger a refresh if the timer has fallen behind. Concurrent refresh
        attempts share the same refresh operation. Stored records are validated before they are accepted into the
        index, and a failed refresh leaves the previous index available within the configured staleness window.
      </p>

      <H3 id="edge">4. One origin for site and API</H3>
      <p>
        The website is a static export stored in a private bucket and cached by Cloud CDN. A global HTTPS load balancer
        provides the public entry point. The URL map selects a backend according to the request path:
      </p>
      <table className="dtbl">
        <thead><tr><th scope="col">Request</th><th scope="col">Destination</th><th scope="col">Caching</th></tr></thead>
        <tbody>
          <tr><td><code>/api</code> and <code>/api/*</code></td><td>Cloud Run API through a serverless network endpoint group</td><td>API responses use <code>Cache-Control: no-store</code></td></tr>
          <tr><td><code>/_next/static/*</code></td><td>Static assets in the website bucket</td><td>A separate CDN backend uses the asset cache policy</td></tr>
          <tr><td>Other paths</td><td>Website pages in the same bucket</td><td>The HTML backend uses a shorter cache lifetime</td></tr>
        </tbody>
      </table>
      <p>
        The deployment sets a one-year immutable cache header on versioned static assets and a 60-second header on
        HTML. Separate CDN policies let pages update more frequently while browsers reuse unchanged JavaScript and
        CSS. Relative API URLs keep browser requests on the website&apos;s origin.
      </p>

      <H2 id="reorgs">Reorganizations</H2>
      <p>
        The {COVERAGE.confirmationBlocks}-block buffer reduces exposure to short chain reorganizations. Before each
        cycle, the indexer checks that the block in its checkpoint still has the same hash on the chain. A mismatch
        rejects the cycle and stops checkpoint advancement until the conflict is resolved. The buffer is not a finality
        guarantee, and records already published are not rewritten after a deeper reorganization.
      </p>

      <H2 id="security">Security</H2>
      <p>
        The public API provides read-only access. Security controls cover network access, workload permissions,
        secrets, and deployment.
      </p>

      <H3 id="network">Network access and rate limiting</H3>
      <p>
        Certificate Manager provides the managed certificate for the public domain. The load balancer redirects HTTP
        requests to HTTPS and uses a modern TLS policy with a minimum version of TLS 1.2.
      </p>
      <p>
        The API allows unauthenticated invocation so visitors can read transfers. Its Cloud Run ingress setting
        accepts internal and load-balancer traffic, keeping direct external requests to the service URL outside the
        public access path. Public API traffic passes through the load balancer&apos;s Cloud Armor policy, configured
        for {COVERAGE.rateLimitRequests} requests per minute per IP with HTTP 429 responses and a{" "}
        {COVERAGE.rateLimitWindowSeconds}-second ban when the threshold is exceeded.
      </p>

      <H3 id="identity">Identity and permissions</H3>
      <p>
        The indexer and API use separate service accounts because they perform different jobs. IAM grants are scoped
        to the buckets and secret each workload needs:
      </p>
      <table className="dtbl">
        <thead><tr><th scope="col">Identity</th><th scope="col">Configured access</th><th scope="col">Purpose</th></tr></thead>
        <tbody>
          <tr><td>Indexer</td><td>Object Creator on events, Object User on application state, Secret Accessor on the RPC secret</td><td>Creates transfer batches, updates progress, and connects to Ethereum</td></tr>
          <tr><td>API</td><td>Object Viewer on events and application state</td><td>Reads transfers and reports checkpoint progress</td></tr>
          <tr><td>CDN cache-fill service agent</td><td>Object Viewer on the website bucket</td><td>Reads private site objects to serve through the CDN</td></tr>
        </tbody>
      </table>
      <p>
        Create-only access lets the indexer add event objects while preserving existing batches. The API&apos;s read
        permissions let it rebuild its index and inspect progress without changing stored records. Google Cloud client
        libraries use the service account attached to each workload for authentication.
      </p>

      <H3 id="secrets">Secrets and private storage</H3>
      <p>
        The Ethereum RPC URL is stored in Secret Manager. Cloud Run supplies it to the indexer through a secret-backed
        environment variable, and the indexer identity has access to that specific secret. The API reads stored
        transfers, so its configured permissions require no RPC credential.
      </p>
      <p>
        The website, events, application-state, and release-artifact buckets enforce public access prevention and
        uniform bucket-level access. IAM controls access at the bucket level. Visitors receive site files through the
        CDN service agent&apos;s access and transfer data through the API&apos;s access.
      </p>

      <H3 id="application">Application safeguards</H3>
      <p>
        The API validates token symbols, addresses, transaction hashes, decimal amounts, page sizes, and cursors before
        running a query. Pages are limited to {COVERAGE.pageSize} records, and cursors have a bounded length. Token
        amounts are compared in integer base units to preserve decimal precision.
      </p>
      <p>
        Responses include <code>X-Content-Type-Options: nosniff</code>, <code>Referrer-Policy: no-referrer</code>, and{" "}
        <code>Cache-Control: no-store</code>. Unexpected server errors return a generic message. The shared container
        image installs production dependencies and runs both workloads as the non-root <code>node</code> user.
      </p>

      <H2 id="delivery">Build and deployment</H2>
      <p>
        Cloud Build separates pull-request verification, artifact creation, and deployment into three triggers with
        distinct service accounts. This separates the access used to check proposed changes from the access used to
        publish artifacts and update services.
      </p>
      <table className="dtbl">
        <thead><tr><th scope="col">Pipeline</th><th scope="col">Trigger and work</th><th scope="col">Configured permissions</th></tr></thead>
        <tbody>
          <tr><td>Verification</td><td>Pull requests to main run tests, frontend checks, and Terraform validation</td><td>Writes build logs</td></tr>
          <tr><td>CI</td><td>Pushes to main build the container image, static website, and release manifest</td><td>Writes logs, publishes images to Artifact Registry, and creates and reads release objects</td></tr>
          <tr><td>CD</td><td>Release tags select a published release and wait for approval before deployment</td><td>Reads images and releases, updates the API and worker pool, acts as their runtime accounts, and manages website objects</td></tr>
        </tbody>
      </table>
      <p>
        CI publishes each release under its commit and a unique build identifier. The manifest records the commit,
        container image digest, and website archive checksum. Before deployment, CD checks the commit and checksum
        against the downloaded release and confirms that the digest-qualified image exists. It deploys that image to
        both workloads and uploads the matching website archive.
      </p>
      <p>
        Terraform manages IAM, storage, routing, service configuration, and monitoring. CD updates the deployed images,
        which Terraform explicitly leaves under delivery ownership. The pipeline identities are granted no Terraform
        state access by these modules; infrastructure changes follow a separate operator-reviewed Terraform workflow.
        After deployment, the pipeline checks image digests and runs the smoke-test script. The{" "}
        <Link href="/docs/operations/">operations guide</Link> covers deployment and rollback procedures.
      </p>

      <H2 id="monitoring">Monitoring and failure handling</H2>
      <p>
        API availability and indexing progress are tracked separately. The health response includes the last
        successful index refresh, the last processed block, checkpoint age, and refresh or checkpoint-read errors.
        This helps distinguish an API that can answer requests from an indexer that is advancing through Ethereum.
      </p>
      <table className="dtbl">
        <thead><tr><th scope="col">Signal</th><th scope="col">What it checks</th></tr></thead>
        <tbody>
          <tr><td>HTTPS uptime check</td><td>Calls the public health endpoint, validates TLS, and checks for an HTTP 200 response containing the expected chain ID</td></tr>
          <tr><td>API errors and latency</td><td>Uses load-balancer metrics for 5xx responses and p99 request latency on the API backend</td></tr>
          <tr><td>Degraded API health</td><td>Uses structured health logs to detect persistent refresh or checkpoint-read errors</td></tr>
          <tr><td>Worker availability</td><td>Checks the indexer worker pool&apos;s active instance count</td></tr>
          <tr><td>Indexer progress</td><td>Uses committed-range and completed-cycle logs to detect a stalled processing loop, including cycles with no qualifying transfers</td></tr>
        </tbody>
      </table>
      <p>
        If a refresh fails, the API can keep serving its last successful index within the configured staleness window
        and reports degraded health. If the index has never loaded or its age reaches {COVERAGE.maxStaleMinutes}{" "}
        minutes, transfer queries and the health endpoint return HTTP 503. Checkpoint age remains a separate signal
        because a successful storage refresh can still read data from an indexer that has stopped advancing.
      </p>
      <p>
        Cloud Monitoring policies send notifications to the configured operator email after their failure windows are
        met. During planned maintenance, Terraform scales the worker pool to zero, lowers the API minimum instance
        count to zero, removes public API routes, and disables API and indexer alert policies. The static website shows
        maintenance information. On resumption, indexing starts from the saved checkpoint.
      </p>

      <H2 id="alerting">Alerting</H2>
      <Callout tone="paused">
        <p>
          <strong>Disabled in the current deployment.</strong> The alerting code is in the repository, but its
          infrastructure is switched off. Visitors cannot sign up for alerts.
        </p>
      </Callout>
      <p>When enabled, alerting works like this:</p>
      <ol>
        <li>A new range object in the events bucket triggers a storage notification to a Pub/Sub topic.</li>
        <li>Pub/Sub delivers the message with an authenticated push to a private alerter service on Cloud Run.</li>
        <li>
          The alerter reads the range and sends an email for each transfer at or above its own threshold, set in
          deployment configuration. The example configuration uses {groupInteger(COVERAGE.alertThreshold)} tokens.
        </li>
        <li>Messages that keep failing move to a dead-letter topic for inspection instead of retrying forever.</li>
      </ol>
      <p>The threshold and recipients come from deployment configuration. There is no user-facing setup.</p>
    </DocsPage>
  );
}
