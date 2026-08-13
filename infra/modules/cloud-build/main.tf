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

# gcloud storage rsync reads bucket metadata before syncing, and objectUser is
# objects-only. legacyBucketReader is the narrowest role carrying
# storage.buckets.get — 7 permissions, still scoped to this one bucket.
resource "google_storage_bucket_iam_member" "cd_frontend_bucket_reader" {
  bucket = var.frontend_bucket_name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.cd.email}"
}


resource "google_cloud_run_v2_service_iam_member" "cd_services" {
  # Alerting disabled; keep the former target list for easy restoration.
  # for_each = toset([var.api_service_name, var.alerter_service_name])
  for_each = toset([var.api_service_name])

  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.cd.email}"
}


resource "google_project_iam_custom_role" "run_operations_reader" {
  project     = var.project_id
  role_id     = "swmRunOperationsReader"
  title       = "SWM Cloud Run operations reader"
  description = "Read Cloud Run long-running operations. Required to poll a worker pool update to completion."
  permissions = ["run.operations.get"]
}

resource "google_project_iam_member" "cd_run_operations" {
  project = var.project_id
  role    = google_project_iam_custom_role.run_operations_reader.id
  member  = "serviceAccount:${google_service_account.cd.email}"
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
    api = var.api_service_account_name
    # alerter = var.alerter_service_account_name
    indexer = var.indexer_service_account_name
  }

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cd.email}"
}

# Triggers.


locals {
  repository = "projects/${var.project_id}/locations/${var.region}/connections/${var.connection_name}/repositories/${var.repository_name}"
}

resource "google_cloudbuild_trigger" "verify" {
  project         = var.project_id
  location        = var.region
  name            = "${var.name_prefix}-verify"
  description     = "PR verification. Tests, typecheck, fmt, validate. Mutates nothing."
  filename        = "cloudbuild/cloudbuild-verify.yaml"
  service_account = google_service_account.verify.id

  repository_event_config {
    repository = local.repository
    pull_request {
      branch          = "^main$"
      comment_control = "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY"
    }
  }
}

resource "google_cloudbuild_trigger" "ci" {
  project         = var.project_id
  location        = var.region
  name            = "${var.name_prefix}-ci"
  description     = "Build and publish an immutable release for the pushed commit."
  filename        = "cloudbuild/cloudbuild-ci.yaml"
  service_account = google_service_account.ci.id

  repository_event_config {
    repository = local.repository
    push {
      branch = "^main$"
    }
  }

  substitutions = {
    _REGION           = var.region
    _REPO             = var.artifact_repository_id
    _IMAGE_NAME       = var.image_name
    _ARTIFACTS_BUCKET = google_storage_bucket.artifacts.name
  }
}

resource "google_cloudbuild_trigger" "cd" {
  project         = var.project_id
  location        = var.region
  name            = "${var.name_prefix}-cd"
  description     = "Deploy a previously published release. No build, no Terraform, no state."
  filename        = "cloudbuild/cloudbuild-cd.yaml"
  service_account = google_service_account.cd.id

  repository_event_config {
    repository = local.repository
    push {
      tag = var.release_tag_pattern
    }
  }

  approval_config {
    approval_required = true
  }

  # Every environment-specific value the pipeline touches must be stated here.
  # A key omitted from this map resolves to the YAML default instead, and those
  # defaults are all test values.
  substitutions = {
    _REGION           = var.region
    _ARTIFACTS_BUCKET = google_storage_bucket.artifacts.name
    _FRONTEND_BUCKET  = var.frontend_bucket_name
    _API_SERVICE      = var.api_service_name
    # _ALERTER_SERVICE  = var.alerter_service_name
    _INDEXER_POOL = var.indexer_worker_pool_name
    _PUBLIC_URL   = var.public_url
    # _ALERTER_URL      = var.alerter_url
    _EVENTS_BUCKET   = var.events_bucket_name
    _STATE_BUCKET    = var.state_bucket_name
    _TF_STATE_BUCKET = var.terraform_state_bucket_name
  }
}
