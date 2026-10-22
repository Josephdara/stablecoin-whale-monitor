# Stablecoin Whale Monitor v3 — deployment runbook

This is the current clone-to-deploy procedure. For architecture and local
development, start with [README.md](../README.md). The VM-era v1 system is preserved
in [V1.md](V1.md), and the manual container/GKE v2 exercise remains in
[PLAYBOOK.md](PLAYBOOK.md).

This runbook recreates the Stablecoin Whale Monitor test estate from a fork or
clone of this repository. Run every shell command from the repository root.

The deployment is intentionally staged. A single first-time `terraform apply`
cannot work because:

1. Cloud Run needs an existing image digest and enabled Secret Manager versions.
2. the managed certificate needs DNS records whose targets Terraform creates;
3. Cloud Build triggers need a linked second-generation repository.

Targeted applies are used only to break those bootstrap cycles. Once the GitHub
repository is linked, use full saved plans.

> **Cost warning:** the indexer is a continuously running Cloud Run Worker Pool.
> It incurs cost even when no qualifying transfers are found. The API and
> alerter can scale to zero with the supplied test defaults, but the indexer
> cannot if it is expected to follow the chain continuously.

## 0. Scope and prerequisites

This procedure deploys `infra/environments/test`. The `prod` environment is only
a placeholder and is not deployable from this repository as written.

The bootstrap script currently supports an organization-owned project. It
requires `ORG_ID` even when the project already exists. If your project is not
under a Google Cloud organization, create and bill the project separately and
adapt `infra/scripts/bootstrap-state.sh` before using this runbook.

Install:

- Git;
- Google Cloud CLI (`gcloud`);
- Terraform `1.15.8` (the configuration accepts `>= 1.5.0`, while Cloud Build
  is pinned to `1.15.8`);
- Node.js 20 or newer and Corepack;
- Docker with Buildx;
- `jq`, `curl`, `grep`, and `dig`;
- access to a DNS zone for the public hostname;
- an Ethereum mainnet JSON-RPC URL; and
- a Gmail account with two-step verification and an app password.

The Google Cloud principal running this procedure must be able to create or
admin the target project, link billing, enable services, manage IAM, and create
the resources in the Terraform configuration. The GitHub principal must be able
to install the Cloud Build GitHub app on the fork.

Check the local tools:

```bash
git --version
gcloud version
terraform version
node --version
corepack pnpm --version
docker buildx version
jq --version
```

## 1. Fork, clone, and validate the checkout

Fork the repository in GitHub so Cloud Build can watch your copy. Then clone
the fork, not the original repository:

```bash
git clone https://github.com/<github-owner>/stablecoin-whale-monitor.git
cd stablecoin-whale-monitor
git switch main
git remote -v
git status --short --branch
```

Before continuing, `origin` must point to your fork and the worktree should be
clean.

Install dependencies and run the checks that do not require Google Cloud:

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
pnpm test
pnpm --dir frontend typecheck
terraform fmt -check -recursive infra
terraform -chdir=infra/environments/test init -backend=false -input=false
terraform -chdir=infra/environments/test validate
```

`pnpm install` must precede the tests. The old procedure ran `npm test` before
installing dependencies, which fails on a clean clone.

## 2. Choose deployment identifiers

Set these once in the current terminal. Replace every placeholder. Bucket names
are globally unique across Google Cloud; project IDs are also globally unique.

```bash
export PROJECT_ID="<globally-unique-project-id>"
export PROJECT_NAME="Stablecoin Whale Monitor Test"
export ORG_ID="<google-cloud-organization-id>"
export BILLING_ACCOUNT_ID="<billing-account-id>"
export REGION="us-east4"
export TF_STATE_LOCATION="us-east4"
export TF_STATE_BUCKET="${PROJECT_ID}-tf-state"
export FRONTEND_BUCKET="${PROJECT_ID}-frontend"
export EVENTS_BUCKET="${PROJECT_ID}-events"
export STATE_BUCKET="${PROJECT_ID}-app-state"
export BUILD_ARTIFACTS_BUCKET="${PROJECT_ID}-build-artifacts"
export DOMAIN_NAME="swm.example.com"
export CONNECTION_NAME="swm-test"
export REPOSITORY_NAME="swm-monitor"
export NAME_PREFIX="swm-test"
export TF_DIR="infra/environments/test"
```

Review the values before any mutation:

```bash
printf '%s\n' \
  "PROJECT_ID=$PROJECT_ID" \
  "TF_STATE_BUCKET=$TF_STATE_BUCKET" \
  "FRONTEND_BUCKET=$FRONTEND_BUCKET" \
  "EVENTS_BUCKET=$EVENTS_BUCKET" \
  "STATE_BUCKET=$STATE_BUCKET" \
  "BUILD_ARTIFACTS_BUCKET=$BUILD_ARTIFACTS_BUCKET" \
  "DOMAIN_NAME=$DOMAIN_NAME"
