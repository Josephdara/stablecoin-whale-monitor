
resource "google_storage_bucket" "frontend" {
  name          = var.frontend_bucket_name
  location      = var.location
  force_destroy = var.force_destroy


  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "404.html"
  }

  labels = var.labels

}

resource "google_storage_bucket" "events" {
  project       = var.project_id
  name          = var.events_bucket_name
  location      = var.location
  force_destroy = var.force_destroy

  public_access_prevention = "enforced"

  uniform_bucket_level_access = true
  labels                      = var.labels

  soft_delete_policy {
    retention_duration_seconds = 0
  }

  lifecycle_rule {
    condition {
      age            = var.event_retention_days
      matches_prefix = [var.event_object_prefix]

    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "app_state" {
  project       = var.project_id
  name          = var.state_bucket_name
  location      = var.location
  force_destroy = var.force_destroy


  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true
  labels                      = var.labels
}
