output "verify_service_account_email" {
  description = "Identity for the PR trigger. Declare in both the trigger and cloudbuild-verify.yaml."
  value       = google_service_account.verify.email
}

output "ci_service_account_email" {
  description = "Identity for the main-branch build trigger."
  value       = google_service_account.ci.email
}

output "cd_service_account_email" {
  description = "Identity for the approval-gated deploy trigger."
  value       = google_service_account.cd.email
}

output "artifacts_bucket_name" {
  description = "Release archive and manifest location; substituted into the CI and CD pipelines."
  value       = google_storage_bucket.artifacts.name
}