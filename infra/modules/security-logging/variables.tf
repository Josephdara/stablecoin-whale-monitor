variable "project_id" {
  description = "Project whose audit logs are configured and routed."
  type        = string
}

variable "environment" {
  description = "Environment name, used in alert display names and the log metric name."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for the log bucket, sink, and exclusion names."
  type        = string
}

variable "location" {
  description = "Region of the security log bucket."
  type        = string
}

variable "retention_days" {
  description = "Retention for the security log bucket. The bucket is not locked, so this can be changed."
  type        = number
}

variable "security_log_readers" {
  description = "Principals granted read access to the security log view, in IAM member form."
  type        = list(string)
}

variable "workload_service_account_emails" {
  description = "Workload identities exempt from Cloud Storage Data Access logging."
  type        = list(string)
}

variable "notification_channel_id" {
  description = "Channel for every security alert. Pass the monitoring module output."
  type        = string
}

variable "api_backend_service_name" {
  description = "Scopes Cloud Armor denial logs to the API backend. Pass the edge module output."
  type        = string
}

variable "armor_denied_threshold" {
  description = "Logged Cloud Armor denials per 5 minutes that trigger an alert. Logged counts scale with the load balancer sample rate."
  type        = number
  default     = 100
}
