resource "google_service_account" "verify" {
  project      = var.project_id
  account_id   = var.verify_service_account_id
  display_name = "SWM pipeline: PR verification"
  description  = "Runs untrusted pull-request code. Logging access only."
}

resource "google_service_account" "ci" {
  project      = var.project_id
  account_id   = var.ci_service_account_id
  display_name = "SWM pipeline: build and publish"
  description  = "Builds and pushes artifacts only."
}

resource "google_service_account" "cd" {
  project      = var.project_id
  account_id   = var.cd_service_account_id
  display_name = "SWM pipeline: deploy"
  description  = "Deploys previously built artifacts only."
}


resource "google_project_iam_member" "log_writer" {
  for_each = {
    verify = google_service_account.verify.email
    ci     = google_service_account.ci.email
    cd     = google_service_account.cd.email
  }

  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${each.value}"
}

# Release artifacts storage

resource "google_storage_bucket" "artifacts" {
  project  = var.project_id
  name     = var.artifacts_bucket_name
  location = var.location

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.force_destroy
  labels                      = var.labels

  versioning {
    enabled = false
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = var.artifacts_retention_days
    }
  }
}

# CI: produces artifacts. Cannot deploy.

resource "google_artifact_registry_repository_iam_member" "ci_writer" {
  project    = var.project_id
  location   = var.region
  repository = var.artifact_repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_storage_bucket_iam_member" "ci_artifacts_create" {
  bucket = google_storage_bucket.artifacts.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_storage_bucket_iam_member" "ci_artifacts_read" {
  bucket = google_storage_bucket.artifacts.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.ci.email}"
}

# CD: consumes artifacts and updates workloads. Cannot build or push.

resource "google_artifact_registry_repository_iam_member" "cd_reader" {
  project    = var.project_id
  location   = var.region
  repository = var.artifact_repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.cd.email}"
}

resource "google_storage_bucket_iam_member" "cd_artifacts_read" {
  bucket = google_storage_bucket.artifacts.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.cd.email}"
}

resource "google_storage_bucket_iam_member" "cd_frontend" {
  bucket = var.frontend_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.cd.email}"
}


resource "google_cloud_run_v2_service_iam_member" "cd_services" {
  for_each = toset([var.api_service_name, var.alerter_service_name])

  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.cd.email}"
}

resource "google_cloud_run_v2_worker_pool_iam_member" "cd_indexer" {
  provider = google-beta

  project  = var.project_id
  location = var.region
  name     = var.indexer_worker_pool_name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.cd.email}"
}

resource "google_service_account_iam_member" "cd_act_as" {
  for_each = {
    api     = var.api_service_account_name
    alerter = var.alerter_service_account_name
    indexer = var.indexer_service_account_name
  }

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cd.email}"
}