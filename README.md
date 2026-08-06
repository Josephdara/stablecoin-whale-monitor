# Stablecoin Whale Monitor

Stablecoin Whale Monitor is a cloud-deployed blockchain indexing project that watches Ethereum mainnet for large USDC and USDT `Transfer` events, stores each qualifying transfer as an immutable object in Cloud Storage, and serves the data through a small API and static dashboard. Live at [swm.josephdara.com](https://swm.josephdara.com).

I built this as a cloud engineering portfolio project: not just "read from an API and show a table," but a complete path from blockchain ingestion to storage, backend serving, frontend hosting, load balancing, security controls, and post-deployment debugging on Google Cloud.

The project exists in two versions, both documented here:

- **v1** runs on hand-configured Compute Engine VMs with systemd, Nginx, and a global load balancer. Build write-up: [Building and Deploying a Blockchain Indexer on Google Cloud](https://josephdara.hashnode.dev/building-and-deploying-a-blockchain-indexer-on-google-cloud).
- **v2** containerizes the same codebase and runs it on Cloud Run and Pub/Sub; GKE Autopilot remains documented as a completed portability exercise. Full write-up, every command, and the incident log: [PLAYBOOK.md](PLAYBOOK.md).

## What it does

- Monitors Ethereum mainnet USDC and USDT transfers.
- Filters for large transfers using a configurable minimum amount.
- Uses checkpointing so the indexer can restart without replaying from scratch.
- Stores events as immutable Cloud Storage objects instead of rows in a database (per-event JSON in v1, NDJSON batches per block range in v2).
- Serves a read-only API for listing, filtering, health checks, and transaction lookup.
- Emails an alert for any transfer of $1M or more (v2).
- Displays the newest transfers first in a statically exported Next.js frontend.
- Runs on Google Cloud: a private indexer VM and public load-balanced web tier in v1, containers on Cloud Run in v2.

## v2: Containerized on Cloud Run and Pub/Sub

Version 2 moves the whole system from the hand-configured VM into a single container image that runs as three workloads, selected by arguments alone: the read-only API (Cloud Run Service), the continuously running indexer (Cloud Run Worker Pool), and an email alerter that mails me any transfer of $1M or more (a private Cloud Run Service driven by Pub/Sub push).

```text
Cloud Run Worker Pool (indexer) ── writes NDJSON batch per block range
                                │
                                ▼
              gs://swm-event/ethereum/ranges/<from>-<to>.json
                    │                          │ OBJECT_FINALIZE notification
                    │ reads (30s poll)         ▼
                    ▼                   topic: whale-events ──▶ push sub ──▶ swm-alerter ──▶ email
          Cloud Run Service (API)                                  │ 5 failures
          public HTTPS URL                                         ▼
                                                              whale-dlq
```

Other changes worth knowing about:

- **Storage format**: the indexer now writes one NDJSON object per processed block range instead of one JSON object per event:

  ```text
  ethereum/ranges/<from-block>-<to-block>.json
  ```

  Readers handle both formats, so the v1 objects needed no migration. This cut the API's cold-start reads from ~8,800 objects to a handful and gives Pub/Sub one clean message per batch.
- **Event backbone**: Cloud Storage notifications publish every new batch to a Pub/Sub topic, with a dead-letter queue for poison messages. The alerter is just the first subscriber.
- **Indexer recovery**: each committed range emits a durable progress log, while caught-up cycles emit a completion log; either event satisfies the five-minute stall signal. A transient cycle failure is logged and retried after `POLL_INTERVAL_MS` instead of terminating the worker process.
- **Health observability**: uptime checks assert HTTP `200` plus the expected chain identity, so usable-but-degraded responses do not page as outages. Structured degraded-health logs feed a separate warning that fires only when degradation persists for ten minutes.
- **GKE Autopilot**: the same image was also deployed to Kubernetes (Deployment, CronJob, Workload Identity, LoadBalancer) as a same-day exercise, then torn down. No code changed, which was the point.

## Why this design

The project intentionally uses Cloud Storage as the canonical datastore instead of a SQL database. In v1, each transfer event is written as its own deterministic object:

```text
events/ethereum/YYYY/MM/DD/<block>-<logIndex>-<txHash>.json
```

That keeps the storage layer simple and cheap for a portfolio-scale workload. The event files are immutable, easy to inspect, and safe to rebuild the API's in-memory index from. Checkpoints and token metadata live in a separate state bucket so the indexer can track progress without mixing mutable state with immutable event data. v2 keeps every one of those properties and changes only the granularity: one NDJSON object per block range.

The indexer only advances its checkpoint after the relevant event objects for a block range have been written or confirmed as already existing. Event writes use generation guards, so duplicate writes are treated as success while accidental overwrites are avoided.

## v1 architecture (Compute Engine)

Production traffic flows through a global external Application Load Balancer:

```text
Browser HTTPS
  -> Global external Application Load Balancer
  -> Certificate Manager TLS
  -> Cloud Armor
  -> URL map
      /api and /api/* -> web backend, CDN disabled
      everything else -> web backend, Cloud CDN enabled
  -> Nginx on the web VM, port 80
      static Next.js export
      /api proxied to Express on 127.0.0.1:3001
```

The v1 deployment uses:

- Custom VPC.
- Public web subnet.
- Private indexer subnet.
- Web Compute Engine VM.
- Private indexer Compute Engine VM.
- Cloud Router and Cloud NAT for private outbound access.
- Private Google Access.
- Separate Cloud Storage buckets for events and state.
- Separate service accounts for the indexer and web/API VM.
- Global external Application Load Balancer.
- Certificate Manager-managed TLS.
- Cloud Armor Standard.
- Cloud CDN for static frontend assets.
- Nginx as the VM-local reverse proxy.
- Express on loopback only.

The project was deployed in Google Cloud's Toronto region using `northamerica-northeast2-b`.

## v1 security model

The public internet does not talk directly to the application processes.

- DNS points to the load balancer global IP, not the VM.
- TLS terminates at the load balancer through Certificate Manager.
- Browser HTTP can be redirected to HTTPS at the load balancer.
- The web VM only accepts HTTP from Google load balancer and health-check ranges.
- Express listens on `127.0.0.1:3001` and is never publicly exposed.
- The indexer VM has no public inbound access.
- SSH to the indexer goes through the web VM as a jump host.
- The indexer service account can create event objects and update state.
- The web/API service account can read event and state objects, but cannot write them.
- No service-account key file is required on the VMs; Application Default Credentials use the attached VM service accounts.

The main firewall rules are:

| Rule | Purpose |
| --- | --- |
| `swm-allow-lb-web` | Allows Google Front End/load balancer and health-check traffic to reach the web VM on TCP 80. |
| `swm-allow-admin-ssh` | Allows SSH to the web VM only from the administrator's public IPv4 `/32`. |
| `swm-allow-web-to-indexer-ssh` | Allows the web VM to act as a jump host to the private indexer VM over TCP 22. |

I intentionally did not create broad public VM access for HTTP, HTTPS, the indexer, or Express port `3001`.

v2 carries the same least-privilege model onto managed platforms: per-workload service accounts (indexer writes, API reads, alerter reads one bucket and one secret), the RPC URL and Gmail app password in Secret Manager, the alerter reachable only by Pub/Sub through an Oauth-authenticated push subscription, and Workload Identity instead of key files on GKE.

## Tech stack

Application:

- Node.js 20+
- Express
- Next.js static export
- Google Blockchain JSON-RPC
- nodemailer (v2 alerter)
- pnpm
- Node's built-in test runner

Google Cloud, v1:

- Compute Engine
- Cloud Load Balancing, Cloud CDN, Cloud Armor, Certificate Manager
- Cloud NAT
- Cloud Storage
- Nginx and systemd on the VMs

Google Cloud, v2:

- Docker (multi-arch build for amd64)
- Artifact Registry
- Cloud Run (Services and Jobs)
- Cloud Scheduler
- Pub/Sub (storage notifications, push subscription, dead-letter queue)
- Secret Manager
- GKE Autopilot (Workload Identity, ConfigMap/Secret, CronJob, LoadBalancer)

## Repository layout

```text
.
├── src/
│   ├── api/             # Express API and in-memory event index
│   ├── alerter/         # v2 email alerter (Pub/Sub push consumer)
│   ├── indexer/         # Checkpointed blockchain indexing logic
│   ├── storage/         # Local filesystem and GCS storage adapters, NDJSON helpers
│   ├── config.mjs       # Environment parsing and validation
│   ├── event.mjs        # Event formatting/parsing helpers
│   └── rpc.mjs          # JSON-RPC client helpers
├── scripts/
│   └── fetch-usdc-logs.mjs
├── frontend/            # Next.js dashboard
├── deploy/
│   ├── nginx/           # v1: Nginx reverse proxy config
│   ├── systemd/         # v1: API and indexer service units
│   ├── indexer-env.yaml       # v2: Cloud Run job env (--env-vars-file)
│   ├── api-deployment.yaml    # v2: GKE Deployment + LoadBalancer Service
│   └── indexer-cronjob.yaml   # v2: GKE CronJob
├── test/                # Node test suite
├── Dockerfile           # v2: one image, three workloads
├── PLAYBOOK.md          # v2: full deployment record and incident log
```

## Local setup

Install dependencies:

```sh
cp .env.example .env
pnpm install
```

Then edit `.env` and add your Google Blockchain RPC Ethereum mainnet endpoint:

```dotenv
GOOGLE_BLOCKCHAIN_RPC_URL=https://...
```

Do not commit `.env`. It is intentionally ignored by Git.

For local development, keep:

```dotenv
STORAGE_BACKEND=local
LOCAL_STORAGE_ROOT=data/local-storage
```

Run one confirmed-head catch-up cycle:

```sh
pnpm indexer:once
```

Run continuously:

```sh
pnpm indexer
```

Start the API:

```sh
pnpm api
```

Start the frontend locally:

```sh
cp frontend/.env.example frontend/.env.local
cd frontend
pnpm install
pnpm dev
```

The frontend should call the API through `NEXT_PUBLIC_API_BASE_URL` during local development. In v1 production, I leave that value unset so browser requests use the same origin and Nginx proxies `/api` to Express.

## Production configuration

### v1 (VMs)

On the production VMs, the app uses Cloud Storage:

```dotenv
STORAGE_BACKEND=gcs
GCS_EVENTS_BUCKET=your-events-bucket
GCS_STATE_BUCKET=your-state-bucket
```

The v1 indexer settings are:

```dotenv
BLOCK_BATCH_SIZE=5
RPC_LOG_CHUNK_SIZE=5
POLL_INTERVAL_MS=15000
CONFIRMATION_BUFFER=6
```

`BLOCK_BATCH_SIZE` is the logical range committed by one checkpoint. `RPC_LOG_CHUNK_SIZE` is the size of each `eth_getLogs` request. Google Blockchain RPC caps log queries at 5 blocks, so that value is a provider limit, not a tuning choice.

The v1 API binds to loopback:

```dotenv
API_HOST=127.0.0.1
API_PORT=3001
API_REFRESH_MS=30000
API_REFRESH_DEADLINE_MS=5000
API_MAX_STALE_MS=600000
API_MAX_PAGE_SIZE=50
RETENTION_DAYS=7
```

Nginx listens on VM port `80`, serves `frontend/out`, and proxies `/api` to `127.0.0.1:3001`.

### v2 (Cloud Run / GKE)

The container receives its configuration from the platform instead of files on a VM: [`deploy/indexer-env.yaml`](deploy/indexer-env.yaml) via `--env-vars-file` on Cloud Run (with `BLOCK_BATCH_SIZE=100` since the checkpoint write is the expensive part, and `RPC_LOG_CHUNK_SIZE=5` unchanged because that limit belongs to the provider), secrets via Secret Manager, and a ConfigMap/Secret pair on GKE. The API binds `0.0.0.0:8080` behind Cloud Run's ingress instead of loopback behind Nginx. All commands are in [PLAYBOOK.md](PLAYBOOK.md).

## API

The API serves a bounded window. `RETENTION_DAYS` is required, and every response is filtered on
`blockTimestamp` at or after `now - RETENTION_DAYS`. The window is enforced in the process rather
than relying on the events bucket lifecycle rule, because object deletion is asynchronous and does
not remove events a long-running API has already loaded into memory. An event that ages out between
two pages makes the earlier cursor expire, which returns `400`.

### Index freshness

The process refreshes once at startup and then every `API_REFRESH_MS` in the background. The Cloud
Run API service declares `cpu_idle = false`, so an allocated instance has CPU between requests; the
test estate also keeps one minimum instance. Each request retains `ensureFresh` as a correctness
backstop, and concurrent refresh attempts coalesce onto one storage sweep.

After the first complete listing, refreshes pass the highest immutable range-object name as the GCS
`startOffset`. Because range names contain zero-padded block numbers, listing cost grows with newly
created objects rather than every retained object. Deliberate backfills below the current checkpoint
require an API restart so the initial full listing can discover them.

`API_REFRESH_DEADLINE_MS` (default `5000`) bounds how long a request waits for storage. A loaded
index remains available after a failed or timed-out refresh until it reaches `API_MAX_STALE_MS`
(default `600000`, and never lower than `API_REFRESH_MS`). During that window transfer endpoints
return cached data and health returns HTTP `200` with `status: "degraded"` plus
`lastRefreshError`. An index that never loaded or exceeded the maximum stale age returns `503`.
Checkpoint read failures are reported separately as `checkpointError` and degrade health without
discarding an otherwise usable index.

### `GET /api/transfers`

Returns paginated transfer events, newest first, within the retention window.

Supported query parameters:

- `limit` from `1` through `50`
- `cursor` from the previous response
- `token=USDC|USDT`
- `minimumAmount=100000`
- `address=0x...` to match either sender or receiver

Examples:

```text
/api/transfers?limit=50
/api/transfers?token=USDT&minimumAmount=250000
/api/transfers?address=0x1111111111111111111111111111111111111111
```

### `GET /api/transfers/:txHash`

Returns all indexed qualifying transfers for a transaction hash, within the retention window. A
transaction whose transfers have aged out returns `404`.

### `GET /api/health`

Returns API/index health, checkpoint information, the configured `retentionDays`, the number of
events inside that window, and refresh status.

## Deployment notes (v1)

These are the main deployment actions used for the MVP, intentionally summarized instead of turned into a giant copy/paste script:

```sh
pnpm test

cd frontend
pnpm typecheck
pnpm build
```

On the VMs, the app was installed under:

```text
/opt/swm
```

Environment files live outside the repo:

```text
/etc/swm/indexer.env
/etc/swm/api.env
```

The systemd services are:

```sh
sudo systemctl enable --now swm-indexer
sudo systemctl enable --now swm-api
sudo systemctl enable --now nginx
```

The service definitions in `deploy/systemd` harden the runtime with settings such as `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=true`, and restricted address families.

For v2 deployment (Docker build, Artifact Registry, Cloud Run, Scheduler, Pub/Sub, GKE), see [PLAYBOOK.md](PLAYBOOK.md).

## Post-deployment debugging

Both versions earned a debugging story.

**v1:** after deployment, the frontend and backend worked, but the site periodically returned:

```text
Data could not be loaded.
Could not load transfer data (503)
```

The load balancer was reporting backend trouble because the API process was crashing. The systemd logs showed V8 heap exhaustion:

```text
JavaScript heap out of memory
```

The root cause was the API's event refresh path. It was repeatedly listing and downloading all Cloud Storage event objects into memory. Since refreshes could overlap and the object count had grown, memory usage climbed until Node crashed.

The fix was to make event loading incremental:

- Add a paginated GCS event iterator.
- Skip object names already loaded by the API.
- Process newly discovered event objects one at a time.
- Coalesce concurrent refresh calls.
- Replace `setInterval` refresh scheduling with serialized `setTimeout` scheduling so the next refresh starts only after the previous one finishes.

That turned the API refresh from "reload everything forever" into "load only new immutable event files."

**v2:** the same event-object growth resurfaced in a new costume: the container passed local smoke tests but failed Cloud Run's 4-minute startup probe, because the API blocked its port on sequentially downloading 8,830 objects. The fix chain (listen first, parallel downloads, and ultimately the NDJSON batch format) plus sixteen other incidents are catalogued in [PLAYBOOK.md](PLAYBOOK.md).

## Verification

Run the backend test suite:

```sh
pnpm test
```

Run frontend checks:

```sh
cd frontend
pnpm typecheck
pnpm build
```

The tests cover event decoding, transfer classification, deterministic object naming, checkpoint safety, crash replay behavior, GCS duplicate-object handling, NDJSON batch reads and writes, alert filtering and formatting, filtering, pagination, and API behavior.

For production verification, I used:

- `/api/health` through the load balancer (v1) and the Cloud Run URL (v2).
- Local VM checks against `127.0.0.1:3001` (v1).
- Nginx proxy checks (v1).
- Load balancer backend health checks.
- systemd journal logs (v1) and Cloud Run logs (v2).
- Memory and restart monitoring after the API refresh fix.
- Pub/Sub pull spot-checks and a deliberate dead-letter drill (v2).

## Finality note

The indexer waits for confirmed blocks before publishing events. This reduces short-reorganization risk, but it is not a finality guarantee. If a deep chain reorganization happens after an event has already been published, this MVP does not rewrite historical event objects.

## GitHub safety notes

The repo is configured to ignore local secrets and generated files, including:

- `.env` and nested `.env.local` files
- service-account and credential JSON files
- private key formats such as `.pem`, `.p12`, and `.key`
- `node_modules`
- frontend build output
- local indexed event storage
- local assistant/editor state

The committed `.env.example` files contain placeholders only.
