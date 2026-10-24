
variable "project_id" {
  description = "Project that owns the edge resources."
  type        = string
}

variable "project_number" {
  description = "Derives the cache-fill service agent: service-<number>@https-lb.iam.gserviceaccount.com."
  type        = string
}

variable "region" {
  description = "Region of the serverless NEG. Must match the API service."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for edge resource names."
  type        = string
}

variable "domain_name" {
  description = "Public hostname served by the load balancer."
  type        = string
}

variable "certificate_name" {
  description = "Certificate Manager certificate name."
  type        = string
}

variable "frontend_bucket_name" {
  description = "Private origin for both backend buckets. Pass the storage module output."
  type        = string
}

variable "api_service_name" {
  description = "Cloud Run service backing the NEG. Pass the Cloud Run module output."
  type        = string
}

variable "html_cache_ttl_seconds" {
  description = "CDN default, max, and client TTL for HTML and exported payloads."
  type        = number
}

variable "asset_cache_ttl_seconds" {
  description = "CDN default, max, and client TTL for content-hashed assets."
  type        = number
}

variable "frontend_edge_policy_name" {
  description = "Cloud Armor edge policy protecting both frontend backend buckets."
  type        = string
}

variable "api_security_policy_name" {
  description = "Cloud Armor backend policy protecting the API backend service."
  type        = string
}

variable "api_rate_limit_requests" {
  description = "Allowed API requests per source IP per interval."
  type        = number
}

variable "api_rate_limit_interval_seconds" {
  description = "Rate-limit interval, also used as the ban duration."
  type        = number
}

variable "api_log_sample_rate" {
  description = "Fraction of API requests written to load balancer logs, including Cloud Armor decisions. 0 to 1."
  type        = number
}

variable "services_paused" {
  description = "Stops routing /api to the API while it is paused. Those paths fall through to the frontend bucket and return 404."
  type        = bool
  default     = false
}
