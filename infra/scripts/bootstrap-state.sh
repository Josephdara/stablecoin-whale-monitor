#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [test|prod|production]" >&2
  echo "The positional argument overrides DEPLOY_ENV; the default is test." >&2
}

if (( $# > 1 )); then
  usage
  exit 2
fi

requested_environment="${1:-${DEPLOY_ENV:-test}}"

case "${requested_environment}" in
  test)
    deploy_environment="test"
    ;;
  prod | production)
    deploy_environment="prod"
    ;;
  *)
    echo "ERROR: Environment must be test, prod, or production; got '${requested_environment}'." >&2
    usage
    exit 2
    ;;
esac

# 1. Environment variable validation
: "${PROJECT_ID:?PROJECT_ID must be set}"
: "${ORG_ID:?ORG_ID must be set}"
: "${TF_STATE_BUCKET:?TF_STATE_BUCKET must be set}"
PROJECT_NAME="${PROJECT_NAME:-$PROJECT_ID}"

TF_STATE_LOCATION="${TF_STATE_LOCATION:-us-east4}"
BUCKET_URI="gs://${TF_STATE_BUCKET}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
TERRAFORM_DIR="${REPOSITORY_ROOT}/infra/environments/${deploy_environment}"


echo "==> Checking Project Existence: ${PROJECT_ID}"

if ! project_matches="$(
  gcloud projects list \
    --filter="projectId=${PROJECT_ID}" \
    --format="value(projectId)"
)"; then
  echo "ERROR: Unable to check project existence. Verify authentication and network access." >&2
  exit 1
fi

if [[ "${project_matches}" != "${PROJECT_ID}" ]]; then
  : "${BILLING_ACCOUNT_ID:?BILLING_ACCOUNT_ID must be set when creating a project}"
  echo "Project ${PROJECT_ID} does not exist. Creating..."

  gcloud projects create "$PROJECT_ID" \
    --name="$PROJECT_NAME" \
    --organization="$ORG_ID"

  gcloud billing projects link "$PROJECT_ID" \
    --billing-account="$BILLING_ACCOUNT_ID"
else
  echo "Project ${PROJECT_ID} already exists. Proceeding..."
fi

# Keep local CLI context synced to the target project
  gcloud config set project "$PROJECT_ID" >/dev/null

  gcloud auth application-default set-quota-project "$PROJECT_ID"

# Ensure required GCP APIs are active
echo "==> Enabling required Service APIs..."
gcloud services enable storage.googleapis.com --project="${PROJECT_ID}"

echo "==> Checking Terraform state bucket: ${BUCKET_URI}"

# Check bucket existence using describe instead of list for speed & accuracy
if ! gcloud storage buckets describe "${BUCKET_URI}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "Creating Terraform state bucket..."

  if ! gcloud storage buckets create "${BUCKET_URI}" \
    --project="${PROJECT_ID}" \
    --location="${TF_STATE_LOCATION}" \
    --default-storage-class="STANDARD" \
    --uniform-bucket-level-access \
    --public-access-prevention; then

    echo "Creation returned an error; checking if another concurrent pipeline created it..."

    if ! gcloud storage buckets describe "${BUCKET_URI}" --project="${PROJECT_ID}" &>/dev/null; then
      echo "ERROR: State bucket creation failed and bucket does not exist in ${PROJECT_ID}." >&2
      exit 1
    fi
  fi
else
  echo "Terraform state bucket already exists."
fi

# 2. Enforce safety settings explicitly (using explicit flag values)
echo "==> Enforcing security posture on state bucket..."
gcloud storage buckets update "${BUCKET_URI}" \
  --project="${PROJECT_ID}" \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --versioning

# 3. Validate bucket region matching
actual_location="$(
  gcloud storage buckets describe "${BUCKET_URI}" \
    --project="${PROJECT_ID}" \
    --format="value(location)"
)"

actual_location_normalized="$(printf '%s' "${actual_location}" | tr '[:lower:]' '[:upper:]')"
expected_location_normalized="$(printf '%s' "${TF_STATE_LOCATION}" | tr '[:lower:]' '[:upper:]')"

if [[ "${actual_location_normalized}" != "${expected_location_normalized}" ]]; then
  echo "ERROR: State bucket is in ${actual_location}, expected ${TF_STATE_LOCATION}." >&2
  exit 1
fi

echo "==> Terraform state bucket is ready."

# 4. Initialize Terraform safely
echo "==> Initializing Terraform environment: ${deploy_environment}"
terraform -chdir="${TERRAFORM_DIR}" init
