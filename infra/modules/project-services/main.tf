
locals {
  gcp_services = [
    "cloudresourcemanager.googleapis.com", # Cloud Resource Manager
    "serviceusage.googleapis.com",         # Service Usage
    "iam.googleapis.com",                  # Identity and Access Management (IAM)
    "iamcredentials.googleapis.com",       # IAM Service Account Credentials API
    "artifactregistry.googleapis.com",     # Artifact Registry
    "cloudbuild.googleapis.com",           # Cloud Build
    "run.googleapis.com",                  # Cloud Run
    "storage.googleapis.com",              # Cloud Storage
    # "pubsub.googleapis.com",             # Pub/Sub (alerting disabled)
    "secretmanager.googleapis.com",      # Secret Manager
    "compute.googleapis.com",            # Compute Engine
    "certificatemanager.googleapis.com", # Certificate Manager
    "dns.googleapis.com",                # Cloud DNS
    "logging.googleapis.com",            # Cloud Logging
    "monitoring.googleapis.com"          # Cloud Monitoring
  ]
}

# Enable the APIs on the project
resource "google_project_service" "gcp_services" {
  for_each = toset(local.gcp_services)

  project = var.project_id
  service = each.value

  # Prevents disabling the service when removing it from Terraform
  disable_on_destroy = false

  # Keeps dependent services active if another service relies on them
  disable_dependent_services = false
}
