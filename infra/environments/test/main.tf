data "google_project" "current" {
  project_id = var.project_id
}

module "project-services" {
  source     = "../../modules/project-services"
  project_id = var.project_id
}

# Holds the single linux/amd64 application image shared by the API, alerter, and indexer worker pool. 
resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_repository_id
  format        = "DOCKER"
  description   = "Stablecoin Whale Monitor application images"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "2592000s"
    }
  }
  depends_on = [module.project-services]
}

module "storage" {
  source = "../../modules/storage"

  project_id           = var.project_id
  frontend_bucket_name = var.frontend_bucket_name
  events_bucket_name   = var.events_bucket_name
  state_bucket_name    = var.state_bucket_name
  location             = var.bucket_location
  labels               = var.common_labels
  force_destroy        = var.storage_force_destroy

  enable_event_lifecycle = var.enable_event_lifecycle
  event_retention_days   = var.event_retention_days
  event_object_prefix    = var.event_object_prefix

  depends_on = [module.project-services]
}


module "secrets" {
  source = "../../modules/secrets"

  project_id      = var.project_id
  rpc_secret_id   = var.rpc_secret_id
  gmail_secret_id = var.gmail_secret_id
  labels          = var.common_labels

  depends_on = [module.project-services]
}

module "iam" {
  source = "../../modules/iam"

  project_id = var.project_id
  region     = var.region

  api_service_account_id         = var.api_service_account_id
  indexer_service_account_id     = var.indexer_service_account_id
  alerter_service_account_id     = var.alerter_service_account_id
  pubsub_push_service_account_id = var.pubsub_push_service_account_id
  cloud_build_service_account_id = var.cloud_build_service_account_id

  frontend_bucket_name = module.storage.frontend_bucket_name
  events_bucket_name   = module.storage.events_bucket_name
  state_bucket_name    = module.storage.state_bucket_name
  rpc_secret_id        = module.secrets.rpc_secret_id
  gmail_secret_id      = module.secrets.gmail_secret_id

  terraform_state_bucket_name = var.terraform_state_bucket_name
  artifact_repository_id      = google_artifact_registry_repository.app.repository_id

  depends_on = [module.secrets]
}
