# Stablecoin Whale Monitor: GCP Deployment Playbook

After deploying my application to [swm.josephdara.com](swm.josephdara.com) I decided to containerize aspects of the application to further test other resources available in GCP.
The starting point was live: the whale monitor already ran on 2 hand-configured VM with systemd`swm-indexer` and  `swm-web`. This was more of a venture pratical exercise to test things locally and in the GCP resourcea: Artifact Registry → Cloud Run → Cloud Scheduler → Pub/Sub → GKE. A local Next.js frontend consumes the API from GCP to add some visualization outside `curling`.

---

```bash
# Shell vars used throughout
REGION=northamerica-northeast2
REGION_ALT=northamerica-northeast1   # Cloud Scheduler isn't offered in northeast2
PROJECT=stablecoinwhalemonitor
AR=$REGION-docker.pkg.dev/$PROJECT/swm
```

---

## Architecture (end state)

One container image, three workloads chosen by args (`ENTRYPOINT node` + `CMD`):

| Args | Workload | Platform |
|---|---|---|
| *(none: CMD)* | HTTP API (`src/api/server.mjs`) | **Cloud Run Service** |
| `scripts/fetch-usdc-logs.mjs --once` | Indexer, one cycle then exit | **Cloud Run Job** (Scheduler-driven) |
| `src/alerter/server.mjs` | Email alerter | **Cloud Run Service** (private, Pub/Sub push) |

```
Scheduler (1 min) ──OAuth──▶ Cloud Run Job (indexer)
                                │ writes NDJSON batch per block range
                                ▼
              gs://swm-event/ethereum/ranges/<from>-<to>.json
                    │                          │ OBJECT_FINALIZE notification
                    │ reads (30s poll)         ▼
                    ▼                   topic: whale-events ──▶ push sub ──▶ swm-alerter ──▶ email
          Cloud Run Service (API)                                  │ 5 failures
          public HTTPS URL                                         ▼
                                                              whale-dlq
gs://swm-state/ethereum/checkpoint.json  ← generation-precondition checkpoint (crash-safe resume)
```

Design principle proven throughout: **stateless containers, all durable state in GCS**, which is why the identical image later ran on GKE with zero code changes.

---

## Phase 0: Build & prove locally 🖥

### Dockerfile

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY src ./src
COPY scripts ./scripts

RUN mkdir -p /app/data && chown node:node /app/data

USER node
ENTRYPOINT ["node"]
CMD ["src/api/server.mjs"]
```

Almost every line encodes a bug (Incidents 1-4):

- `corepack prepare pnpm@9 --activate`: plain `corepack enable` on Node 20 activates pnpm **8**, which cannot parse a `lockfileVersion: 9.0` lockfile, and `--frozen-lockfile` (correctly) refuses to regenerate it. Pin the version here or via a `packageManager` field in package.json. (Local machine later moved to pnpm 10; bump the pin if the build complains.)
- Deps copied before code: Docker layer caching; code changes don't reinstall deps.
- `WORKDIR /app` is created as root, so the non-root `node` user can't `mkdir /app/data` for its lock file; `chown node:node /app/data` before `USER node` is **the EACCES fix**
- `ENTRYPOINT ["node"]` + `CMD`: one image, workload chosen by args. No args → CMD stands → API. `--args scripts/fetch-usdc-logs.mjs,--once` → indexer. Kubernetes spells the same idea `command:`/`args:`.
- No config files copied: the image is code only; config is injected per platform (see "twelve-factor" lesson below).

One `.env` trap from local smoke testing worth recording: the project's dotenv loader strips quotes from values; Docker's `--env-file` passes them **literally**. `RPC_URL='https://…'` worked under `node` and crashed in the container with `TypeError: Invalid URL`, because the env var began with a literal `'`. 

### Build for the right architecture

```bash
docker build --platform linux/amd64 -t swm:local .
docker inspect swm:local --format '{{.Os}}/{{.Architecture}}'   # must print linux/amd64
```

`--platform linux/amd64` because Cloud Run/GKE run amd64 and `docker build` targets the host architecture by default: arm64 on an M-series Mac. I faced the issue after uploading to the Artifact Registry, then tried to deploy when I received the error:

```
Container manifest type 'application/vnd.oci.image.index.v1+json' must support amd64/linux.
```

