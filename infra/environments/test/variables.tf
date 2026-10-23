variable "project_id" {
  description = "Google Cloud project ID for the test environment."
  type        = string


}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "test"

  validation {
    condition     = contains(["test", "prod"], var.environment)
    error_message = "environment must be either test or prod."
  }
}

variable "region" {
  description = "Primary Google Cloud region for regional resources."
  type        = string
  default     = "us-east4"

  validation {
    condition     = var.region == "us-east4"
    error_message = "This architecture is fixed to us-east4."
  }
}


variable "name_prefix" {
  description = "Prefix used to create predictable environment-specific resource names."
  type        = string
  default     = "swm-test"

}

variable "common_labels" {
  description = "Labels applied to supported resources."
  type        = map(string)
  default = {
    application = "stablecoin-whale-monitor"
    environment = "test"
    managed_by  = "terraform"
  }
  nullable = false
}

variable "artifact_repository_id" {
  description = "Artifact Registry Docker repository ID."
  type        = string
  default     = "swm-app"


}

variable "application_image" {
  description = "Immutable application image reference. Leave empty until the first image digest is published."
  type        = string
  default     = ""


}

variable "frontend_bucket_name" {
  description = "Globally unique private bucket containing the exported frontend."
  type        = string


}

variable "events_bucket_name" {
  description = "Globally unique bucket containing immutable NDJSON event batches."
  type        = string

}

variable "state_bucket_name" {
  description = "Globally unique bucket containing mutable application checkpoints and token metadata."
  type        = string


}

variable "bucket_location" {
  description = "Location used by application Cloud Storage buckets."
  type        = string
  default     = "US-EAST4"


}

variable "storage_force_destroy" {
  description = "Whether Terraform may delete non-empty application buckets. Enable only for disposable test environments."
  type        = bool
  default     = true
}



variable "event_retention_days" {
  description = "Visible API retention and eventual event-object lifecycle age in days."
  type        = number
  default     = 7


}

variable "api_service_name" {
  description = "Cloud Run API service name."
  type        = string
  default     = "swm-api-test"
}

# Alerting disabled; keep the variable for easy restoration.
# variable "alerter_service_name" {
#   description = "Private Cloud Run alerter service name."
#   type        = string
#   default     = "swm-alerter-test"
# }

variable "indexer_worker_pool_name" {
  description = "Cloud Run Worker Pool name for the continuous indexer."
  type        = string
  default     = "swm-indexer-test"
}

variable "api_service_account_id" {
  description = "Account ID for the API runtime service account."
  type        = string
  default     = "swm-test-api"
}

variable "indexer_service_account_id" {
  description = "Account ID for the indexer Worker Pool service account."
  type        = string
  default     = "swm-test-indexer"
}

# variable "alerter_service_account_id" {
#   description = "Account ID for the alerter runtime service account."
#   type        = string
#   default     = "swm-test-alerter"
# }
#
# variable "pubsub_push_service_account_id" {
#   description = "Account ID used by Pub/Sub for authenticated push delivery."
#   type        = string
#   default     = "swm-test-pubsub-push"
# }


variable "rpc_secret_id" {
  description = "Secret Manager secret ID containing the Google Blockchain RPC URL."
  type        = string
  default     = "swm-rpc-url"
}

# variable "gmail_secret_id" {
#   description = "Secret Manager secret ID containing the Gmail app password."
#   type        = string
#   default     = "swm-gmail-app-password"
# }

variable "chain_id" {
  description = "Expected Ethereum chain ID."
  type        = number
  default     = 1

  validation {
    condition     = var.chain_id == 1
    error_message = "The current deployment supports Ethereum mainnet chain ID 1."
  }
}

variable "start_block" {
  description = "First Ethereum block processed when no checkpoint exists."
  type        = number
  default     = 25638000

  validation {
    condition     = var.start_block >= 25638000
    error_message = "start_block must be greater than block 25638000."
  }
}

variable "confirmation_buffer" {
  description = "Number of latest Ethereum blocks excluded to reduce reorganization risk."
  type        = number
  default     = 6
}

variable "block_batch_size" {
  description = "Maximum number of blocks processed in one indexer batch."
  type        = number
  default     = 5
}

variable "rpc_log_chunk_size" {
  description = "Maximum number of blocks requested by each eth_getLogs call; it must not exceed block_batch_size."
  type        = number
  default     = 5
}

variable "poll_interval_ms" {
  description = "Worker Pool delay between indexing cycles in milliseconds."
  type        = number
  default     = 30000
}

