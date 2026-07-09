# Stablecoin Whale Monitor

Stablecoin Whale Monitor is a cloud-deployed blockchain indexing project that watches Ethereum mainnet for large USDC and USDT `Transfer` events, stores each qualifying transfer as an immutable JSON object, and serves the data through a small API and static dashboard.

I built this as a cloud engineering portfolio project: not just “read from an API and show a table,” but a complete path from blockchain ingestion to storage, backend serving, frontend hosting, load balancing, security controls, and post-deployment debugging on Google Cloud.

The longer build write-up is here: [Building and Deploying a Blockchain Indexer on Google Cloud](https://josephdara.hashnode.dev/building-and-deploying-a-blockchain-indexer-on-google-cloud).

## What it does

- Monitors Ethereum mainnet USDC and USDT transfers.
- Filters for large transfers using a configurable minimum amount.
- Uses checkpointing so the indexer can restart without replaying from scratch.
- Stores events as individual JSON objects instead of rows in a database.
- Serves a read-only API for listing, filtering, health checks, and transaction lookup.
- Displays the newest transfers first in a statically exported Next.js frontend.
- Runs in production on Google Cloud with a private indexer VM and public load-balanced web tier.

## Why this design

The MVP intentionally uses Cloud Storage as the canonical datastore instead of a SQL database. Each transfer event is written as its own deterministic object:

```text
events/ethereum/YYYY/MM/DD/<block>-<logIndex>-<txHash>.json
```

That keeps the storage layer simple and cheap for a portfolio-scale workload. The event files are immutable, easy to inspect, and safe to rebuild the API’s in-memory index from. Checkpoints and token metadata live in a separate state bucket so the indexer can track progress without mixing mutable state with immutable event data.

The indexer only advances its checkpoint after the relevant event objects for a block range have been written or confirmed as already existing. Event writes use generation guards, so duplicate writes are treated as success while accidental overwrites are avoided.

## Architecture

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

The deployment uses:

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

The project was deployed in Google Cloud’s Toronto region using `northamerica-northeast2-b`.

## Security model

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
| `swm-allow-admin-ssh` | Allows SSH to the web VM only from the administrator’s public IPv4 `/32`. |
| `swm-allow-web-to-indexer-ssh` | Allows the web VM to act as a jump host to the private indexer VM over TCP 22. |

I intentionally did not create broad public VM access for HTTP, HTTPS, the indexer, or Express port `3001`.

## Tech stack

- Node.js 20+
- Express
- Next.js static export
- Google Blockchain JSON-RPC
- Google Cloud Storage
- Google Compute Engine
- Google Cloud Load Balancing
- Cloud NAT
- Cloud Armor
- Cloud CDN
- Certificate Manager
- Nginx
- systemd
- pnpm
- Node’s built-in test runner

## Repository layout

```text
.
├── src/
│   ├── api/             # Express API and in-memory event index
│   ├── indexer/         # Checkpointed blockchain indexing logic
│   ├── storage/         # Local filesystem and GCS storage adapters
│   ├── config.mjs       # Environment parsing and validation
│   ├── event.mjs        # Event formatting/parsing helpers
│   └── rpc.mjs          # JSON-RPC client helpers
├── scripts/
│   └── fetch-usdc-logs.mjs
├── frontend/            # Next.js dashboard
├── deploy/
│   ├── nginx/           # Nginx reverse proxy config
│   └── systemd/         # API and indexer service units
├── test/                # Node test suite
└── data/sample-preview/ # Small non-secret sample fixture
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

The frontend should call the API through `NEXT_PUBLIC_API_BASE_URL` during local development. In production, I leave that value unset so browser requests use the same origin and Nginx proxies `/api` to Express.

## Production configuration

On the production VMs, the app uses Cloud Storage:

```dotenv
STORAGE_BACKEND=gcs
GCS_EVENTS_BUCKET=your-events-bucket
GCS_STATE_BUCKET=your-state-bucket
```

The current production-oriented indexer settings are:

```dotenv
BLOCK_BATCH_SIZE=5
RPC_LOG_CHUNK_SIZE=5
POLL_INTERVAL_MS=15000
CONFIRMATION_BUFFER=6
```

`BLOCK_BATCH_SIZE` is the logical range committed by one checkpoint. `RPC_LOG_CHUNK_SIZE` is the size of each `eth_getLogs` request. Google Blockchain RPC currently requires small log ranges, so both values are set to `5`.

The API binds to loopback:

```dotenv
API_HOST=127.0.0.1
API_PORT=3001
API_REFRESH_MS=30000
API_MAX_PAGE_SIZE=50
```

Nginx listens on VM port `80`, serves `frontend/out`, and proxies `/api` to `127.0.0.1:3001`.

## API

### `GET /api/transfers`

Returns paginated transfer events, newest first.

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

Returns all indexed qualifying transfers for a transaction hash.

### `GET /api/health`

Returns API/index health, checkpoint information, indexed event count, and refresh status.

### `GET /api/stats`

Returns daily aggregate stats. This endpoint exists in the backend, although the frontend no longer displays a statistics section.

## Deployment notes

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

## Post-deployment debugging

After deployment, the frontend and backend worked, but the site periodically returned:

```text
Data could not be loaded.
Could not load transfer data (503)
```

The load balancer was reporting backend trouble because the API process was crashing. The systemd logs showed V8 heap exhaustion:

```text
JavaScript heap out of memory
```

The root cause was the API’s event refresh path. It was repeatedly listing and downloading all Cloud Storage event objects into memory. Since refreshes could overlap and the object count had grown, memory usage climbed until Node crashed.

The fix was to make event loading incremental:

- Add a paginated GCS event iterator.
- Skip object names already loaded by the API.
- Process newly discovered event objects one at a time.
- Coalesce concurrent refresh calls.
- Replace `setInterval` refresh scheduling with serialized `setTimeout` scheduling so the next refresh starts only after the previous one finishes.

That turned the API refresh from “reload everything forever” into “load only new immutable event files.”

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

The tests cover event decoding, transfer classification, deterministic object naming, checkpoint safety, crash replay behavior, GCS duplicate-object handling, filtering, pagination, and API behavior.

For production verification, I used:

- `/api/health` through the load balancer.
- Local VM checks against `127.0.0.1:3001`.
- Nginx proxy checks.
- Load balancer backend health checks.
- systemd journal logs.
- Memory and restart monitoring after the API refresh fix.

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