Hence verifying the architecture both locally (`docker inspect`) and *in the registry* (`imagetools inspect`); they can differ.

### Smoke tests

```bash
# API (default CMD): This will not run locally if your PC is arm64, so you'll have to build a different version to test locally without  using --platform linux/amd64 
docker run --rm -p 8080:8080 \
  -v "$PWD/tmp/smoke:/app/data" \
  -e STORAGE_BACKEND=local -e LOCAL_STORAGE_ROOT=data/local-storage \
  -e API_HOST=0.0.0.0 -e API_PORT=8080 \
  -e API_REFRESH_MS=30000 -e API_MAX_PAGE_SIZE=50 -e CHAIN_ID=1 \
  swm:local
curl localhost:8080/api/health

# Indexer (args override CMD)
docker run --rm --env-file .env \
  -e START_BLOCK=<head minus ~30> \
  -v "$PWD/tmp/smoke:/app/data" \
  swm:local scripts/fetch-usdc-logs.mjs --once
```

---

## Phase 1: Artifact Registry, buckets & IAM ☁️

### Push (the local→cloud boundary)

```bash
gcloud auth configure-docker $REGION-docker.pkg.dev     # once per machine

docker tag swm:local $AR/swm:local
docker push $AR/swm:local
docker buildx imagetools inspect $AR/swm:local           # confirm linux/amd64 in the registry
```

### Tags vs digests

```bash
gcloud artifacts docker images describe $AR/swm:local    # note the sha256 digest
gcloud artifacts docker tags add $AR/swm:local $AR/swm:stable
gcloud artifacts docker images list $AR --include-tags   # one digest, two tags
```

Tags are movable pointers; the digest is immutable identity. `tags add` moves no bytes. This later powered the GKE rollback drill: `swm:stable` deliberately pointed at an older digest.

### Buckets

Both state stores, locked down from birth:

```bash
gcloud storage buckets create gs://swm-state \
    --default-storage-class=STANDARD \
    --location=NORTHAMERICA-NORTHEAST2 \
    --uniform-bucket-level-access \
    --public-access-prevention

gcloud storage buckets create gs://swm-event \
    --default-storage-class=STANDARD \
    --location=NORTHAMERICA-NORTHEAST2 \
    --uniform-bucket-level-access \
    --public-access-prevention
```

`--uniform-bucket-level-access` disables per-object ACLs so IAM is the single source of truth; `--public-access-prevention` makes accidental public exposure impossible regardless of future bindings. Both are the modern defaults worth typing explicitly.

### Service accounts: least privilege

Two workload identities (created with a `-b` suffix after a naming collision with the live service accounts):

```bash
gcloud iam service-accounts create swm-indexer-b --display-name "SWM indexer"
gcloud iam service-accounts create swm-api-b --display-name "SWM API"

# Indexer writes events + checkpoint:
gcloud storage buckets add-iam-policy-binding gs://swm-event \
  --member serviceAccount:swm-indexer-b@$PROJECT.iam.gserviceaccount.com --role roles/storage.objectAdmin
gcloud storage buckets add-iam-policy-binding gs://swm-state \
  --member serviceAccount:swm-indexer-b@$PROJECT.iam.gserviceaccount.com --role roles/storage.objectAdmin

# API only reads:
gcloud storage buckets add-iam-policy-binding gs://swm-event \
  --member serviceAccount:swm-api-b@$PROJECT.iam.gserviceaccount.com --role roles/storage.objectViewer
gcloud storage buckets add-iam-policy-binding gs://swm-state \
  --member serviceAccount:swm-api-b@$PROJECT.iam.gserviceaccount.com --role roles/storage.objectViewer
```

---

## Phase 2: Cloud Run ☁️

### Secret

```bash
printf '%s' "$(grep -m1 '^GOOGLE_BLOCKCHAIN_RPC_URL=' .env | cut -d= -f2-)" | \
  gcloud secrets create swm-rpc-url --data-file=-
gcloud secrets add-iam-policy-binding swm-rpc-url \
  --member serviceAccount:swm-indexer-b@$PROJECT.iam.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor
```

### Indexer as a Job

