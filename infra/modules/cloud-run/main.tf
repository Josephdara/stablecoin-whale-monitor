locals {
  storage_env = {
    STORAGE_BACKEND   = "gcs"
    GCS_EVENTS_BUCKET = var.events_bucket_name
    GCS_STATE_BUCKET  = var.state_bucket_name
  }
}


resource "google_cloud_run_v2_worker_pool" "indexer" {
  provider            = google-beta
  project             = var.project_id
  name                = var.indexer_worker_pool_name
  location            = var.region
  deletion_protection = var.deletion_protection
  labels              = var.labels

  template {
    service_account = var.indexer_service_account_email

    containers {
      image = var.application_image
      args  = ["scripts/fetch-usdc-logs.mjs"]

      dynamic "env" {
        for_each = merge(local.storage_env, {
          CHAIN_ID               = tostring(var.chain_id)
          START_BLOCK            = tostring(var.start_block)
          CONFIRMATION_BUFFER    = tostring(var.confirmation_buffer)
          BLOCK_BATCH_SIZE       = tostring(var.block_batch_size)
          RPC_LOG_CHUNK_SIZE     = tostring(var.rpc_log_chunk_size)
          POLL_INTERVAL_MS       = tostring(var.poll_interval_ms)
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

  instance_splits {
    type    = "INSTANCE_SPLIT_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  scaling {
    manual_instance_count = 1
  }
  # CD owns the deployed image; Terraform owns every other attribute. This is an ownership boundary, not drift suppression: 
  # it is what allows the deploy pipeline to update revisions without ever holding Terraform state access application_image is a bootstrap value only.

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

}





resource "google_cloud_run_v2_service_iam_member" "alerter_pubsub_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.alerter.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.pubsub_push_service_account_email}"
}



resource "google_cloud_run_v2_service" "alerter" {
  project             = var.project_id
  name                = var.alerter_service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = var.deletion_protection
  labels              = var.labels

  scaling {
    min_instance_count = var.alerter_min_instances
    max_instance_count = var.alerter_max_instances
  }

  template {
    service_account = var.alerter_service_account_email
    timeout         = "${var.alerter_timeout_seconds}s"

    scaling {
      min_instance_count = var.alerter_min_instances
      max_instance_count = var.alerter_max_instances
    }

    containers {
      image = var.application_image
      args  = ["src/alerter/server.mjs"]

      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = {
          GCS_EVENTS_BUCKET = var.events_bucket_name
          API_HOST          = "0.0.0.0"
          API_PORT          = "8080"
          ALERT_MIN_AMOUNT  = var.alert_minimum_amount
        }
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name  = "ALERT_EMAIL_TO"
        value = var.alert_email_to
      }

      env {
        name  = "ALERT_EMAIL_FROM"
        value = var.alert_email_from
      }

      env {
        name = "GMAIL_APP_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = var.gmail_secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits   = { cpu = var.alerter_cpu, memory = var.alerter_memory }
        cpu_idle = true
      }
    }
  }
  # CD owns the deployed image; Terraform owns every other attribute. This is an ownership boundary, not drift suppression: 
  # it is what allows the deploy pipeline to update revisions without ever holding Terraform state access application_image is a bootstrap value only.

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

}


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
    min_instance_count = var.api_min_instances
    max_instance_count = var.api_max_instances
  }

  template {
    service_account                  = var.api_service_account_email
    max_instance_request_concurrency = var.api_concurrency
    timeout                          = "${var.api_timeout_seconds}s"

    scaling {
      min_instance_count = var.api_min_instances
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
          API_MAX_PAGE_SIZE       = tostring(var.api_max_page_size)
          API_ALLOWED_ORIGIN      = var.api_allowed_origin
          CHAIN_ID                = tostring(var.chain_id)
          RETENTION_DAYS          = tostring(var.event_retention_days)
        })
        content {
          name  = env.key
          value = env.value
        }
      }

      # Process-level check only. Never gate startup on checkpoint freshness:
      # a stale chain would make the revision fail to deploy.
      startup_probe {
        tcp_socket { port = 8080 }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 6
      }

      resources {
        limits = { cpu = var.api_cpu, memory = var.api_memory }
      }
    }
  }
  # CD owns the deployed image; Terraform owns every other attribute. This is an ownership boundary, not drift suppression: 
  # it is what allows the deploy pipeline to update revisions without ever holding Terraform state access application_image is a bootstrap value only.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

}
