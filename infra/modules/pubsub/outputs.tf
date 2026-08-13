/* Alerting disabled; keep the complete output interface for restoration.
output "event_topic_name" {
  description = "Event topic name, for monitoring filters."
  value       = google_pubsub_topic.events.name
}

output "event_topic_id" {
  description = "Full projects/<id>/topics/<name> resource ID."
  value       = google_pubsub_topic.events.id
}

output "dead_letter_topic_name" {
  description = "Dead-letter topic name."
  value       = google_pubsub_topic.dead_letter.name
}

output "dead_letter_topic_id" {
  description = "Full dead-letter topic resource ID."
  value       = google_pubsub_topic.dead_letter.id
}

output "alert_subscription_name" {
  description = "Push subscription name; target of the oldest-unacked-message and backlog alerts."
  value       = google_pubsub_subscription.alerts_push.name
}

output "dead_letter_subscription_name" {
  description = "DLQ inspection subscription; target of the dead-letter depth alert."
  value       = google_pubsub_subscription.dead_letter.name
}

output "notification_id" {
  description = "Cloud Storage notification ID, for the smoke test to confirm the prefix binding."
  value       = google_storage_notification.events.id
}
*/