Config in `deploy/indexer-env.yaml` (quoted YAML values, which permanently retire the `--env-file` quoting bug). Notable values: `STORAGE_BACKEND: "gcs"`, `GCS_EVENTS_BUCKET: "swm-event"` (bare bucket names: `gs://` is CLI syntax, not part of the name; the SDK wants `storage.bucket("swm-event")`), `RPC_LOG_CHUNK_SIZE: "5"` (the provider's knob; see incident log), `BLOCK_BATCH_SIZE: "100"` (your knob: blocks per checkpoint write; raising it cut checkpoint writes 20× without touching the provider limit), `INDEXER_LOCK_FILE: "/tmp/indexer.lock"`.

```bash
gcloud run jobs create swm-indexer --image $AR/swm:local --region $REGION \
  --args scripts/fetch-usdc-logs.mjs,--once \
  --env-vars-file deploy/indexer-env.yaml \
  --set-secrets GOOGLE_BLOCKCHAIN_RPC_URL=swm-rpc-url:latest \
  --service-account swm-indexer-b@$PROJECT.iam.gserviceaccount.com \
  --task-timeout 10m --max-retries 1

gcloud run jobs execute swm-indexer --region $REGION --wait
gcloud storage cat gs://swm-state/ethereum/checkpoint.json   # run twice: checkpoint advances
gcloud storage ls "gs://swm-event/ethereum/**" | head        # the events themselves
```

The advancing checkpoint across two executions is the proof that state left the container.

### Scheduler drives the Job

Cloud Scheduler is **not available in northamerica-northeast2**; the cron job lives in `northamerica-northeast1`:

```bash
gcloud iam service-accounts create swm-scheduler
gcloud scheduler jobs create http swm-indexer-cron --location $REGION_ALT \
  --schedule "*/1 * * * *" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/swm-indexer:run" \
  --oauth-service-account-email swm-scheduler@$PROJECT.iam.gserviceaccount.com

# Force-fire before granting invoker (the lesson). The CLI succeeds silently...
gcloud scheduler jobs run swm-indexer-cron --location $REGION_ALT
# ...the failure only shows in the job's status:
gcloud scheduler jobs describe swm-indexer-cron --location $REGION_ALT   # status: code: 7 PERMISSION_DENIED

# Grant, then re-run: succeeds
gcloud run jobs add-iam-policy-binding swm-indexer --region $REGION \
  --member serviceAccount:swm-scheduler@$PROJECT.iam.gserviceaccount.com \
  --role roles/run.invoker
gcloud scheduler jobs run swm-indexer-cron --location $REGION_ALT
```

Note the failure mode: `scheduler jobs run` is fire-and-forget, so the if it fails, it will not show up in the terminal. It lives in `describe` output (`status: code: 7 PERMISSION_DENIED`) and in the Scheduler logs. Async invocation means async errors; you have to go looking.



### API as a Service

```bash
gcloud run deploy swm-api --image $AR/swm:local --region $REGION \
  --service-account swm-api-b@$PROJECT.iam.gserviceaccount.com \
  --set-env-vars "API_HOST=0.0.0.0,API_PORT=8080,STORAGE_BACKEND=gcs,GCS_EVENTS_BUCKET=swm-event,GCS_STATE_BUCKET=swm-state,CHAIN_ID=1,API_REFRESH_MS=30000,API_MAX_PAGE_SIZE=50" \
  --allow-unauthenticated --max-instances 2
```

**First deploy failed**; see Incident 8. After the code fix, revisions/traffic drills:

```bash
# Config-only change → new revision (note --update-env-vars, NOT --set-env-vars)
gcloud run services update swm-api --region $REGION \
  --update-env-vars API_ALLOWED_ORIGIN=http://localhost:3000

gcloud run revisions list --service swm-api --region $REGION
gcloud run services update-traffic swm-api --region $REGION \
  --to-revisions swm-api-00001-xxx=50,swm-api-00002-yyy=50     # canary
gcloud run services update-traffic swm-api --region $REGION --to-latest
```

Every deploy mints an immutable revision; traffic routing is a pointer move. **Jobs have none of this** (no URL, no revisions, no traffic). The Job/Service distinction is timeout/retries/executions vs revisions/traffic/scaling.

### Useful inspection commands learned along the way

```bash
# Job env (Jobs nest twice: execution template → task template):
gcloud run jobs describe swm-indexer --region $REGION \
  --format 'yaml(spec.template.spec.template.spec.containers[0].env)'

# Changing START_BLOCK requires deleting the checkpoint; it's ignored otherwise.
# As executed (jumping the indexer forward to block 25506578):
gcloud run jobs update swm-indexer --region $REGION \
  --update-env-vars START_BLOCK=25506578
gcloud storage rm gs://swm-state/ethereum/checkpoint.json
gcloud run jobs execute swm-indexer --region $REGION --wait   # fresh checkpoint from the new block
```

---

## The NDJSON refactor (data-shape fix)

**Problem:** one GCS object per event → 8,830 objects → the API's cold start read them sequentially (~8-20 min) and Pub/Sub would have meant one message per event.

**Fix (code):** the indexer writes **one NDJSON object per processed block range that produced events**: `ethereum/ranges/<from>-<to>.json` (zero-padded to 12 digits so lexicographic listing = block order). Readers parse every object as NDJSON (a legacy single-event file is one-line NDJSON), so old and new formats coexist with **no migration**.

Files changed: `src/storage/ndjson.mjs` (new helpers) · `src/event.mjs` (`rangeObjectName`) · `src/indexer/indexer.mjs` (collect events, one `createEventBatch` per range, before the checkpoint write) · `src/storage/gcs.mjs` + `local.mjs` (batch write with `ifGenerationMatch: 0`; NDJSON read) · four test files. API needed **zero changes** (iterator yield shape preserved; existing eventKey dedup absorbs crash-retry overlaps).

Related API fixes from Incident 8: `server.mjs` starts listening **before** loading the index (background refresh), and `gcs.mjs` downloads objects in parallel batches of 25.

Rollout (order matters: reader before writer):

```bash
docker build --platform linux/amd64 -t swm:local . && docker tag swm:local $AR/swm:local && docker push $AR/swm:local
gcloud run services update swm-api --region $REGION --image $AR/swm:local
gcloud run jobs update swm-indexer --region $REGION --image $AR/swm:local
gcloud run jobs execute swm-indexer --region $REGION --wait
gcloud storage ls gs://swm-event/ethereum/ranges/        # batch objects appear
```

---

## Phase 3: Pub/Sub ☁️

### Wiring (zero indexer code changes: GCS itself is the publisher)

```bash
gcloud pubsub topics create whale-events

gcloud storage buckets notifications create gs://swm-event \
  --topic whale-events --event-types OBJECT_FINALIZE \
  --object-prefix ethereum/ranges/

gcloud pubsub subscriptions create whale-pull --topic whale-events --ack-deadline 30
```

Thanks to the NDJSON refactor: **one message = one batch**, and the message's `objectId` attribute names exactly which object holds the new data, so no bucket diffing. Notifications are not retroactive; legacy objects never fire.

### At-least-once, felt

```bash
gcloud pubsub subscriptions pull whale-pull --limit 3      # NO --auto-ack
# wait 35+ seconds → pull again → same messages redelivered
```

Consequence: consumers must be idempotent. This system's answers: `ifGenerationMatch: 0` on writes, eventKey dedup on reads.

### Dead-letter queue

```bash
gcloud pubsub topics create whale-dlq
gcloud pubsub subscriptions create whale-dlq-catch --topic whale-dlq   # retains DLQ'd messages
gcloud pubsub subscriptions update whale-pull \
  --dead-letter-topic whale-dlq --max-delivery-attempts 5

# Pub/Sub's own service agent moves the messages; it needs explicit grants:
PUBSUB_SA=service-435576185234@gcp-sa-pubsub.iam.gserviceaccount.com
gcloud pubsub topics add-iam-policy-binding whale-dlq \
  --member serviceAccount:$PUBSUB_SA --role roles/pubsub.publisher
gcloud pubsub subscriptions add-iam-policy-binding whale-pull \
  --member serviceAccount:$PUBSUB_SA --role roles/pubsub.subscriber
```

Without those grants, dead-lettering **silently doesn't happen**: messages just retry forever.

---

## Email alerter (transfers ≥ $1M)

GCP has no native transactional email API (its only internal email delivery is Cloud Monitoring notification channels). Chosen: **Gmail SMTP with an app password**, stored in Secret Manager, sent via `nodemailer`.

**Code:** `src/alerter/alert.mjs` (pure filter/format, tested) + `src/alerter/server.mjs` (express: `POST /pubsub` receives the push envelope → downloads the one batch object → filters `amount ≥ ALERT_MIN_AMOUNT` → emails a digest → `204` ack; any failure → `500` → Pub/Sub retry → DLQ) + `loadAlerterConfig` in `src/config.mjs`. Filtering lives in the alerter because Pub/Sub subscription filters only see attributes, not amounts.

```bash
# App password created at myaccount.google.com/apppasswords (requires 2FA), then:
printf '%s' '<16-char app password>' | gcloud secrets create swm-gmail-app-password --data-file=-

gcloud iam service-accounts create swm-alerter --display-name "SWM alerter"
gcloud storage buckets add-iam-policy-binding gs://swm-event \
  --member serviceAccount:swm-alerter@$PROJECT.iam.gserviceaccount.com --role roles/storage.objectViewer
gcloud secrets add-iam-policy-binding swm-gmail-app-password \
  --member serviceAccount:swm-alerter@$PROJECT.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor
gcloud iam service-accounts create swm-pubsub-push --display-name "SWM Pub/Sub push"

gcloud run deploy swm-alerter --image $AR/swm:local --region $REGION \
  --args src/alerter/server.mjs \
  --service-account swm-alerter@$PROJECT.iam.gserviceaccount.com \
  --set-env-vars "API_HOST=0.0.0.0,API_PORT=8080,GCS_EVENTS_BUCKET=swm-event,ALERT_MIN_AMOUNT=1000000,ALERT_EMAIL_TO=jsatimehin@gmail.com,ALERT_EMAIL_FROM=<gmail owning the app password>" \
  --set-secrets GMAIL_APP_PASSWORD=swm-gmail-app-password:latest \
  --no-allow-unauthenticated --max-instances 1

# Push subscription: Pub/Sub POSTs with an OIDC token; Cloud Run IAM verifies it; zero auth code
gcloud run services add-iam-policy-binding swm-alerter --region $REGION \
  --member serviceAccount:swm-pubsub-push@$PROJECT.iam.gserviceaccount.com --role roles/run.invoker
ALERTER_URL=$(gcloud run services describe swm-alerter --region $REGION --format 'value(status.url)')
gcloud pubsub subscriptions create whale-alerts-push --topic whale-events \
  --push-endpoint "$ALERTER_URL/pubsub" \
  --push-auth-service-account swm-pubsub-push@$PROJECT.iam.gserviceaccount.com \
  --ack-deadline 30 --dead-letter-topic whale-dlq --max-delivery-attempts 5
gcloud pubsub subscriptions add-iam-policy-binding whale-alerts-push \
  --member serviceAccount:$PUBSUB_SA --role roles/pubsub.subscriber
```

**Testing:** never upload fake objects (the API indexes everything under `ethereum/`); instead lower the threshold temporarily:

```bash
gcloud run services update swm-alerter --region $REGION --update-env-vars ALERT_MIN_AMOUNT=10000
gcloud run jobs execute swm-indexer --region $REGION --wait   # email arrives
gcloud run services update swm-alerter --region $REGION --update-env-vars ALERT_MIN_AMOUNT=1000000
```

**Dead-letter drill (poison message):** publish a notification for a nonexistent object; the alerter 404s → 500 ×5 → DLQ:

```bash
gcloud pubsub topics publish whale-events \
  --attribute bucketId=swm-event,objectId=ethereum/ranges/dlq-test-does-not-exist.json,eventType=OBJECT_FINALIZE
# after ~2 min:
gcloud pubsub subscriptions pull whale-dlq-catch --auto-ack --limit 5 --format json
# attributes show CloudPubSubDeadLetterSourceSubscription + DeliveryCount
```

**Operational learnings:**
- Clear a backlog: `gcloud pubsub subscriptions seek whale-dlq-catch --time "$(date -u +%Y-%m-%dT%H:%M:%SZ)"` (acks everything before now; seek to a *past* time replays instead).
- "Pause" the alerter = **delete the push subscription** (`whale-alerts-push`), not the service. The service scales to zero for free, and a failing/blocked endpoint would just pump messages into the DLQ within minutes (5 attempts ≈ minutes, not hours). Dead-lettered messages never return to the consumer on resume.
- Deleted the drill subscription `whale-pull` once done: unconsumed fan-out copies are clutter. Kept `whale-dlq-catch`: a DLQ topic with no subscription drops messages unread.

---

## Phase 4: GKE Autopilot ☁️

### Cluster on a custom VPC

No `default` network in the project; the VPC is `swm-vpc` (custom mode):

```bash
gcloud compute networks subnets create swm-gke-subnet \
  --network swm-vpc --region $REGION --range 10.11.0.0/20

gcloud container clusters create-auto swm-cluster --region $REGION \
  --network swm-vpc --subnetwork swm-gke-subnet
gcloud container clusters get-credentials swm-cluster --region $REGION # You might need the gke cloud plugin. Use: gcloud components install gke-gcloud-auth-plugin
```

The primary range only covers nodes; Autopilot auto-provisions pod/service secondary ranges. GKE auto-creates its firewall rules (`gke-swm-cluster-*`) and removes them with the cluster.

### Workload Identity (both directions required)

```bash
kubectl create serviceaccount swm-indexer
kubectl create serviceaccount swm-api

gcloud iam service-accounts add-iam-policy-binding \
  swm-indexer-b@$PROJECT.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:$PROJECT.svc.id.goog[default/swm-indexer]"
kubectl annotate serviceaccount swm-indexer \
  iam.gke.io/gcp-service-account=swm-indexer-b@$PROJECT.iam.gserviceaccount.com
# (same pair for swm-api → swm-api-b)
```

IAM binding = "this KSA may impersonate this GSA"; annotation = "pods on this KSA mint that GSA's tokens." Miss either → GCS 403s.

### Config, the k8s way

```bash
kubectl create configmap swm-config \
  --from-env-file <(sed -E 's/: +/=/; s/"//g' deploy/indexer-env.yaml)
kubectl create secret generic swm-rpc \
  --from-literal GOOGLE_BLOCKCHAIN_RPC_URL="$(grep -m1 '^GOOGLE_BLOCKCHAIN_RPC_URL=' .env | cut -d= -f2-)"
```

`kubectl create configmap` reads the **local file** and stores the values in the cluster (etcd); the image contains no config at all. Same values, third delivery mechanism: `.env` locally, `--env-vars-file`/`--set-secrets` on Cloud Run, ConfigMap/Secret on GKE. Pods read env at pod start, so config changes need `kubectl rollout restart`.

### Manifests

`deploy/indexer-cronjob.yaml`: CronJob, `schedule: "* * * * *"` , `concurrencyPolicy: Forbid` (no overlapping scheduled runs, a declarative guarantee Cloud Run Jobs have no equivalent for; note Forbid does **not** cover manually created jobs), `backoffLimit: 1`, RPC URL via `secretKeyRef`.

`deploy/api-deployment.yaml`: Deployment ×3 replicas (no args → CMD → API) + `type: LoadBalancer` Service on 80→8080.

### Apply & drills

```bash
kubectl apply -f deploy/api-deployment.yaml -f deploy/indexer-cronjob.yaml
kubectl get service swm-api -w               # wait for EXTERNAL-IP, #If this fails, check Incident 15 fix
curl http://<EXTERNAL-IP>/api/health

kubectl create job swm-indexer-now --from=cronjob/swm-indexer   # fire now (≙ gcloud run jobs execute)
kubectl logs -f job/swm-indexer-now       

kubectl scale deployment swm-api --replicas 5
kubectl autoscale deployment swm-api --min 2 --max 6 --cpu-percent 70
kubectl delete pod $(kubectl get pods -l app=swm-api -o name | head -1)   # self-healing
kubectl set image deployment/swm-api api=$AR/swm:stable                    # genuine downgrade (old digest)
kubectl rollout undo deployment/swm-api
```

HPA notes: 70% is measured against the CPU **request** (250m); requests are the autoscaling denominator. Scale-up is immediate, scale-down waits ~5 min (anti-flap); the HPA overrides manual `kubectl scale`; min is 2, not 0 (no scale-to-zero, unlike Cloud Run). On Autopilot, HPA (pods) stacks on node auto-provisioning (nodes).

### Teardown (same day)

```bash
gcloud container clusters delete swm-cluster --region $REGION --quiet
gcloud compute forwarding-rules list         # confirm the GKE LB is gone
```

---

## Phase 5: Final teardown

```bash
gcloud run services delete swm-api --region $REGION --quiet
gcloud run jobs delete swm-indexer --region $REGION --quiet
gcloud run services delete swm-alerter --region $REGION --quiet
gcloud pubsub subscriptions delete whale-alerts-push whale-dlq-catch
gcloud pubsub topics delete whale-events whale-dlq
gcloud storage buckets notifications delete gs://swm-event
gcloud scheduler jobs delete swm-indexer-cron --location $REGION_ALT

# End-state sweep:
gcloud run services list --region $REGION && gcloud run jobs list --region $REGION && \
gcloud container clusters list && gcloud scheduler jobs list --location $REGION_ALT
```

**Kept (inert, pennies/month):** the AR image + `stable` tag, `gs://swm-event`, `gs://swm-state`, secrets `swm-rpc-url` + `swm-gmail-app-password`, `swm-gke-subnet` (free). Everything is recreatable from this document.

The final sweep also surfaced **pre-playbook infrastructure still running**: two e2-small VMs (`swm-indexer`, `swm-web`) and an HTTPS load balancer (`swm-https-frontend` → `swm-web-ig`): the hand-configured systemd deployment.

---

## Incident log: everything that broke, and why

Chronological across both working sessions: 1-6 are the containerization bugs, 7 onward are the cloud deployment incidents.

| # | Symptom | Root cause | Fix / lesson |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` failed in the image build | Plain `corepack enable` on Node 20 activates pnpm **8**, which can't parse a `lockfileVersion: 9.0` lockfile, and `--frozen-lockfile` correctly refuses to regenerate it | `corepack prepare pnpm@9 --activate` (or a `packageManager` field in package.json). Pin the toolchain the lockfile was written by |
| 2 | Container crashed with `TypeError: Invalid URL`; same `.env` worked under plain `node` | The project's dotenv loader strips quotes; Docker's `--env-file` passes values **literally**, so the env var began with `'`. Also: on duplicate keys the loader takes the *first*, Docker the *last* | Keep `.env` quote-free and duplicate-free. For cloud: use a YAML `--env-vars-file`, which has real quoting rules; this class of bug never recurred |
| 3 | Deploy rejected: `Container manifest type 'application/vnd.oci.image.index.v1+json' must support amd64/linux`, after a **successful** push | `docker build` targets the host arch: arm64 on Apple Silicon. Registries store anything; only the deploy inspects the manifest | `docker build --platform linux/amd64`. Verify locally (`docker inspect`) **and** in the registry (`docker buildx imagetools inspect`) |
| 4 | Indexer died on startup: `EACCES` on `mkdir /app/data`, before its first RPC call | `WORKDIR /app` is created as root; `USER node` runs as non-root; first act was creating a lock-file dir | `RUN mkdir -p /app/data && chown node:node /app/data` **before** `USER node`; plus `INDEXER_LOCK_FILE=/tmp/indexer.lock` in cloud config (`/tmp` is always writable) |
| 5 | Indexer looked frozen (minutes of silence), then after "optimizing" the chunk size: `RPC HTTP 400 Bad Request: Request exceeds the maximum block range 5 for eth_getLogs` | Two compounding things: it logs one line *per cycle* and had 2,000+ blocks of silent catch-up; and Google Blockchain RPC caps `eth_getLogs` at **5 blocks per request**. The original `5` in the config was the provider limit, encoded, not a timid default. (The same wrong "raise it to 100" suggestion nearly happened again in session 2; the cap is now in persistent memory) | Know which knobs are the provider's and which are yours: `RPC_LOG_CHUNK_SIZE=5` is theirs (blocks per request); `BLOCK_BATCH_SIZE=100` is yours (blocks per checkpoint write); raising only the second still cut GCS checkpoint writes 20×. Faster backfill means a different RPC provider, not a bigger number |
| 6 | Storage SDK rejected the bucket config | `gs://swm-event` is **CLI syntax**, not a bucket name; the SDK wants `storage.bucket("swm-event")` | Bare names in config/SDK; `gs://` only in `gcloud storage` commands |
| 7 | Scheduler force-run appeared to succeed, but the Job never ran; `jobs describe` showed `status: code: 7 PERMISSION_DENIED` | Scheduler's SA lacked `roles/run.invoker` on the Job (failure collected deliberately), and `scheduler jobs run` is fire-and-forget, so the 403 never reaches the terminal | Grant `run.invoker` on the job; check async invokers via `describe`/logs, not CLI exit codes. Authentication (who you are) vs authorization (what you may do) stops being trivia once you've caused the 403 yourself |
| 8 | First `swm-api` deploy failed: "container failed to start and listen on PORT=8080"; TCP probe `DEADLINE_EXCEEDED`; zero app logs | `server.mjs` did `await index.refresh()` **before** `listen()`, and `gcs.mjs` downloaded 8,830 event objects **sequentially** (~8-20 min). The startup probe caps at 240s total (`initialDelay + period × failureThreshold ≤ 240`); it cannot be extended past 4 min | Listen first, load the index in the background (with `.catch`; an un-awaited rejection kills the process); parallel downloads in batches of 25. Zero app logs + probe timeout = hung startup, not a crash. `--no-deploy-health-check` only moves the failure to request time |
| 9 | 8,830 objects: slow cold starts, and Pub/Sub would have meant one message per event | One-object-per-event data shape | NDJSON batch per block range. Coarser granularity **and** each message still points at exactly one object. Reader parses everything as NDJSON (a legacy file is one-line NDJSON) → no migration |
| 10 | Updating `START_BLOCK` did nothing | `START_BLOCK` only applies when no checkpoint exists; runs resume from `lastProcessedBlock + 1` | To move the start: update the env var **and** `gcloud storage rm gs://swm-state/ethereum/checkpoint.json` (pause the scheduler around it) |
| 11 | (Near-miss) adding one env var with `--set-env-vars` | `--set-env-vars` / `--env-vars-file` **replace the entire env list** | `--update-env-vars` merges; `--remove-env-vars` deletes. When using `--env-vars-file`, re-assert `--set-secrets` |
| 12 | `gcloud scheduler jobs list --location northamerica-northeast2` → INVALID_ARGUMENT | Cloud Scheduler isn't offered in northeast2 | The cron job lives in `northamerica-northeast1`. Not every service exists in every region |
| 13 | (Preempted) DLQ configured but wouldn't have fired | Pub/Sub's **service agent** (`service-<nr>@gcp-sa-pubsub`) needs `subscriber` on the source subscription + `publisher` on the DLQ topic | Without the grants, dead-lettering silently no-ops. Verify with `get-iam-policy` before testing |
| 14 | `create-auto` failed: no `default` network | Custom-mode VPC (`swm-vpc`): no auto subnets | Create a regional subnet, pass `--network`/`--subnetwork`. Auto-mode VPCs pre-create subnets per region; custom-mode doesn't |
| 15 | All GKE pods `ImagePullBackOff`, events show 403 fetching pull token | Image pulls use the **node's** service account (Compute default `435576185234-compute@developer`), not the pod's Workload Identity GSA. An earlier grant went to `compute-system.iam.gserviceaccount.com` (the Compute **service agent**, a different identity entirely), and the repo policy was empty | `gcloud artifacts repositories add-iam-policy-binding swm --role roles/artifactregistry.reader` to the **`-compute@developer`** SA. Rule: `service-*@gcp-sa-*`/`*-system.iam` = Google's service agents (grant when *the service itself* acts, e.g. Pub/Sub DLQ); `*-compute@developer` and user-created SAs = workload identities. Also: node SA pulls images; WI GSA is what the running container uses |
| 16 | (Understanding) will paused-alerter messages dead-letter? | Failed *deliveries* count toward `max-delivery-attempts`: 5 failures happen within minutes, and DLQ'd messages never return to the consumer | To stop alerts: delete the subscription (clean silence). To queue for later: `--clear-dead-letter-policy` and rely on 7-day retention + backoff. DLQ = fast poison isolation, not downtime buffering |
| 17 | Fake test objects would poison the API | The API indexes and validates everything under `ethereum/`; an invalid object 503s it | Test the alerter by lowering `ALERT_MIN_AMOUNT` on real data; test the DLQ with a poison *message* (nonexistent objectId), which never touches the bucket |

---


