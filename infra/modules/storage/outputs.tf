

output "frontend_bucket_name" {
  description = "Cloud Build upload target and backend-bucket origin."
  value       = google_storage_bucket.frontend.name
}



output "frontend_bucket_self_link" {
  description = "The URI of the created resource."
  value       = google_storage_bucket.frontend.self_link
}

output "events_bucket_name" {
  description = "Supplies GCS_EVENTS_BUCKET to the indexer, API, and alerter."
  value       = google_storage_bucket.events.name
}



output "events_bucket_self_link" {
  description = "The URI of the created resource."
  value       = google_storage_bucket.events.self_link
}

output "state_bucket_name" {
  description = "Supplies GCS_STATE_BUCKET to the indexer and API."
  value       = google_storage_bucket.app_state.name
}



output "state_bucket_self_link" {
  description = "The URI of the created resource."
  value       = google_storage_bucket.app_state.self_link
}