variable "minimum_transfer_amount" {
  description = "Minimum USDC or USDT amount retained by the indexer, represented as a decimal string."
  type        = string
  default     = "100000"

}

variable "rpc_timeout_ms" {
  description = "Timeout for an individual RPC request in milliseconds."
  type        = number
  default     = 20000
}

variable "rpc_max_retries" {
  description = "Maximum RPC retry count."
  type        = number
  default     = 2
}

variable "rpc_retry_base_ms" {
  description = "Base RPC retry delay in milliseconds."
  type        = number
  default     = 5000
}

variable "max_rpc_response_bytes" {
  description = "Maximum accepted RPC response size in bytes."
  type        = number
  default     = 10485760
}

variable "usdc_address" {
  description = "Ethereum mainnet USDC token contract address."
  type        = string
  default     = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

}

variable "usdt_address" {
  description = "Ethereum mainnet USDT token contract address."
  type        = string
  default     = "0xdac17f958d2ee523a2206206994597c13d831ec7"


}

variable "transfer_topic" {
  description = "ERC-20 Transfer event topic."
  type        = string
  default     = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


}

variable "usdc_decimals" {
  description = "USDC token decimals."
  type        = number
  default     = 6
}

variable "usdt_decimals" {
  description = "USDT token decimals."
  type        = number
  default     = 6
}

variable "indexer_lock_file" {
  description = "Writable process-lock path inside the Worker Pool container."
  type        = string
  default     = "/app/data/indexer.lock"
}

variable "api_refresh_ms" {
  description = "Maximum age of the API in-memory index before a request requires refresh."
  type        = number
  default     = 30000
}

variable "api_refresh_deadline_ms" {
  description = "Maximum time a request waits for a required storage refresh."
  type        = number
  default     = 5000
}

variable "api_max_stale_ms" {
  description = "Maximum age at which the API may serve its cached index after a refresh failure."
  type        = number
  default     = 600000
}

variable "api_max_page_size" {
  description = "Maximum transfer page size accepted by the API."
  type        = number
  default     = 50
}

variable "api_allowed_origin" {
  description = "HTTPS browser origin accepted by the API."
  type        = string
  default     = "https://swm.josephdara.com"


}

variable "api_min_instances" {
  description = "Minimum API instances. Use at least one when background refresh cadence must continue without requests."
  type        = number
  default     = 0
}

variable "api_max_instances" {
  description = "Maximum number of API instances."
  type        = number
  default     = 3
}

variable "api_concurrency" {
  description = "Maximum concurrent requests per API instance."
  type        = number
  default     = 80
}

variable "api_timeout_seconds" {
  description = "Cloud Run API request timeout in seconds."
  type        = number
  default     = 60
}

variable "api_cpu" {
  description = "Cloud Run API CPU limit."
  type        = string
  default     = "1"
}

variable "api_memory" {
  description = "Cloud Run API memory limit."
  type        = string
  default     = "512Mi"
}

# Alerting disabled; keep the service settings for easy restoration.
# variable "alert_minimum_amount" {
#   description = "Minimum transfer amount that generates an email alert, represented as a decimal string."
#   type        = string
#   default     = "1000000"
#
#
# }

variable "alert_email_to" {
  description = "Email address receiving whale-transfer alerts."
  type        = string
  default     = ""
  sensitive   = true
}

# variable "alert_email_from" {
#   description = "Gmail address owning the app password. It may remain empty until the alerter is deployed."
#   type        = string
#   default     = ""
#   sensitive   = true
# }
#
# variable "alerter_min_instances" {
#   description = "Minimum alerter instances."
#   type        = number
#   default     = 0
# }
#
# variable "alerter_max_instances" {
#   description = "Maximum alerter instances."
#   type        = number
#   default     = 1
# }
#
# variable "alerter_timeout_seconds" {
#   description = "Cloud Run alerter request timeout in seconds."
#   type        = number
#   default     = 60
# }
#
# variable "alerter_cpu" {
#   description = "Cloud Run alerter CPU limit."
#   type        = string
#   default     = "1"
# }
#
# variable "alerter_memory" {
#   description = "Cloud Run alerter memory limit."
#   type        = string
#   default     = "512Mi"
# }

variable "indexer_cpu" {
  description = "Cloud Run Worker Pool indexer CPU limit."
  type        = string
  default     = "1"
}

variable "indexer_memory" {
  description = "Cloud Run Worker Pool indexer memory limit."
  type        = string
  default     = "512Mi"
}