```

### Required source customization

Terraform backends cannot use input variables. Change the bucket in
`infra/environments/test/backend.tf` to the value of `TF_STATE_BUCKET` before
running the bootstrap script:

```hcl
terraform {
  backend "gcs" {
    bucket = "<project-id>-tf-state"
    prefix = "terraform/state"
  }
}
```

In the `module "cloud_build"` block in
`infra/environments/test/main.tf`, replace the hardcoded artifacts bucket and
explicitly add the three connection/state inputs:

```hcl
  artifacts_bucket_name       = "<project-id>-build-artifacts"
  connection_name             = "swm-test"
  repository_name             = "swm-monitor"
  terraform_state_bucket_name = "<project-id>-tf-state"
```

Keep the default verify, CI, and CD service-account IDs. The three Cloud Build
YAML files state those IDs directly; changing them in Terraform alone would
make the trigger and build config disagree.

Also decide which mailbox should receive Cloud Monitoring incidents. The root
module currently passes `var.alert_email_from` to the monitoring module. If that
should instead be the whale-alert recipient, change it to `var.alert_email_to`
in `infra/environments/test/main.tf` before the following commit.

Commit and push these non-secret fork customizations. No trigger exists yet, so
this push does not start a build:

```bash
git diff --check
git add infra/environments/test/backend.tf infra/environments/test/main.tf
git commit -m "chore: configure test deployment targets"
git push origin main
```

## 3. Authenticate and bootstrap project/state

Authenticate both the CLI and Terraform's Application Default Credentials:

```bash
gcloud auth login
gcloud auth application-default login
gcloud auth list
```

The bootstrap script creates the project if absent, links billing, enables the
Storage API, creates the remote-state bucket, enforces uniform bucket-level
access and public access prevention, enables versioning, checks the bucket
location, sets the active gcloud project, and runs `terraform init`:

```bash
./infra/scripts/bootstrap-state.sh test
```

Confirm that gcloud, the backend file, and the state bucket agree:

```bash
gcloud config get-value project
gcloud storage buckets describe "gs://${TF_STATE_BUCKET}" \
  --project="$PROJECT_ID" \
  --format="yaml(name,location,uniform_bucket_level_access,public_access_prevention,versioning_enabled)"
terraform -chdir="$TF_DIR" providers
```

Never point an existing Terraform state at a new empty bucket or prefix. Doing
so makes Terraform believe the existing estate is absent.

Terraform is **operated locally**, but its state is **not stored locally**. The
operator runs `plan` and `apply` from an authenticated workstation while the GCS
backend stores the authoritative state remotely with uniform bucket-level
access, public access prevention, and object versioning. No CI or CD service
account can access that backend. This separation is an intentional security
boundary: application pipelines cannot inspect infrastructure state or mutate
infrastructure through Terraform.

## 4. Configure Terraform inputs

Create the ignored local input file:

```bash
cp "$TF_DIR/terraform.tfvars.example" "$TF_DIR/terraform.tfvars"
```

Edit `infra/environments/test/terraform.tfvars` and set at least:

| Input | Required value |
| --- | --- |
| `project_id` | `PROJECT_ID` |
| `frontend_bucket_name` | `FRONTEND_BUCKET` |
| `events_bucket_name` | `EVENTS_BUCKET` |
| `state_bucket_name` | `STATE_BUCKET` (not the Terraform-state bucket) |
| `domain_name` | `DOMAIN_NAME` |
| `api_allowed_origin` | `https://<DOMAIN_NAME>` |
| `alert_email_to` | recipient of whale-alert emails |
| `alert_email_from` | Gmail account that owns the app password |
| `start_block` | set immediately before the first Worker Pool creation |

Remove the `zone` line from the example-derived file; the test root module does
not declare a `zone` variable. Leave `application_image = ""` until step 7.

