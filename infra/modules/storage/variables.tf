variable "project_id" {
  description = "Project ID."
  type        = string
}

variable "frontend_bucket_name" {
  description = " Private bucket containing static frontend."
  type        = string
}

variable "events_bucket_name" {
  description = "Bucket containing immutable NDJSON event batches."
  type        = string
}

variable "state_bucket_name" {
  description = "Bucket containing mutable checkpoints and token metadata."
  type        = string
}

variable "location" {
  description = "Location for all three application buckets."
  type        = string
}

variable "labels" {
  description = "Labels applied to all three buckets."
  type        = map(string)
  default     = {}
}

variable "force_destroy" {
  description = "Whether Terraform may delete non-empty application buckets."
  type        = bool
}



variable "event_retention_days" {
  description = "Maximum days for events in events_bucket storage."
  type        = number
  default     = 7
}

variable "event_object_prefix" {
  description = "Object prefix the lifecycle rule is scoped to."
  type        = string
  default     = "ethereum/ranges/"
}
