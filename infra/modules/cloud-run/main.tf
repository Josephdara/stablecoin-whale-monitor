locals {
  storage_env = {
    STORAGE_BACKEND   = "gcs"
    GCS_EVENTS_BUCKET = var.events_bucket_name
    GCS_STATE_BUCKET  = var.state_bucket_name
  }

  api_min_instances = var.services_paused ? 0 : var.api_min_instances

  indexer_interval_ms = var.indexer_interval_minutes * 60000
  indexer_schedule    = var.indexer_interval_minutes == 60 ? "0 * * * *" : "*/${var.indexer_interval_minutes} * * * *"
  # Two attempts (one retry) still finish before the next scheduled run.
  indexer_timeout_seconds = var.indexer_interval_minutes * 30 - 120
}


resource "google_cloud_run_v2_job" "indexer" {
  project             = var.project_id
  name                = var.indexer_job_name
  location            = var.region
  deletion_protection = var.deletion_protection
  labels              = var.labels

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = var.indexer_service_account_email
      timeout         = "${local.indexer_timeout_seconds}s"
      max_retries     = 1

      containers {
        image = var.application_image
        args  = ["scripts/fetch-usdc-logs.mjs", "--once"]

        dynamic "env" {
          for_each = merge(local.storage_env, {
            CHAIN_ID               = tostring(var.chain_id)
            START_BLOCK            = tostring(var.start_block)
            CONFIRMATION_BUFFER    = tostring(var.confirmation_buffer)
            BLOCK_BATCH_SIZE       = tostring(var.block_batch_size)
            RPC_LOG_CHUNK_SIZE     = tostring(var.rpc_log_chunk_size)
            POLL_INTERVAL_MS       = tostring(local.indexer_interval_ms)
            RPC_TIMEOUT_MS         = tostring(var.rpc_timeout_ms)
            RPC_MAX_RETRIES        = tostring(var.rpc_max_retries)
            RPC_RETRY_BASE_MS      = tostring(var.rpc_retry_base_ms)
            MAX_RPC_RESPONSE_BYTES = tostring(var.max_rpc_response_bytes)
            MIN_AMOUNT             = var.minimum_transfer_amount
            TRANSFER_TOPIC         = var.transfer_topic
            USDC_ADDRESS           = var.usdc_address
            USDC_DECIMALS          = tostring(var.usdc_decimals)
            USDT_ADDRESS           = var.usdt_address
            USDT_DECIMALS          = tostring(var.usdt_decimals)
            INDEXER_LOCK_FILE      = var.indexer_lock_file
          })
          content {
            name  = env.key
            value = env.value
          }
        }

        env {
          name = "GOOGLE_BLOCKCHAIN_RPC_URL"
          value_source {
            secret_key_ref {
              secret  = var.rpc_secret_id
              version = "latest"
            }
          }
        }

        resources {
          limits = { cpu = var.indexer_cpu, memory = var.indexer_memory }
        }
      }
    }
  }

  # CD owns the deployed image; Terraform owns every other attribute.
  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

resource "google_cloud_run_v2_job_iam_member" "indexer_scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.indexer.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.indexer_scheduler_service_account_email}"
}

resource "google_cloud_scheduler_job" "indexer" {
  project          = var.project_id
  region           = var.region
  name             = var.indexer_job_name
  description      = "Runs the indexer job every ${var.indexer_interval_minutes} minutes."
  schedule         = local.indexer_schedule
  time_zone        = "Etc/UTC"
  paused           = var.services_paused
  attempt_deadline = "180s"

  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.indexer.name}:run"

    oauth_token {
      service_account_email = var.indexer_scheduler_service_account_email
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.indexer_scheduler_invoker]
}





# Alerting disabled; keep the binding definition for easy restoration.
# resource "google_cloud_run_v2_service_iam_member" "alerter_pubsub_invoker" {
#   project  = var.project_id
#   location = var.region
#   name     = google_cloud_run_v2_service.alerter.name
#   role     = "roles/run.invoker"
#   member   = "serviceAccount:${var.pubsub_push_service_account_email}"
# }