The monitoring notification address is selected in the tracked root module, as
described in step 2. Whale-alert delivery independently uses `alert_email_to`.

Confirm that the local file is ignored and that Terraform can parse it:

```bash
git check-ignore -v "$TF_DIR/terraform.tfvars"
terraform -chdir="$TF_DIR" validate
```

## 5. Create APIs, Artifact Registry, storage, secrets, and IAM

Do not run a full apply yet: the Cloud Run resources cannot be created with an
empty image and empty secrets.

First enable the APIs and create Artifact Registry:

```bash
terraform -chdir="$TF_DIR" apply \
  -target=module.project-services \
  -target=google_artifact_registry_repository.app
```

Then create the application buckets, empty secret containers, runtime service
accounts, and resource-scoped IAM bindings:

```bash
terraform -chdir="$TF_DIR" apply \
  -target=module.storage \
  -target=module.secrets \
  -target=module.iam
```

Inspect the created targets:

```bash
gcloud artifacts repositories describe swm-app \
  --location="$REGION" \
  --project="$PROJECT_ID"
gcloud storage buckets describe "gs://${EVENTS_BUCKET}" --project="$PROJECT_ID"
gcloud storage buckets describe "gs://${STATE_BUCKET}" --project="$PROJECT_ID"
gcloud secrets list --project="$PROJECT_ID" --format="table(name)"
```

The warning that targeted applies may be incomplete is expected here. Do not
use `-target` after the bootstrap stages in this runbook.

## 6. Add secret payloads

Terraform deliberately manages secret containers and IAM, not secret values.
The commands below read values without echoing them or writing them to disk.
They also avoid placing either credential in shell history or process arguments.

```bash
export RPC_SECRET_ID="$(terraform -chdir="$TF_DIR" output -raw rpc_secret_id)"
export GMAIL_SECRET_ID="$(terraform -chdir="$TF_DIR" output -raw gmail_secret_id)"
```

Run each prompt separately and paste the value when asked:

```bash
bash -c 'read -rsp "Ethereum RPC URL: " value; printf "\n" >&2; printf "%s" "$value" | gcloud secrets versions add "$RPC_SECRET_ID" --project="$PROJECT_ID" --data-file=-'
```

```bash
bash -c 'read -rsp "Gmail app password: " value; printf "\n" >&2; printf "%s" "$value" | gcloud secrets versions add "$GMAIL_SECRET_ID" --project="$PROJECT_ID" --data-file=-'
```

Verify only version metadata, never payloads:

```bash
gcloud secrets versions list "$RPC_SECRET_ID" \
  --project="$PROJECT_ID" \
  --format="table(name,state,createTime)"
gcloud secrets versions list "$GMAIL_SECRET_ID" \
  --project="$PROJECT_ID" \
  --format="table(name,state,createTime)"
unset RPC_SECRET_ID GMAIL_SECRET_ID
```

Each secret must have an enabled version.

## 7. Build and publish the bootstrap image

The application image is shared by the API, alerter, and indexer. Build it for
Cloud Run's `linux/amd64` platform and use the current commit as the initial tag:

```bash
export IMAGE_REPOSITORY="$(terraform -chdir="$TF_DIR" output -raw artifact_repository_url)"
export IMAGE_TAG="$(git rev-parse --short=12 HEAD)"
export TAGGED_IMAGE="${IMAGE_REPOSITORY}/stablecoin-whale-monitor:${IMAGE_TAG}"
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  --tag "$TAGGED_IMAGE" \
  --push \
  .
```

`--platform linux/amd64` is required on arm64 workstations. Disabling provenance
and SBOM attestations keeps this bootstrap tag on a single image manifest,
matching the later Cloud Build image behavior.

Resolve the mutable tag to an immutable digest:

```bash
export DIGESTED_IMAGE="$(gcloud artifacts docker images describe "$TAGGED_IMAGE" \
  --project="$PROJECT_ID" \
  --format='value(image_summary.fully_qualified_digest)')"
printf '%s\n' "$DIGESTED_IMAGE"
case "$DIGESTED_IMAGE" in *@sha256:*) ;; *) echo "Digest resolution failed" >&2; false;; esac
```

Put the complete `...@sha256:...` value into `application_image` in
`terraform.tfvars`. Do not put the tag there. `application_image` is only the
bootstrap image; CD owns image changes after the resources exist.

