
output "api_service_account_email" {
  description = "Attached to the Cloud Run API service."
  value       = google_service_account.api.email
}

output "indexer_service_account_email" {
  description = "Attached to the indexer Worker Pool."
  value       = google_service_account.indexer.email
}

output "alerter_service_account_email" {
  description = "Attached to the private Cloud Run alerter."
  value       = google_service_account.alerter.email
}

output "pubsub_push_service_account_email" {
  description = "Push identity; receives roles/run.invoker on the alerter in the Cloud Run phase."
  value       = google_service_account.pubsub_push.email
}

output "cloud_build_service_account_email" {
  description = "Build and deploy identity."
  value       = google_service_account.cloud_build.email
}
output "api_service_account_name" {
  description = "projects/<project>/serviceAccounts/<email> form, for actAs bindings."
  value       = google_service_account.api.name
}

output "alerter_service_account_name" {
  description = "projects/<project>/serviceAccounts/<email> form, for actAs bindings."
  value       = google_service_account.alerter.name
}

output "indexer_service_account_name" {
  description = "projects/<project>/serviceAccounts/<email> form, for actAs bindings."
  value       = google_service_account.indexer.name
}