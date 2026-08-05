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