## 8. Create Cloud Run and Pub/Sub

Choose `start_block` immediately before this apply. It is the first block read
only when the state bucket has no checkpoint. It must be at least `25638000`.
For a new deployment, choose a recent confirmed Ethereum block to avoid an
unexpectedly large and expensive backfill. A deliberate historical backfill is
also valid, but estimate its RPC and runtime cost first.

Apply the workloads and event delivery:

```bash
terraform -chdir="$TF_DIR" apply \
  -target=module.cloud_run \
  -target=module.pubsub
```

Confirm all three workloads exist:

```bash
gcloud run services describe swm-api-test --region="$REGION" --project="$PROJECT_ID"
gcloud run services describe swm-alerter-test --region="$REGION" --project="$PROJECT_ID"
gcloud run worker-pools describe swm-indexer-test --region="$REGION" --project="$PROJECT_ID"
```

Older SDKs may expose Worker Pools only under `gcloud beta run worker-pools`. If
the stable command is unavailable, update gcloud, use the beta surface, or
inspect the pool in the Cloud Run console.

Confirm the checkpoint exists:

```bash
gcloud storage cat \
  "gs://$(terraform -chdir="$TF_DIR" output -raw state_bucket_name)/ethereum/checkpoint.json" \
  --project="$PROJECT_ID"
```

Read it again after roughly 60 seconds. `lastProcessedBlock` should advance,
unless the first run is already caught up to the confirmed head.

## 9. Build and upload the frontend

Build with an explicitly empty API base URL. The browser must call same-origin
`/api/*` through the load balancer:

```bash
NEXT_PUBLIC_API_BASE_URL= pnpm --dir frontend build
```

Reject an accidentally embedded local API URL:

```bash
if grep -rqE 'https?://(localhost|127\.0\.0\.1):[0-9]+' frontend/out/; then
  echo "FAIL: localhost API URL is present in the static export" >&2
  false
else
  echo "Frontend export contains no localhost API URL"
fi
```

Upload the export and set cache metadata:

```bash
export FRONTEND_BUCKET="$(terraform -chdir="$TF_DIR" output -raw frontend_bucket_name)"
gcloud storage rsync -r frontend/out "gs://${FRONTEND_BUCKET}" \
  --delete-unmatched-destination-objects \
  --project="$PROJECT_ID"
gcloud storage objects update "gs://${FRONTEND_BUCKET}/_next/static/**" \
  --cache-control="public, max-age=31536000, immutable" \
  --project="$PROJECT_ID"
gcloud storage objects update \
  "gs://${FRONTEND_BUCKET}/**.html" \
  "gs://${FRONTEND_BUCKET}/**.txt" \
  --cache-control="public, max-age=60" \
  --project="$PROJECT_ID"
```

The bucket remains private. The edge module grants its load-balancer cache-fill
service agent read access.

## 10. Create the edge and DNS records

Create only the global address and DNS authorization first:

```bash
terraform -chdir="$TF_DIR" apply \
  -target=module.edge.google_compute_global_address.lb \
  -target=module.edge.google_certificate_manager_dns_authorization.main
```

Capture the exact DNS targets:

```bash
export LOAD_BALANCER_IP="$(terraform -chdir="$TF_DIR" output -raw load_balancer_ip)"
export DNS_AUTH_NAME="$(terraform -chdir="$TF_DIR" output -json dns_authorization_record | jq -r '.name')"
export DNS_AUTH_VALUE="$(terraform -chdir="$TF_DIR" output -json dns_authorization_record | jq -r '.data')"
printf 'A      %s -> %s\n' "$DOMAIN_NAME" "$LOAD_BALANCER_IP"
printf 'CNAME  %s -> %s\n' "$DNS_AUTH_NAME" "$DNS_AUTH_VALUE"
```

At the authoritative DNS provider, create:

| Type | Name | Value |
| --- | --- | --- |
| A | `DOMAIN_NAME` | `LOAD_BALANCER_IP` |
| CNAME | exact `DNS_AUTH_NAME` output | exact `DNS_AUTH_VALUE` output |

Remove a trailing dot only if the DNS provider requires it. Keep the CNAME
permanently because certificate renewal reuses it. If using Cloudflare, create
both records as **DNS only** while Google provisions and renews the certificate.

Verify the exact names; do not guess `_acme-challenge.<hostname>` because Google
may generate a different authorization label:

