output "rpc_secret_id" {
  description = "Short secret ID, e.g. swm-rpc-url. Consumed by IAM bindings and Cloud Run secret references."
  value       = google_secret_manager_secret.rpc_url.secret_id
}

output "rpc_secret_name" {
  description = "Full projects/<number>/secrets/<id> name, for gcloud and cross-project references."
  value       = google_secret_manager_secret.rpc_url.id
}

# Alerting disabled; keep the outputs for easy restoration.
# output "gmail_secret_id" {
#   description = "Short secret ID, e.g. swm-gmail-app-password."
#   value       = google_secret_manager_secret.gmail_app_password.secret_id
# }
#
# output "gmail_secret_name" {
#   description = "Full projects/<number>/secrets/<id> name."
#   value       = google_secret_manager_secret.gmail_app_password.id
# }