# Alerting disabled; keep the dedicated Pub/Sub settings for restoration.
# variable "event_topic_name" {
#   description = "Pub/Sub topic receiving Cloud Storage event notifications."
#   type        = string
#   default     = "swm-events-test"
# }
#
# variable "dead_letter_topic_name" {
#   description = "Pub/Sub dead-letter topic."
#   type        = string
#   default     = "swm-alerts-dlq-test"
# }
#
# variable "alert_subscription_name" {
#   description = "Authenticated Pub/Sub push subscription for the alerter."
#   type        = string
#   default     = "swm-alerts-push-test"
# }
#
# variable "dead_letter_subscription_name" {
#   description = "Pull subscription used to inspect dead-lettered messages."
#   type        = string
#   default     = "swm-alerts-dlq-catch-test"
# }
#
# variable "pubsub_ack_deadline_seconds" {
#   description = "Pub/Sub push acknowledgment deadline in seconds."
#   type        = number
#   default     = 30
# }
#
# variable "pubsub_max_delivery_attempts" {
#   description = "Maximum delivery attempts before forwarding a message to the dead-letter topic."
#   type        = number
#   default     = 5
# }
#
# variable "pubsub_minimum_backoff_seconds" {
#   description = "Minimum Pub/Sub retry backoff in seconds."
#   type        = number
#   default     = 10
# }
#
# variable "pubsub_maximum_backoff_seconds" {
#   description = "Maximum Pub/Sub retry backoff in seconds."
#   type        = number
#   default     = 600
# }

variable "event_object_prefix" {
  description = "Cloud Storage prefix that produces Pub/Sub event notifications and receives lifecycle deletion."
  type        = string
  default     = "ethereum/ranges/"
}

variable "domain_name" {
  description = "Public hostname routed through the global external Application Load Balancer."
  type        = string
  default     = "swm.josephdara.com"


}

variable "dns_managed_zone_name" {
  description = "Existing Cloud DNS managed-zone name. Leave empty when DNS is managed outside this Terraform root."
  type        = string
  default     = ""
}

variable "certificate_name" {
  description = "Certificate Manager certificate name."
  type        = string
  default     = "swm-test-certificate"
}

variable "html_cache_ttl_seconds" {
  description = "Cloud CDN default, maximum, and client TTL for HTML and exported payloads."
  type        = number
  default     = 60
}

variable "asset_cache_ttl_seconds" {
  description = "Cloud CDN default, maximum, and client TTL for content-hashed Next.js assets."
  type        = number
  default     = 31536000
}

variable "frontend_edge_policy_name" {
  description = "Cloud Armor edge security policy protecting both frontend backend buckets."
  type        = string
  default     = "swm-frontend-edge-test"
}

variable "api_security_policy_name" {
  description = "Cloud Armor backend security policy protecting the API backend service."
  type        = string
  default     = "swm-api-security-test"
}

variable "api_rate_limit_requests" {
  description = "Allowed API requests per source IP in each configured interval."
  type        = number
  default     = 60
}

variable "api_rate_limit_interval_seconds" {
  description = "Cloud Armor API rate-limit interval in seconds."
  type        = number
  default     = 60
}


variable "verify_service_account_id" {
  description = "Account ID for the PR verification identity. Environment-neutral: service accounts are project-scoped."
  type        = string
  default     = "swm-cloud-build-verify"
}

variable "ci_service_account_id" {
  description = "Account ID for the build-and-publish identity."
  type        = string
  default     = "swm-cloud-build-ci"
}

variable "cd_service_account_id" {
  description = "Account ID for the deploy identity."
  type        = string
  default     = "swm-cloud-build-cd"
}

variable "planner_service_account_id" {
  description = "Account ID for the read-only Terraform planning identity."
  type        = string
  default     = "swm-terraform-plan"
}

variable "terraform_state_bucket_name" {
  description = "Bucket holding Terraform state. Must match the bucket in backend.tf."
  type        = string
}

variable "planner_impersonators" {
  description = "Principals allowed to impersonate the Terraform planner."
  type        = list(string)
  default     = []
}

variable "github_repository_id" {
  description = "Numeric GitHub repository ID allowed to federate to the planner."
  type        = string
}

variable "github_repository_owner_id" {
  description = "Numeric GitHub owner ID of that repository."
  type        = string
}

variable "github_plan_workflow" {
  description = "Workflow path allowed to federate, without @ref."
  type        = string
}