```bash
dig +short "$DOMAIN_NAME" A
dig +short "$DNS_AUTH_NAME" CNAME
```

After both records resolve correctly, apply the complete edge module:

```bash
terraform -chdir="$TF_DIR" apply -target=module.edge
```

Watch certificate state:

```bash
gcloud certificate-manager certificates list \
  --project="$PROJECT_ID" \
  --format="table(name.basename(),managed.state)"
```

Wait for `ACTIVE` before testing HTTPS. DNS propagation and certificate issuance
can take minutes. A short-lived frontend `403` immediately after the apply can
also be IAM propagation; retry before changing policy.

## 11. Apply monitoring and run the local smoke test

Apply monitoring after the load balancer and Pub/Sub resources exist:

```bash
terraform -chdir="$TF_DIR" apply -target=module.monitoring
```

The email notification channel must be verified from the email Google sends.
If the beta monitoring command is available, inspect it with:

```bash
gcloud beta monitoring channels list \
  --project="$PROJECT_ID" \
  --format="table(displayName,type,verificationStatus)"
```

Otherwise use **Monitoring → Alerting → Edit notification channels** in the
Google Cloud console.

The indexer-stall metric has no history at creation and treats missing data as
active. A brief initial incident can occur until a committed-range or
cycle-complete log arrives. Evaluation is grouped by Worker Pool, not revision.

Pass every deployment-specific target to the smoke script; its built-in defaults
point to the original estate:

```bash
export PUBLIC_URL="https://${DOMAIN_NAME}"
export ALERTER_URL="$(gcloud run services describe swm-alerter-test \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)')"
PUBLIC_URL="$PUBLIC_URL" \
ALERTER_URL="$ALERTER_URL" \
PROJECT_ID="$PROJECT_ID" \
EVENTS_BUCKET="$EVENTS_BUCKET" \
STATE_BUCKET="$STATE_BUCKET" \
TF_STATE_BUCKET="$TF_STATE_BUCKET" \
  ./infra/scripts/smoke-test.sh
```

The script waits 60 seconds to prove the indexer advances. Storage-policy checks
are skipped when the caller lacks `storage.buckets.get`; HTTP checks still run.
Do not rely on a hardcoded assertion count—read its final passed/failed/skipped
summary and require zero failures.

## 12. Connect the fork to Cloud Build

The connection and repository are deliberately created outside Terraform
because the GitHub OAuth/app installation is interactive. The three triggers,
their dedicated service accounts, and their least-privilege IAM are Terraform
managed.

The Cloud Build service agent needs a temporary project-level Secret Manager
Admin grant to create the GitHub OAuth token secret:

```bash
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export CLOUD_BUILD_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUD_BUILD_SERVICE_AGENT}" \
  --role="roles/secretmanager.admin"
```

Create the second-generation GitHub connection. Open the returned authorization
URL, install the Cloud Build GitHub app, and grant it access to your fork:

```bash
gcloud builds connections create github "$CONNECTION_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID"
```

Wait for `installationState.stage: COMPLETE`:

```bash
gcloud builds connections describe "$CONNECTION_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID"
```

Link the fork using the repository resource name configured in step 2:

```bash
gcloud builds repositories create "$REPOSITORY_NAME" \
  --remote-uri="$(git remote get-url origin)" \
  --connection="$CONNECTION_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID"
gcloud builds repositories list \
  --connection="$CONNECTION_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID"
```

Only after the connection is complete and the repository is listed, remove the
temporary admin grant. The service agent retains access to the specific token
secret created for the connection:

```bash
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUD_BUILD_SERVICE_AGENT}" \
  --role="roles/secretmanager.admin"
```

## 13. Full Terraform plan and Cloud Build triggers

This is the first unrestricted plan. Save it outside the repository so a plan
file cannot be committed accidentally:

```bash
terraform fmt -recursive infra
git diff --check
terraform -chdir="$TF_DIR" validate
```

If formatting or the repository/monitoring customization produced a tracked
diff, review, commit, and push it before creating the triggers. Cloud Build reads
the linked fork, not this local worktree.

Then create the saved plan:

```bash
terraform -chdir="$TF_DIR" plan -input=false -out=/tmp/swm-test.tfplan
```

