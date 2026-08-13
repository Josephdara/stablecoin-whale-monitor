resource "google_secret_manager_secret" "rpc_url" {
  project   = var.project_id
  secret_id = var.rpc_secret_id
  labels    = var.labels

  replication {
    auto {}
  }
}

# Alerting disabled; keep the Gmail secret definition for easy restoration.
# resource "google_secret_manager_secret" "gmail_app_password" {
#   project   = var.project_id
#   secret_id = var.gmail_secret_id
#   labels    = var.labels
#
#   replication {
#     auto {}
#   }
# }
