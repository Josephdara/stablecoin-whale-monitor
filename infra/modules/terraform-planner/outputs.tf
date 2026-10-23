output "planner_service_account_email" {
  description = "Impersonated for local plans; federated to GitHub Actions later."
  value       = google_service_account.planner.email
}

output "github_workload_identity_provider" {
  description = "Provider resource name used by the plan workflow to authenticate."
  value       = google_iam_workload_identity_pool_provider.github_actions.name
}