Review the plan in full. It should reconcile the targeted bootstrap applies and
create the build-artifacts bucket, three pipeline service accounts, resource-
scoped bindings, and three triggers. Apply exactly the reviewed plan:

```bash
terraform -chdir="$TF_DIR" apply /tmp/swm-test.tfplan
```

Verify trigger identity and configuration:

```bash
gcloud builds triggers list \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="table(name,serviceAccount,filename,approvalConfig.approvalRequired)"
terraform -chdir="$TF_DIR" output pipeline_service_account_emails
```

Expected triggers:

- `swm-test-verify`: PR checks only, using the verify service account;
- `swm-test-ci`: main-branch build/publish, using the CI service account;
- `swm-test-cd`: release-tag deploy, using the CD service account and requiring
  approval.

No row should use a default Cloud Build service account.

## 14. First CI and CD release

Do not depend on `git push origin main` to start the first CI run. If the branch
is already current, the push has no new event. Invoke the trigger explicitly for
the current commit:

```bash
gcloud builds triggers run "${NAME_PREFIX}-ci" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --sha="$(git rev-parse HEAD)"
```

CI installs dependencies, tests the backend, type-checks and builds the frontend,
checks Terraform formatting/validation, builds and pushes the image, and writes
an immutable release manifest plus frontend archive. It has no deployment
rights.

Watch the build and confirm that release artifacts exist:

```bash
gcloud builds list \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --limit=5 \
  --format="table(id,status,createTime,source.repoSource.commitSha)"
gcloud storage ls -r \
  "gs://$(terraform -chdir="$TF_DIR" output -raw build_artifacts_bucket)/releases/**" \
  --project="$PROJECT_ID"
```

After CI succeeds, create a unique release tag on that same commit:

```bash
export RELEASE_TAG="release-test-$(date -u +%Y%m%d-%H%M%S)"
git tag -a "$RELEASE_TAG" -m "Deploy $RELEASE_TAG"
git push origin "$RELEASE_TAG"
```

The CD trigger enters `PENDING`. Review the tag, commit, and build in **Cloud
Build → Build history**, then approve it in the console. The approver needs
`roles/cloudbuild.builds.approver`; a project owner already has the required
permission. Some gcloud installations expose `gcloud builds approve BUILD_ID`,
but the command is not available in every current SDK distribution, so the
console is the portable procedure.

CD performs this order:

1. fetch and verify the CI manifest/archive;
2. deploy the API and run the API health check;
3. deploy the private alerter;
4. deploy the indexer Worker Pool;
5. upload the frontend and cache metadata; and
6. verify all three workloads use the approved digest, then run the full smoke
   script.

Confirm the completed release:

```bash
gcloud builds list \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --limit=5 \
  --format="table(id,status,createTime)"
curl -fsS "https://${DOMAIN_NAME}/api/health" | jq .
```

Repeat the fully parameterized smoke command from step 11. Do not invoke the
script bare unless its defaults have been changed to match your estate.

## Ongoing operations

### Application release

Push reviewed code to `main`. CI runs automatically for a real push. After CI
succeeds, create and push a new `release-test-*` tag, review the pending CD
build, and approve it. Terraform is not part of application releases.

`application_image` is a bootstrap value after initial creation. Terraform
ignores container image changes on the API, alerter, and indexer so CD can own
deployed versions without state access.

### Infrastructure change

Run from the repository root:

```bash
terraform fmt -recursive infra
git diff --check
terraform -chdir="$TF_DIR" validate
terraform -chdir="$TF_DIR" plan -input=false -out=/tmp/swm-change.tfplan
terraform -chdir="$TF_DIR" apply /tmp/swm-change.tfplan
```

Apply the saved plan that was reviewed; do not regenerate it between review and
apply. Commit and push the infrastructure source after verification.

### Drift check

```bash
terraform -chdir="$TF_DIR" plan -input=false -detailed-exitcode
```

Exit code `0` means no diff, `2` means a non-empty plan, and `1` means an error.
Image differences are intentionally absent because CD owns those fields.

### Secret rotation

Add a new version with the same no-history prompt used in step 6. Cloud Run
references `latest`, but an existing instance does not automatically reload the
new payload. Deploy a new revision or restart/update the consuming workload,
verify it, and only then disable the old secret version.

### Rollback

Re-running `git push` for an existing tag does not create a new tag event. Run
the CD trigger explicitly against the earlier release tag:

