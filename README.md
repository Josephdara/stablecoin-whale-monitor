# Stablecoin Whale Monitor v3

Stablecoin Whale Monitor indexes large USDC and USDT transfers on Ethereum
mainnet, stores the resulting event stream in Google Cloud Storage, serves it
through a read-only API, displays it in a static dashboard, and sends email
alerts for transfers above a separate alert threshold.

The current v3 estate is a Terraform-managed Google Cloud deployment built
around a continuously running Cloud Run Worker Pool, two Cloud Run services,
Pub/Sub, a private Cloud Storage frontend origin, a global HTTPS load balancer,
Cloud Armor, Cloud CDN, Cloud Monitoring, and approval-gated Cloud Build
delivery. The live deployment is [swm.josephdara.com](https://swm.josephdara.com).

## Version history and documentation

Each version represents a distinct infrastructure phase. Historical commands
are kept separate from the current deployment path.

| Version | Architecture | Documentation | Source snapshot |
| --- | --- | --- | --- |
| **v3 (current)** | Terraform, Cloud Run Worker Pool and Services, Pub/Sub, global edge, monitoring, gated CI/CD | [Deployment runbook](docs/RUNBOOK.md) · [published v3 article](https://josephdara.hashnode.dev/gcp-swm-3-terraform) | [`V3`](https://github.com/Josephdara/stablecoin-whale-monitor/tree/V3) and current `main` |
| **v2** | Manually deployed containers using Cloud Run Job + Scheduler, Pub/Sub, and a completed GKE Autopilot portability exercise | [v2 deployment playbook](docs/PLAYBOOK.md) · [published v2 article](https://josephdara.hashnode.dev/gcp-swm-2-cloudrun-gke) | [`V2`](https://github.com/Josephdara/stablecoin-whale-monitor/tree/V2) |
| **v1** | Hand-configured Compute Engine VMs, systemd, Nginx, VPC/NAT, and a global load balancer | [v1 architecture and operations](docs/V1.md) · [published v1 article](https://josephdara.hashnode.dev/gcp-swm-1-vm) | [`V1`](https://github.com/Josephdara/stablecoin-whale-monitor/tree/V1) |

Use the [v3 deployment runbook](docs/RUNBOOK.md) to clone and deploy a new estate.
The v1 and v2 documents are historical records, not alternate instructions for
the current Terraform configuration.

## What v3 does

- Watches confirmed Ethereum mainnet blocks for qualifying USDC and USDT
  `Transfer` logs.
- Applies a configurable indexing threshold and a separate email-alert
  threshold.
- Writes immutable NDJSON objects, one object per committed block range.
- Advances a generation-guarded checkpoint only after the corresponding event
  object is safely committed.
- Retries transient indexer failures without terminating the Worker Pool.
- Publishes Cloud Storage finalize events to Pub/Sub.
- Delivers authenticated Pub/Sub push requests to a private email alerter, with
  retry and dead-letter handling.
- Serves retained events through a bounded, paginated, read-only API.
- Hosts a statically exported Next.js dashboard behind a global HTTPS load
  balancer and Cloud CDN.
- Detects API outages, persistent degraded health, high latency, Pub/Sub
  backlog, dead-letter messages, missing indexer instances, and a stalled
  indexer loop.
- Builds immutable application releases and deploys them only after an approved
  release-tag event.

## Architecture

### Runtime and data flow

```text
Ethereum mainnet JSON-RPC
          │
          ▼
Cloud Run Worker Pool: indexer (1 continuous instance)
          │
          ├── checkpoint ───────────────▶ private application-state bucket
          │
          └── NDJSON range object ──────▶ private events bucket
                                                │ OBJECT_FINALIZE
                                                ▼
                                           Pub/Sub topic
                                                │ authenticated OIDC push
                                                ▼
                                      private Cloud Run alerter ──▶ Gmail
                                                │ repeated delivery failure
                                                ▼
                                           dead-letter topic

Browser ── HTTPS ──▶ Global external Application Load Balancer
                         │
                         ├── /api/* ──▶ Cloud Armor ──▶ serverless NEG
                         │                              └──▶ Cloud Run API
                         │                                    ├── reads events
                         │                                    └── reads checkpoint
                         │
                         └── all other paths ──▶ Cloud CDN
                                                └──▶ private frontend bucket
```

The API only accepts traffic routed through the internal/load-balancer ingress
path. The alerter uses internal ingress and grants `run.invoker` only to the
dedicated Pub/Sub push identity. None of the application buckets are public.

### Delivery and infrastructure flow

```text
Pull request ──▶ verify trigger ──▶ tests + typecheck + Terraform checks
                    verify service account: logging only

Push to main ──▶ CI trigger ──▶ image digest + frontend archive + manifest
                    CI service account: artifact writer, no deploy rights

release-test-* tag ──▶ pending approval ──▶ CD trigger
                                                │
                                                ├── verify published release
                                                ├── update API
                                                ├── update alerter
                                                ├── update Worker Pool
                                                ├── publish frontend
                                                └── smoke-test approved digest

Local operator ──▶ Terraform plan/apply ──▶ Google Cloud resources
                         │
                         └── authoritative state in secured GCS backend
```

Terraform execution and state mutation are operator-controlled locally, while
the authoritative state is stored remotely in a versioned GCS backend with
uniform bucket-level access and public access prevention. Pipeline identities
cannot read or write Terraform state. This keeps application delivery separate
from infrastructure authority.

## Storage and correctness model

Cloud Storage is the canonical datastore. It fits this workload because events
are immutable, deterministic, cheap to retain, and easy to replay into the
API's in-memory index.

v3 writes one NDJSON object per processed block range:

```text
ethereum/ranges/<zero-padded-from-block>-<zero-padded-to-block>.json
```

The storage layer can still read v1 single-event JSON objects, allowing the data
shape to evolve without an immediate migration. The current writer uses range
objects because thousands of individual event objects made cold starts and
Pub/Sub fan-out unnecessarily expensive.

The indexer follows these consistency rules:

1. query only through the confirmed head;
2. split RPC log queries into provider-compatible chunks;
3. write the deterministic range object with a generation precondition;
4. treat an already-existing identical object as an idempotent replay; and
5. update the checkpoint with its own generation precondition only after the
   range is committed.

This protects crash recovery and concurrent checkpoint updates. Waiting for a
confirmation buffer reduces ordinary reorganization risk, but it is not an
Ethereum finality guarantee; a deep reorganization does not rewrite already
published historical objects.

The events bucket deletes range objects after the configured retention period,
seven days by default. The API enforces the same window in memory because Cloud
Storage lifecycle deletion is asynchronous. The application-state bucket has no
lifecycle deletion rule.

## Workloads and identities

One non-root `linux/amd64` image runs three commands:

| Workload | Container argument | Runtime | Identity scope |
| --- | --- | --- | --- |
| Indexer | `scripts/fetch-usdc-logs.mjs` | Cloud Run Worker Pool | create events, read/write application state, read RPC secret |
| API | `src/api/server.mjs` | Cloud Run Service | read events and application state; no secret access |
| Alerter | `src/alerter/server.mjs` | Private Cloud Run Service | read events and Gmail secret; no state access |

Pub/Sub uses a fourth identity only to mint the OIDC token and invoke the
alerter. Verify, CI, and CD each have their own user-managed service account.
CD receives `serviceAccountUser` only on the three runtime identities it must
preserve while deploying new revisions.

## API

### `GET /api/transfers`

Returns retained qualifying transfers in newest-first order.

Supported query parameters:

- `limit=1..50`;
- `cursor=<cursor returned by the previous page>`;
- `token=USDC|USDT`;
- `minimumAmount=<whole-token amount>`; and
- `address=0x...` to match sender or receiver.

Examples:

```text
/api/transfers?limit=50
/api/transfers?token=USDT&minimumAmount=250000
/api/transfers?address=0x1111111111111111111111111111111111111111
```

A cursor whose referenced event has aged out returns a controlled `400` instead
of producing inconsistent pagination.

### `GET /api/transfers/:txHash`

Returns every retained qualifying transfer emitted by one transaction. It
returns `404` when no qualifying retained event exists for the hash.

### `GET /api/health`

Reports chain identity, checkpoint position and age, retention window, indexed
event count, refresh time, and any index, refresh, or checkpoint error.

Health deliberately separates availability from degradation:

- an unusable or excessively stale index returns HTTP `503`;
- a usable index with a transient refresh/checkpoint problem returns HTTP `200`
  with `status: "degraded"`; and
- a usable and current index returns HTTP `200` with `status: "ok"`.

The uptime check validates HTTP `200` plus `"chainId":1`. Persistent structured
`health_degraded` logs feed a separate warning policy, so a transient degraded
response is not treated as a full outage.

## Observability

Terraform creates email-backed policies for:

- failed API uptime checks;
- load-balancer API 5xx responses;
- persistent degraded API health;
- p99 API latency;
- dead-letter queue depth;
- ageing Pub/Sub push backlog;
- zero active indexer Worker Pool instances; and
- absence of committed-range or completed-cycle logs.

Indexer progress is evaluated per Worker Pool rather than per revision. A new
revision therefore does not leave an obsolete time series with an incident that
cannot close.

## Repository layout

```text
.
├── src/
│   ├── api/                  # read-only HTTP API and in-memory index
│   ├── alerter/              # authenticated Pub/Sub push consumer
│   ├── indexer/              # continuous checkpointed indexer
│   └── storage/              # local/GCS adapters and NDJSON support
├── scripts/                  # executable indexer entry point
├── frontend/                 # statically exported Next.js dashboard
├── infra/
│   ├── environments/test/    # current deployable Terraform root
│   ├── modules/              # services, storage, IAM, edge, monitoring, builds
│   └── scripts/              # state bootstrap and post-deploy smoke test
├── cloudbuild/
│   ├── cloudbuild-verify.yaml
│   ├── cloudbuild-ci.yaml
│   └── cloudbuild-cd.yaml
├── deploy/                   # retained v1/v2 deployment artifacts
├── test/                     # Node test suite
├── Dockerfile                # shared non-root runtime image
└── docs/
    ├── RUNBOOK.md            # v3 clone-to-deploy procedure
    ├── PLAYBOOK.md           # historical v2 exercise and incident log
    ├── V3-BLOG.md            # v3 engineering write-up
    ├── LESSONS.md            # v3 GCP incident record
    └── V1.md                 # historical v1 architecture and operations
```

`infra/environments/prod` is currently a placeholder. The supported Terraform
root is `infra/environments/test`.

## Local development

Requirements: Node.js 20 or newer and pnpm 9.15.9 through Corepack.

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

Add an Ethereum mainnet JSON-RPC URL to `.env`. Keep the local storage settings:

```dotenv
GOOGLE_BLOCKCHAIN_RPC_URL=https://...
STORAGE_BACKEND=local
LOCAL_STORAGE_ROOT=data/local-storage
```

Run one indexer cycle or the continuous loop:

```bash
pnpm indexer:once
# Or run continuously:
pnpm indexer
```

Start the API:

```bash
pnpm api
```

In another terminal, start the frontend:

```bash
cp frontend/.env.example frontend/.env.local
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
```

The local frontend calls `http://127.0.0.1:3001` by default. The production
export uses an explicitly empty `NEXT_PUBLIC_API_BASE_URL`, causing browser API
requests to use the load balancer's same-origin `/api/*` route.

Do not commit `.env`, `frontend/.env.local`, credentials, generated frontend
output, Terraform variables, or local Terraform state. The repository ignore
rules cover these paths, but review every commit before pushing.

## Verification

Run the same local checks used by the verification/CI pipelines:

```bash
pnpm test
pnpm --dir frontend typecheck
NEXT_PUBLIC_API_BASE_URL= pnpm --dir frontend build
terraform fmt -check -recursive infra
terraform -chdir=infra/environments/test init -backend=false -input=false
terraform -chdir=infra/environments/test validate
```

The test suite covers alert thresholds and formatting, retention boundaries,
pagination, refresh coalescing and deadlines, degraded health, event decoding,
confirmation handling, crash replay, RPC range splitting, GCS preconditions,
legacy and NDJSON reads, and indexer retries.

After deployment, run the parameterized smoke test described in
[docs/RUNBOOK.md](docs/RUNBOOK.md). It checks the frontend, caching, TLS, API, checkpoint
advancement, alerter isolation, and storage policy.

## Deploying v3

Follow [docs/RUNBOOK.md](docs/RUNBOOK.md) from the repository root. It covers:

1. forking and cloning;
2. project and secured remote-state bootstrap;
3. Terraform inputs and staged first deployment;
4. out-of-band secret versions and bootstrap image digest;
5. Cloud Run, Pub/Sub, frontend, edge, DNS, and monitoring;
6. GitHub/Cloud Build connection setup;
7. the first full saved Terraform plan; and
8. CI publication, gated CD, smoke testing, rollback, and teardown.

Application releases do not run Terraform. CI publishes an immutable image
digest, frontend archive, checksum, and manifest for the commit. A matching
release tag creates a pending CD build, and an owner-approved deployment applies
that already-built release. Terraform remains the owner of infrastructure and
non-image workload configuration...

## Historical context

- [v1 architecture and operations](docs/V1.md) explains the original VM estate
  and the production memory incident that drove incremental event loading.
- [v2 deployment playbook](docs/PLAYBOOK.md) records the containerization exercise,
  Cloud Run Job/Scheduler design, Pub/Sub alerter, GKE portability drill, and its
  incident log.
- [v3 deployment runbook](docs/RUNBOOK.md) is the current reproducible deployment
  procedure.

The longer original v1 build write-up is
[Building and Deploying a Blockchain Indexer on Google Cloud](https://josephdara.hashnode.dev/gcp-swm-1-vm).
