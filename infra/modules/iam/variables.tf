variable "project_id" {
  description = "Project ID."
  type        = string
}



variable "api_service_account_id" {
  description = "Account ID for the API runtime service account."
  type        = string
}

variable "indexer_service_account_id" {
  description = "Account ID for the indexer Worker Pool service account."
  type        = string
}

variable "alerter_service_account_id" {
  description = "Account ID for the alerter runtime service account."
  type        = string
}

variable "pubsub_push_service_account_id" {
  description = "Account ID used by Pub/Sub for authenticated push delivery."
  type        = string
}


variable "events_bucket_name" {
  description = "Events bucket. passed from the storage module output."
  type        = string
}

variable "state_bucket_name" {
  description = "Application-state bucket. passed from the storage module output."
  type        = string
}

variable "rpc_secret_id" {
  description = "RPC secret ID. passed from the secrets module output."
  type        = string
}

variable "gmail_secret_id" {
  description = "Gmail secret ID. passed from the secrets module output."
  type        = string
}