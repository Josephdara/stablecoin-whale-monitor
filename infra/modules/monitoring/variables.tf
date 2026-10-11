variable "project_id" {
  description = "Project that owns the alert policies, uptime check, and log metric."
  type        = string
}

variable "environment" {
  description = "Environment name, used in display names and the log metric name."
  type        = string
}

variable "domain_name" {
  description = "Hostname probed by the uptime check."
  type        = string
}

variable "alert_email_to" {
  description = "Recipient for every alert policy. Google sends a verification email before delivery works."
  type        = string
  sensitive   = true
}

variable "url_map_name" {
  description = "Scopes load balancer metrics to this estate. Pass the edge module output."
  type        = string
}

variable "api_backend_service_name" {
  description = "Scopes load balancer metrics to the API rather than the frontend backend buckets."
  type        = string
}

variable "api_service_name" {
  description = "Cloud Run API service name, used to scope degraded-health logs."
  type        = string
}

# Alerting disabled; keep these inputs for easy restoration.
# variable "dead_letter_subscription_name" {
#   description = "DLQ inspection subscription. Pass the pubsub module output."
#   type        = string
# }
#
# variable "alert_subscription_name" {
#   description = "Push subscription whose backlog age is monitored."
#   type        = string
# }

variable "indexer_worker_pool_name" {
  description = "Worker Pool name, used by both indexer policies and the log metric filter."
  type        = string
}

variable "api_5xx_rate_threshold" {
  description = "5xx requests/second over the alert's 30-minute window. 0.001 is about 2 errors per 30 minutes. The previous 0.01 was 27x above the observed failure rate of 32 errors/day and never fired."
  type        = number
  default     = 0.001
}

variable "api_latency_threshold_ms" {
  description = "p99 request latency in milliseconds that triggers an alert."
  type        = number
  default     = 2000
}

# variable "push_backlog_age_threshold_seconds" {
#   description = "Oldest unacked message age indicating the alerter is not keeping up. A number, not a duration string."
#   type        = number
#   default     = 600
# }

variable "indexer_stall_duration_seconds" {
  description = "How long durable range-progress logs may be absent before alerting."
  type        = string
  default     = "300s"
}

variable "api_degraded_duration_seconds" {
  description = "How long degraded API health must persist before sending a warning."
  type        = string
  default     = "600s"
}

variable "services_paused" {
  description = "Disables the API and indexer alert policies while those services are deliberately offline."
  type        = bool
  default     = false
}
