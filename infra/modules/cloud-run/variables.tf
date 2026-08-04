variable "project_id" {
  description = "Project that owns the Cloud Run workloads."
  type        = string
}

variable "region" {
  description = "Region for all three workloads."
  type        = string
}

variable "application_image" {
  description = "Digest-qualified image reference shared by all three workloads."
  type        = string

}

variable "labels" {
  description = "Labels applied to all three workloads."
  type        = map(string)
  default     = {}
}

variable "deletion_protection" {
  description = "Cloud Run v2 services default this to true, which blocks terraform destroy."
  type        = bool
  default     = false
}

variable "events_bucket_name" {
  description = "GCS_EVENTS_BUCKET. Pass the storage module output to establish ordering."
  type        = string
}

variable "state_bucket_name" {
  description = "GCS_STATE_BUCKET. Pass the storage module output."
  type        = string
}

variable "rpc_secret_id" {
  description = "RPC secret ID. Pass the secrets module output."
  type        = string
}

variable "gmail_secret_id" {
  description = "Gmail secret ID. Pass the secrets module output."
  type        = string
}

variable "chain_id" {
  description = "Expected Ethereum chain ID, consumed by both the API and the indexer."
  type        = number
}


variable "api_service_name" {
  description = "Cloud Run API service name."
  type        = string
}

variable "api_service_account_email" {
  description = "Attached API runtime identity. Pass the IAM module output."
  type        = string
}

variable "api_min_instances" {
  description = "Zero preserves request-based scale-to-zero billing."
  type        = number
}

variable "api_max_instances" {
  description = "Maximum API instances."
  type        = number
}

variable "api_concurrency" {
  description = "Maximum concurrent requests per API instance."
  type        = number
}

variable "api_timeout_seconds" {
  description = "Cloud Run request timeout for the API."
  type        = number
}

variable "api_refresh_ms" {
  description = "Maximum age of the in-memory index before a request forces a refresh."
  type        = number
}

variable "api_refresh_deadline_ms" {
  description = "Maximum time a request waits for a required storage refresh."
  type        = number
}

variable "api_max_page_size" {
  description = "Maximum transfer page size accepted by the API."
  type        = number
}

variable "api_allowed_origin" {
  description = "HTTPS browser origin accepted by the API."
  type        = string
}

variable "event_retention_days" {
  description = "Becomes RETENTION_DAYS. The API is the correctness boundary for retention."
  type        = number
}

variable "api_cpu" {
  description = "API CPU limit."
  type        = string
}

variable "api_memory" {
  description = "API memory limit."
  type        = string
}


variable "alerter_service_name" {
  description = "Private Cloud Run alerter service name."
  type        = string
}

variable "alerter_service_account_email" {
  description = "Attached alerter runtime identity. Pass the IAM module output."
  type        = string
}

variable "pubsub_push_service_account_email" {
  description = "Push identity receiving roles/run.invoker on the alerter."
  type        = string
}

variable "alerter_min_instances" {
  description = "Minimum alerter instances."
  type        = number
}

variable "alerter_max_instances" {
  description = "Maximum alerter instances."
  type        = number
}

variable "alerter_timeout_seconds" {
  description = "Cloud Run request timeout for the alerter."
  type        = number
}

variable "alert_minimum_amount" {
  description = "Minimum transfer amount generating an email, as a decimal string."
  type        = string
}

variable "alert_email_to" {
  description = "Alert recipient. Injected outside tfvars via TF_VAR_alert_email_to."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.alert_email_to)) > 0
    error_message = "alert_email_to must be non-empty; the alerter exits at startup without it."
  }
}

variable "alert_email_from" {
  description = "Gmail address owning the app password. Injected outside tfvars."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.alert_email_from)) > 0
    error_message = "alert_email_from must be non-empty; the alerter exits at startup without it."
  }
}

variable "alerter_cpu" {
  description = "Alerter CPU limit."
  type        = string
}

variable "alerter_memory" {
  description = "Alerter memory limit."
  type        = string
}


variable "indexer_worker_pool_name" {
  description = "Cloud Run Worker Pool name for the continuous indexer."
  type        = string
}

variable "indexer_service_account_email" {
  description = "Attached indexer identity. Pass the IAM module output."
  type        = string
}

variable "start_block" {
  description = "First block processed when no checkpoint exists. Inert once a checkpoint is written."
  type        = number
}

variable "confirmation_buffer" {
  description = "Latest blocks excluded to reduce reorganization risk."
  type        = number
}

variable "block_batch_size" {
  description = "Maximum blocks processed in one indexer batch."
  type        = number
}

variable "rpc_log_chunk_size" {
  description = "Blocks per eth_getLogs call. Startup fails if this exceeds block_batch_size."
  type        = number
}

variable "poll_interval_ms" {
  description = "Delay between indexing cycles."
  type        = number
}

variable "rpc_timeout_ms" {
  description = "Timeout for an individual RPC request."
  type        = number
}

variable "rpc_max_retries" {
  description = "Maximum RPC retry count."
  type        = number
}

variable "rpc_retry_base_ms" {
  description = "Base RPC retry delay."
  type        = number
}

variable "max_rpc_response_bytes" {
  description = "Maximum accepted RPC response size."
  type        = number
}

variable "minimum_transfer_amount" {
  description = "Becomes MIN_AMOUNT, not MINIMUM_TRANSFER_AMOUNT. Decimal string."
  type        = string
}

variable "transfer_topic" {
  description = "ERC-20 Transfer event topic."
  type        = string
}

variable "usdc_address" {
  description = "USDC contract address."
  type        = string
}

variable "usdc_decimals" {
  description = "USDC decimals."
  type        = number
}

variable "usdt_address" {
  description = "USDT contract address."
  type        = string
}

variable "usdt_decimals" {
  description = "USDT decimals."
  type        = number
}

variable "indexer_lock_file" {
  description = "Process-lock path. /app/data exists and is owned by node per the Dockerfile."
  type        = string
}

variable "indexer_cpu" {
  description = "Indexer CPU limit."
  type        = string
}

variable "indexer_memory" {
  description = "Indexer memory limit."
  type        = string
}