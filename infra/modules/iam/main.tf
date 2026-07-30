# Create SAs

resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = var.api_service_account_id
  display_name = "SWM API runtime"
  description  = "Read-only on the events and application-state buckets. No secret access."
}

resource "google_service_account" "indexer" {
  project      = var.project_id
  account_id   = var.indexer_service_account_id
  display_name = "SWM indexer worker pool runtime"
  description  = "Create-only on events, read/write on application state, reads the RPC secret."
}

resource "google_service_account" "alerter" {
  project      = var.project_id
  account_id   = var.alerter_service_account_id
  display_name = "SWM alerter runtime"
  description  = "Read-only on events, reads the Gmail secret. No state access."
}

resource "google_service_account" "pubsub_push" {
  project      = var.project_id
  account_id   = var.pubsub_push_service_account_id
  display_name = "SWM Pub/Sub push identity"
  description  = "Mints OIDC tokens to invoke the private alerter. Invoker binding is created with the Cloud Run service."
}

resource "google_service_account" "cloud_build" {
  project      = var.project_id
  account_id   = var.cloud_build_service_account_id
  display_name = "SWM Cloud Build deployer"
  description  = "Publishes images, uploads the frontend, and reads/writes Terraform state."
}

# Indexer as objectCreator for Events bucket
resource "google_storage_bucket_iam_member" "indexer_events_creator" {
  bucket = var.events_bucket_name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.indexer.email}"
}

# Indexer as objectUser for state bucket.
resource "google_storage_bucket_iam_member" "indexer_state_user" {
  bucket = var.state_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.indexer.email}"
}

# Indexer as secretAccessor for rpc-url
resource "google_secret_manager_secret_iam_member" "indexer_rpc" {
  project   = var.project_id
  secret_id = var.rpc_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.indexer.email}"
}

# API as objectViewer for Events 

resource "google_storage_bucket_iam_member" "api_events_viewer" {
  bucket = var.events_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.api.email}"
}

# API as objectViewer for State 

resource "google_storage_bucket_iam_member" "api_state_viewer" {
  bucket = var.state_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.api.email}"
}

# alerter as objectViewer for Events

resource "google_storage_bucket_iam_member" "alerter_events_viewer" {
  bucket = var.events_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.alerter.email}"
}

# alerter as secretAccessor for Gmail key

resource "google_secret_manager_secret_iam_member" "alerter_gmail" {
  project   = var.project_id
  secret_id = var.gmail_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.alerter.email}"
}

# Cloud Build Artifact Registry writer
resource "google_artifact_registry_repository_iam_member" "build_writer" {
  project    = var.project_id
  location   = var.region
  repository = var.artifact_repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.cloud_build.email}"
}
# Cloud Build frontend object user; 
resource "google_storage_bucket_iam_member" "build_frontend" {
  bucket = var.frontend_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.cloud_build.email}"
}
# Cloud Build Terraform-state object admin
resource "google_storage_bucket_iam_member" "build_terraform_state" {
  bucket = var.terraform_state_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.cloud_build.email}"
}

# Cloud Build actAs for service accounts for scoped access
resource "google_service_account_iam_member" "build_act_as" {
  for_each = {
    api     = google_service_account.api.name
    indexer = google_service_account.indexer.name
    alerter = google_service_account.alerter.name
  }

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cloud_build.email}"
}