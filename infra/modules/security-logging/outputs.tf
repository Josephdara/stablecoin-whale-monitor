output "security_log_bucket_id" {
  description = "Full resource name of the security log bucket, for Logs Explorer scope and log queries."
  value       = google_logging_project_bucket_config.security.id
}

output "armor_denied_metric_name" {
  description = "Log-based metric counting Cloud Armor denials on the API backend."
  value       = google_logging_metric.armor_denied.name
}