```bash
gcloud builds triggers run "${NAME_PREFIX}-cd" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --tag="<earlier-release-test-tag>"
```

Review and approve the resulting pending build. The release manifest pins both
the image digest and frontend archive checksum, so they roll back together.

### Pausing the API and indexer

Pausing takes both services offline without destroying anything, while the
frontend keeps serving an offline notice. Three switches control it:

| Switch | File |
| --- | --- |
| `services_paused` local | `infra/environments/test/main.tf` |
| `SERVICES_PAUSED_DEFAULT` constant (or `NEXT_PUBLIC_SERVICES_PAUSED` at build) | `frontend/lib/config.ts` |
| `_SERVICES_PAUSED` substitution | `cloudbuild/cloudbuild-cd.yaml` |

To pause, set all three to `true`, apply Terraform as in
[Infrastructure change](#infrastructure-change), then cut a release. Terraform
scales the indexer to zero instances, drops the API's warm minimum, stops
routing `/api` (those paths now 404 from the frontend bucket), and disables the
API and indexer alert policies. CD still rolls the image forward on both
services, skips the API health checks, and asserts that `/api` is unrouted.

To resume, set all three to `false` and apply Terraform first. The indexer
continues from its checkpoint and replays the gap back to back, without its
poll sleep, until it reaches the confirmed head. Wait until
`/api/health` reports `"status":"ok"` with a small `checkpointAgeSeconds`
before cutting the release; the smoke test fails a checkpoint older than
180 seconds.

### Teardown

Review the destroy plan carefully:

```bash
terraform -chdir="$TF_DIR" plan -destroy -input=false -out=/tmp/swm-destroy.tfplan
terraform -chdir="$TF_DIR" apply /tmp/swm-destroy.tfplan
```

`storage_force_destroy = true` permits Terraform to remove non-empty application
and build-artifact buckets. Use it only for a disposable environment.

The following are outside Terraform and survive:

- the Cloud Build linked repository and GitHub connection;
- the remote Terraform-state bucket and its object versions; and
- the Google Cloud project itself.

Delete those manually only after confirming the estate and recovery history are
no longer needed. For a dedicated disposable project, deleting the project is
usually the cleanest final action.

## Current design constraints

- The test environment is fixed to `us-east4` by variable validation.
- The indexer Worker Pool is continuous and is the main idle-cost floor.
- Event objects under `ethereum/ranges/` are deleted after seven days by
  lifecycle policy. Soft delete is disabled for the events bucket only.
- The application-state bucket has no lifecycle deletion rule and retains the
  provider's default soft-delete behavior.
- Build release artifacts expire after 14 days, limiting the rollback window.
- The API intentionally uses allocated CPU while an instance exists so its
  background refresh loop can run; `api_min_instances = 0` still permits scale
  to zero.
- The alerter is private and accepts authenticated Pub/Sub push only.
- Uptime monitoring checks HTTP `200` and the mainnet chain identity. Persistent
  degraded health has a separate lower-urgency log-based alert.
- Indexer progress counts committed ranges and caught-up cycles and aggregates
  per Worker Pool, preventing old revisions from leaving uncloseable incidents.
- Terraform commands and state mutations are operator-controlled locally; the
  authoritative state is stored remotely in the secured GCS backend. No
  pipeline identity can read or write it.

## Deploying to production

Production is not deployed by changing `environment` in the test tfvars. The
`infra/environments/prod` root is currently an empty scaffold and must first be
completed from the test composition, then reviewed as an independent estate.
Give it a separate GCP project and GCS state backend, globally unique bucket
names, production domain and secrets, `storage_force_destroy = false`, Cloud Run
deletion protection, and explicit production Cloud Build substitutions. Use a
production-only release pattern such as `^release-prod-.*$`; CI and verification
must validate the production root as well as test.

After that review, bootstrap and operate Terraform locally from the repository
root against production's remote backend:

```bash
export TF_DIR="infra/environments/prod"
./infra/scripts/bootstrap-state.sh prod
terraform -chdir="$TF_DIR" validate
terraform -chdir="$TF_DIR" plan -input=false -out=/tmp/swm-prod.tfplan
terraform -chdir="$TF_DIR" apply /tmp/swm-prod.tfplan
```

Publish production releases with a `release-prod-*` tag only after test has
passed, then review and approve the production CD build. Never reuse the test
state bucket or apply a production plan from `infra/environments/test`.
