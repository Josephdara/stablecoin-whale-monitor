/* Alerting disabled; keep the complete Pub/Sub implementation for restoration.
data "google_storage_project_service_account" "gcs" {
  project = var.project_id
}

locals {
  pubsub_agent = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_topic" "events" {
  project = var.project_id
  name    = var.event_topic_name
  labels  = var.labels
}

resource "google_pubsub_topic" "dead_letter" {
  project = var.project_id
  name    = var.dead_letter_topic_name
  labels  = var.labels
}

resource "google_pubsub_topic_iam_member" "gcs_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.events.id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${data.google_storage_project_service_account.gcs.email_address}"
}

resource "google_pubsub_topic_iam_member" "pubsub_dlq_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.dead_letter.id
  role    = "roles/pubsub.publisher"
  member  = local.pubsub_agent
}

resource "google_pubsub_subscription" "alerts_push" {
  project              = var.project_id
  name                 = var.alert_subscription_name
  topic                = google_pubsub_topic.events.id
  ack_deadline_seconds = var.pubsub_ack_deadline_seconds
  labels               = var.labels

  push_config {
    push_endpoint = var.alerter_push_endpoint


    oidc_token {
      service_account_email = var.pubsub_push_service_account_email
    }
  }

  retry_policy {
    minimum_backoff = "${var.pubsub_minimum_backoff_seconds}s"
    maximum_backoff = "${var.pubsub_maximum_backoff_seconds}s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = var.pubsub_max_delivery_attempts
  }

  expiration_policy {
    ttl = ""
  }
}


resource "google_pubsub_subscription_iam_member" "pubsub_subscriber" {
  project      = var.project_id
  subscription = google_pubsub_subscription.alerts_push.name
  role         = "roles/pubsub.subscriber"
  member       = local.pubsub_agent
}

resource "google_pubsub_subscription" "dead_letter" {
  project               = var.project_id
  name                  = var.dead_letter_subscription_name
  topic                 = google_pubsub_topic.dead_letter.id
  ack_deadline_seconds  = var.pubsub_ack_deadline_seconds
  labels                = var.labels
  retain_acked_messages = false

  expiration_policy {
    ttl = ""
  }
}

resource "google_storage_notification" "events" {
  bucket             = var.events_bucket_name
  topic              = google_pubsub_topic.events.id
  payload_format     = "JSON_API_V1"
  event_types        = ["OBJECT_FINALIZE"]
  object_name_prefix = var.event_object_prefix

  depends_on = [google_pubsub_topic_iam_member.gcs_publisher]
}
*/
