import type { Metadata } from "next";
import { CodeBlock } from "../../../components/CodeBlock";
import { DocsPage, H2 } from "../../../components/docs/DocsPage";
import { Callout } from "../../../components/ui";
import { COVERAGE, SITE } from "../../../lib/config";

export const metadata: Metadata = { title: "Operations" };

const LOCAL_SETUP = `cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
pnpm indexer:once     # one cycle, or: pnpm indexer
pnpm api`;

const LOCAL_FRONTEND = `cp frontend/.env.example frontend/.env.local
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev`;

const CHECKS = `pnpm test
pnpm --dir frontend typecheck
NEXT_PUBLIC_API_BASE_URL= pnpm --dir frontend build
terraform fmt -check -recursive infra
terraform -chdir=infra/environments/test init -backend=false -input=false
terraform -chdir=infra/environments/test validate`;

const HEALTH_CHECK = `curl -s "${SITE.origin}/api/health"`;

export default function OperationsPage() {
  return (
    <DocsPage
      section="Operations"
      title="Operations guide"
      lead="Running the system locally, configuring it, deploying it, and keeping it healthy."
      note={
        <>
          For a complete deployment walkthrough, follow the <a href={SITE.runbook}>deployment runbook</a>.
        </>
      }
      toc={[
        { id: "local", label: "Local development" },
        { id: "config", label: "Configuration" },
        { id: "checks", label: "Checks" },
        { id: "deploy", label: "Deployment" },
        { id: "verify", label: "Verification and monitoring" },
        { id: "maintenance", label: "Maintenance" },
        { id: "rollback", label: "Rollback" },
      ]}
      previous={{ href: "/docs/architecture/", label: "Architecture and security" }}
      next={{ href: "/docs/history/", label: "Version history" }}
    >
      <H2 id="local">Local development</H2>
      <p>
        You need Node.js 20 with Corepack, and an Ethereum mainnet JSON-RPC endpoint. Local runs keep events and the
        checkpoint on disk under <code>data/local-storage</code>, so no cloud account is needed.
      </p>
      <p>
        Copy the example environment file, paste your RPC URL into <code>GOOGLE_BLOCKCHAIN_RPC_URL</code>, then run
        the indexer and the API from the repository root:
      </p>
      <CodeBlock title="Shell" code={LOCAL_SETUP} />
      <p>In another terminal, start the website. Its example configuration points the browser at the local API on port 3001:</p>
      <CodeBlock title="Shell" code={LOCAL_FRONTEND} />
      <p>
        Never commit <code>.env</code>, <code>frontend/.env.local</code>, credentials, Terraform variables or local
        state. The ignore rules cover them.
      </p>

      <H2 id="config">Configuration</H2>
      <p>The services read their settings from environment variables. These shape what the monitor shows:</p>
      <table className="dtbl">
        <thead><tr><th scope="col">Variable</th><th scope="col">Default</th><th scope="col">Effect</th></tr></thead>
        <tbody>
          <tr><td><code>MIN_AMOUNT</code></td><td>{COVERAGE.indexThreshold}</td><td>Indexing threshold in tokens</td></tr>
          <tr><td><code>CONFIRMATION_BUFFER</code></td><td>{COVERAGE.confirmationBlocks}</td><td>Blocks behind the tip before a block is read</td></tr>
          <tr><td><code>POLL_INTERVAL_MS</code></td><td>{COVERAGE.pollIntervalSeconds * 1000}</td><td>Indexer poll interval</td></tr>
          <tr><td><code>BLOCK_BATCH_SIZE</code></td><td>5</td><td>Blocks per processed range</td></tr>
          <tr><td><code>RETENTION_DAYS</code></td><td>{COVERAGE.retentionDays}</td><td>History the API serves</td></tr>
          <tr><td><code>API_REFRESH_MS</code></td><td>{COVERAGE.apiRefreshSeconds * 1000}</td><td>How often the API reloads its index</td></tr>
          <tr><td><code>API_MAX_STALE_MS</code></td><td>{COVERAGE.maxStaleMinutes * 60_000}</td><td>Index age after which query endpoints return 503</td></tr>
          <tr><td><code>API_MAX_PAGE_SIZE</code></td><td>{COVERAGE.pageSize}</td><td>Largest allowed <code>limit</code></td></tr>
        </tbody>
      </table>
      <p>The website is configured at build time:</p>
      <table className="dtbl">
        <thead><tr><th scope="col">Variable</th><th scope="col">Effect</th></tr></thead>
        <tbody>
          <tr><td><code>NEXT_PUBLIC_API_BASE_URL</code></td><td>Where the browser sends API requests. Empty in production, so requests go to the same origin.</td></tr>
          <tr><td><code>NEXT_PUBLIC_SERVICES_PAUSED</code></td><td><code>true</code> or <code>false</code>. Builds the maintenance mode, in which no API request is made. When unset, the default in <code>frontend/lib/config.ts</code> applies.</td></tr>
          <tr><td><code>NEXT_PUBLIC_EXPECTED_RETURN</code></td><td>Return date shown during maintenance, as <code>YYYY-MM-DD</code>.</td></tr>
          <tr><td><code>NEXT_PUBLIC_HISTORY_STARTS</code></td><td>Optional <code>YYYY-MM-DD</code>. After a restart that moved the checkpoint forward, shows when history begins until the retention window has filled.</td></tr>
        </tbody>
      </table>
      <p>
        The defaults used in the website&apos;s copy live in <code>frontend/lib/config.ts</code>. Update it when the
        deployment configuration changes, so the docs and the interface keep matching.
      </p>

      <H2 id="checks">Checks</H2>
      <p>These are the same checks the verification and CI pipelines run:</p>
      <CodeBlock title="Shell" code={CHECKS} />

      <H2 id="deploy">Deployment</H2>
      <p>
        The supported Terraform root is <code>infra/environments/test</code>. The <code>prod</code> root is an empty
        scaffold and must be completed and reviewed as an independent environment before use. Before the first apply you
        need:
      </p>
      <ul>
        <li>a Google Cloud project with billing, and a bootstrapped remote state bucket;</li>
        <li>a domain whose DNS you control, for the managed certificate;</li>
        <li>the RPC URL stored as a Secret Manager version;</li>
        <li>a Cloud Build connection to the repository; and</li>
        <li>a bootstrap image digest for the first apply.</li>
      </ul>
      <p>
        After Terraform has created the environment, releases flow through Cloud Build. Pull requests to <code>main</code> run
        the verify pipeline, which changes nothing. Each push to <code>main</code> runs CI, which tests, builds the image
        and the static site, and publishes a release manifest. Pushing a release tag runs CD, which waits for approval
        and deploys that exact image digest and site archive. Operators apply infrastructure changes separately through
        reviewed Terraform plans.
      </p>

      <H2 id="verify">Verification and monitoring</H2>
      <p>
        After each deploy, CD runs the smoke test in <code>infra/scripts/smoke-test.sh</code>. It checks the site,
        caching headers, TLS, the API, checkpoint advancement and storage policy. You can check health by hand at any
        time:
      </p>
      <CodeBlock title="Shell" code={HEALTH_CHECK} />
      <p>
        Look for <code>&quot;status&quot;:&quot;ok&quot;</code> and a small <code>checkpointAgeSeconds</code>. Cloud
        Monitoring alerts by email on failing uptime checks, 5xx responses, persistently degraded health, high p99
        latency, a stopped indexer and a stalled indexer loop.
      </p>

      <H2 id="maintenance">Maintenance</H2>
      <p>Pausing takes the indexer and API offline without destroying anything. Three switches control it:</p>
      <table className="dtbl">
        <thead><tr><th scope="col">Switch</th><th scope="col">Where</th></tr></thead>
        <tbody>
          <tr><td><code>services_paused</code> local</td><td><code>infra/environments/test/main.tf</code></td></tr>
          <tr><td>Frontend pause default, or <code>NEXT_PUBLIC_SERVICES_PAUSED</code></td><td><code>frontend/lib/config.ts</code></td></tr>
          <tr><td><code>_SERVICES_PAUSED</code> substitution</td><td><code>cloudbuild/cloudbuild-cd.yaml</code></td></tr>
        </tbody>
      </table>
      <p>
        To pause, set all three to <code>true</code>, apply Terraform, then cut a release. Terraform scales the indexer
        to zero, stops routing <code>/api</code> and disables the API and indexer alert policies. To resume, set all
        three to <code>false</code> and apply Terraform first. The indexer continues from its checkpoint and catches up
        before the release is cut.
      </p>
      <Callout tone="info">
        <p>
          If the checkpoint is moved forward before resuming, set <code>NEXT_PUBLIC_HISTORY_STARTS</code> so the
          monitor explains why older history is missing.
        </p>
      </Callout>

      <H2 id="rollback">Rollback</H2>
      <p>
        Run the CD trigger against an earlier release tag and approve the build. The release manifest pins both the
        image digest and the site archive checksum, so they roll back together. Release artifacts expire after 14 days,
        which limits how far back you can go. See the <a href={`${SITE.runbook}#rollback`}>runbook</a> for the exact
        command.
      </p>
    </DocsPage>
  );
}
