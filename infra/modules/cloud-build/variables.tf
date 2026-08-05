variable "project_id" {
  description = "Project that owns the pipeline identities and artifacts bucket."
  type        = string
}

variable "region" {
  description = "Region of the Artifact Registry repository and the Cloud Run workloads."
  type        = string
}

variable "location" {
  description = "Location for the artifacts bucket."
  type        = string
}

variable "verify_service_account_id" {
  description = "Account ID for the pull-request verification identity."
  type        = string
}

variable "ci_service_account_id" {
  description = "Account ID for the build-and-publish identity."
  type        = string
}

variable "cd_service_account_id" {
  description = "Account ID for the deploy identity."
  type        = string
}

variable "artifacts_bucket_name" {
  description = "Globally unique bucket holding release archives and manifests. Never Terraform state."
  type        = string
}

variable "artifact_repository_id" {
  description = "Artifact Registry repository CI writes to and CD reads from."
  type        = string
}

variable "frontend_bucket_name" {
  description = "Frontend origin CD uploads to. Pass the storage module output."
  type        = string
}

variable "api_service_name" {
  description = "Cloud Run API service CD may update. Pass the cloud-run module output."
  type        = string
}

variable "alerter_service_name" {
  description = "Cloud Run alerter service CD may update."
  type        = string
}

variable "indexer_worker_pool_name" {
  description = "Worker Pool CD may update."
  type        = string
}

variable "api_service_account_name" {
  description = "projects/<project>/serviceAccounts/<email> form for the actAs binding, not the email."
  type        = string
}

variable "alerter_service_account_name" {
  description = "projects/<project>/serviceAccounts/<email> form for the actAs binding."
  type        = string
}

variable "indexer_service_account_name" {
  description = "projects/<project>/serviceAccounts/<email> form for the actAs binding."
  type        = string
}

variable "labels" {
  description = "Labels applied to the artifacts bucket."
  type        = map(string)
  default     = {}
}

variable "force_destroy" {
  description = "Whether Terraform may delete the artifacts bucket while it holds objects."
  type        = bool
  default     = false
}

variable "artifacts_retention_days" {
  description = "Age at which release archives are deleted. Must exceed your realistic rollback window."
  type        = number
  default     = 14
}

variable "name_prefix" {
  description = "Prefix for trigger names."
  type        = string
}

variable "connection_name" {
  description = "Cloud Build 2nd-gen host connection."
  type        = string
  default     = "swm-test"
}

variable "repository_name" {
  description = "Linked repository resource name. Cloud Build derives this from the remote URI — verify with 'gcloud builds repositories list'."
  type        = string
  default     = "Josephdara-stablecoin-whale-monitor"
}

variable "release_tag_pattern" {
  description = "Tags that trigger a deploy."
  type        = string
  default     = "^release-test-.*$"
}

variable "public_url" {
  description = "Public origin the CD smoke checks hit."
  type        = string
}

# The four below exist so the CD trigger states every target the smoke script
# needs. A substitution the trigger omits falls back to the YAML default, and
# every default in cloudbuild-cd.yaml is a test value — a prod trigger missing
# one would deploy prod and then smoke-test test, reporting green.

variable "image_name" {
  description = "Image name within the Artifact Registry repository. Stated on the CI trigger so it never resolves from the YAML default."
  type        = string
  default     = "stablecoin-whale-monitor"
}

variable "alerter_url" {
  description = "Direct run.app URL of the alerter. The smoke test asserts it rejects unauthenticated callers."
  type        = string
}

variable "events_bucket_name" {
  description = "Events bucket. The smoke test asserts its lifecycle rule and public access prevention."
  type        = string
}

variable "state_bucket_name" {
  description = "Application-state bucket. The smoke test asserts it has no lifecycle rule."
  type        = string
}

variable "terraform_state_bucket_name" {
  description = "Remote-state bucket. Duplicated from backend.tf because backend blocks cannot reference variables. No pipeline identity has access to it; the smoke test only reads its lifecycle policy when run locally."
  type        = string
  default     = "swm-gcp-state-v2"
}