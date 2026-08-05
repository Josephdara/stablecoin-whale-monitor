output "notification_channel_id" {
  description = "Email channel shared by every alert policy."
  value       = google_monitoring_notification_channel.email.id
}

output "uptime_check_id" {
  description = "Uptime check ID, referenced by its own alert policy filter."
  value       = google_monitoring_uptime_check_config.api.uptime_check_id
}

output "indexer_cycle_metric_name" {
  description = "Log-based metric backing the stall alert; useful for verifying it counts after apply."
  value       = google_logging_metric.indexer_cycles.name
}