output "planner_service_account_email" {
  description = "Impersonated for local plans; federated to GitHub Actions later."
  value       = google_service_account.planner.email
}