# Alerting disabled; keep the service definition for easy restoration.
# resource "google_cloud_run_v2_service" "alerter" {
#   project             = var.project_id
#   name                = var.alerter_service_name
#   location            = var.region
#   ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
#   deletion_protection = var.deletion_protection
#   labels              = var.labels
#
#   scaling {
#     min_instance_count = var.alerter_min_instances
#     max_instance_count = var.alerter_max_instances
#   }
#
#   template {
#     service_account = var.alerter_service_account_email
#     timeout         = "${var.alerter_timeout_seconds}s"
#
#     scaling {
#       min_instance_count = var.alerter_min_instances
#       max_instance_count = var.alerter_max_instances
#     }
#
#     containers {
#       image = var.application_image
#       args  = ["src/alerter/server.mjs"]
#
#       ports {
#         container_port = 8080
#       }
#
#       dynamic "env" {
#         for_each = {
#           GCS_EVENTS_BUCKET = var.events_bucket_name
#           API_HOST          = "0.0.0.0"
#           API_PORT          = "8080"
#           ALERT_MIN_AMOUNT  = var.alert_minimum_amount
#         }
#         content {
#           name  = env.key
#           value = env.value
#         }
#       }
#
#       env {
#         name  = "ALERT_EMAIL_TO"
#         value = var.alert_email_to
#       }
#
#       env {
#         name  = "ALERT_EMAIL_FROM"
#         value = var.alert_email_from
#       }
#
#       env {
#         name = "GMAIL_APP_PASSWORD"
#         value_source {
#           secret_key_ref {
#             secret  = var.gmail_secret_id
#             version = "latest"
#           }
#         }
#       }
#
#       resources {
#         limits   = { cpu = var.alerter_cpu, memory = var.alerter_memory }
#         cpu_idle = true
#       }
#     }
#   }
#   # CD owns the deployed image; Terraform owns every other attribute. This is an ownership boundary, not drift suppression:
#   # it is what allows the deploy pipeline to update revisions without ever holding Terraform state access application_image is a bootstrap value only.
#
#   lifecycle {
#     ignore_changes = [
#       template[0].containers[0].image,
#       # gcloud stamps these on every deploy. Without them here, each CD run
#       # leaves a permanent diff and the empty-plan signal is lost.
#       client,
#       client_version,
#     ]
#   }
# }


resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}


resource "google_cloud_run_v2_service" "api" {
  project             = var.project_id
  name                = var.api_service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = false
  labels              = var.labels

  scaling {
    min_instance_count = local.api_min_instances
    max_instance_count = var.api_max_instances
  }

  template {
    service_account                  = var.api_service_account_email
    max_instance_request_concurrency = var.api_concurrency
    timeout                          = "${var.api_timeout_seconds}s"

    scaling {
      min_instance_count = local.api_min_instances
      max_instance_count = var.api_max_instances
    }

    containers {
      image = var.application_image
      args  = ["src/api/server.mjs"]

      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = merge(local.storage_env, {
          API_HOST                = "0.0.0.0"
          API_PORT                = "8080"
          API_REFRESH_MS          = tostring(var.api_refresh_ms)
          API_REFRESH_DEADLINE_MS = tostring(var.api_refresh_deadline_ms)
          API_MAX_STALE_MS        = tostring(var.api_max_stale_ms)
          API_MAX_PAGE_SIZE       = tostring(var.api_max_page_size)
          API_ALLOWED_ORIGIN      = join(",", var.api_allowed_origins)
          CHAIN_ID                = tostring(var.chain_id)
          RETENTION_DAYS          = tostring(var.event_retention_days)
          # Indexer settings the API reports from /api/health.
          MIN_AMOUNT          = var.minimum_transfer_amount
          CONFIRMATION_BUFFER = tostring(var.confirmation_buffer)
          POLL_INTERVAL_MS    = tostring(local.indexer_interval_ms)
        })
        content {
          name  = env.key
          value = env.value
        }
      }

      # Load the index in the background after the server starts listening.
      startup_probe {
        tcp_socket { port = 8080 }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 6
      }

      resources {
        limits   = { cpu = var.api_cpu, memory = var.api_memory }
        cpu_idle = false
      }
    }
  }
  # CD owns the deployed image; Terraform owns every other attribute. This is an ownership boundary, not drift suppression: 
  # it is what allows the deploy pipeline to update revisions without ever holding Terraform state access application_image is a bootstrap value only.
  lifecycle {
    precondition {
      condition     = var.api_max_stale_ms >= var.api_refresh_ms
      error_message = "api_max_stale_ms must be greater than or equal to api_refresh_ms."
    }

    ignore_changes = [
      template[0].containers[0].image,
      # gcloud stamps these on every deploy. Without them here, each CD run
      # leaves a permanent diff and the empty-plan signal is lost.
      client,
      client_version,
    ]
  }

}
