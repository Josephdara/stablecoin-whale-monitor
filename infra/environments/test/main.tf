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


  event_retention_days = var.event_retention_days
  event_object_prefix  = var.event_object_prefix

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


  api_service_account_id         = var.api_service_account_id
  indexer_service_account_id     = var.indexer_service_account_id
  alerter_service_account_id     = var.alerter_service_account_id
  pubsub_push_service_account_id = var.pubsub_push_service_account_id


  events_bucket_name = module.storage.events_bucket_name
  state_bucket_name  = module.storage.state_bucket_name
  rpc_secret_id      = module.secrets.rpc_secret_id
  gmail_secret_id    = module.secrets.gmail_secret_id


  depends_on = [module.secrets]
}

module "cloud_run" {
  source = "../../modules/cloud-run"

  project_id        = var.project_id
  region            = var.region
  application_image = var.application_image
  labels            = var.common_labels
  chain_id          = var.chain_id

  events_bucket_name = module.storage.events_bucket_name
  state_bucket_name  = module.storage.state_bucket_name
  rpc_secret_id      = module.secrets.rpc_secret_id
  gmail_secret_id    = module.secrets.gmail_secret_id

  api_service_name          = var.api_service_name
  api_service_account_email = module.iam.api_service_account_email
  api_min_instances         = var.api_min_instances
  api_max_instances         = var.api_max_instances
  api_concurrency           = var.api_concurrency
  api_timeout_seconds       = var.api_timeout_seconds
  api_refresh_ms            = var.api_refresh_ms
  api_refresh_deadline_ms   = var.api_refresh_deadline_ms
  api_max_stale_ms          = var.api_max_stale_ms
  api_max_page_size         = var.api_max_page_size
  api_allowed_origin        = var.api_allowed_origin
  event_retention_days      = var.event_retention_days
  api_cpu                   = var.api_cpu
  api_memory                = var.api_memory

  alerter_service_name              = var.alerter_service_name
  alerter_service_account_email     = module.iam.alerter_service_account_email
  pubsub_push_service_account_email = module.iam.pubsub_push_service_account_email
  alerter_min_instances             = var.alerter_min_instances
  alerter_max_instances             = var.alerter_max_instances
  alerter_timeout_seconds           = var.alerter_timeout_seconds
  alert_minimum_amount              = var.alert_minimum_amount
  alert_email_to                    = var.alert_email_to
  alert_email_from                  = var.alert_email_from
  alerter_cpu                       = var.alerter_cpu
  alerter_memory                    = var.alerter_memory

  indexer_worker_pool_name      = var.indexer_worker_pool_name
  indexer_service_account_email = module.iam.indexer_service_account_email
  start_block                   = var.start_block
  confirmation_buffer           = var.confirmation_buffer
  block_batch_size              = var.block_batch_size
  rpc_log_chunk_size            = var.rpc_log_chunk_size
  poll_interval_ms              = var.poll_interval_ms
  rpc_timeout_ms                = var.rpc_timeout_ms
  rpc_max_retries               = var.rpc_max_retries
  rpc_retry_base_ms             = var.rpc_retry_base_ms
  max_rpc_response_bytes        = var.max_rpc_response_bytes
  minimum_transfer_amount       = var.minimum_transfer_amount
  transfer_topic                = var.transfer_topic
  usdc_address                  = var.usdc_address
  usdc_decimals                 = var.usdc_decimals
  usdt_address                  = var.usdt_address
  usdt_decimals                 = var.usdt_decimals
  indexer_lock_file             = var.indexer_lock_file
  indexer_cpu                   = var.indexer_cpu
  indexer_memory                = var.indexer_memory

  depends_on = [module.iam]
}

module "pubsub" {
  source = "../../modules/pubsub"

  project_id     = var.project_id
  project_number = data.google_project.current.number
  labels         = var.common_labels

  events_bucket_name  = module.storage.events_bucket_name
  event_object_prefix = var.event_object_prefix

  alerter_push_endpoint             = module.cloud_run.alerter_push_endpoint
  pubsub_push_service_account_email = module.iam.pubsub_push_service_account_email

  event_topic_name              = var.event_topic_name
  dead_letter_topic_name        = var.dead_letter_topic_name
  alert_subscription_name       = var.alert_subscription_name
  dead_letter_subscription_name = var.dead_letter_subscription_name

  pubsub_ack_deadline_seconds    = var.pubsub_ack_deadline_seconds
  pubsub_max_delivery_attempts   = var.pubsub_max_delivery_attempts
  pubsub_minimum_backoff_seconds = var.pubsub_minimum_backoff_seconds
  pubsub_maximum_backoff_seconds = var.pubsub_maximum_backoff_seconds
}

module "edge" {
  source = "../../modules/edge"

  project_id     = var.project_id
  project_number = data.google_project.current.number
  region         = var.region
  name_prefix    = var.name_prefix

  domain_name      = var.domain_name
  certificate_name = var.certificate_name

  frontend_bucket_name = module.storage.frontend_bucket_name
  api_service_name     = module.cloud_run.api_service_name

  html_cache_ttl_seconds  = var.html_cache_ttl_seconds
  asset_cache_ttl_seconds = var.asset_cache_ttl_seconds

  frontend_edge_policy_name       = var.frontend_edge_policy_name
  api_security_policy_name        = var.api_security_policy_name
  api_rate_limit_requests         = var.api_rate_limit_requests
  api_rate_limit_interval_seconds = var.api_rate_limit_interval_seconds
}

module "monitoring" {
  source = "../../modules/monitoring"

  project_id     = var.project_id
  environment    = var.environment
  domain_name    = var.domain_name
  alert_email_to = var.alert_email_from

  url_map_name             = module.edge.url_map_name
  api_backend_service_name = module.edge.api_backend_service_name
  api_service_name         = module.cloud_run.api_service_name

  dead_letter_subscription_name = module.pubsub.dead_letter_subscription_name
  alert_subscription_name       = module.pubsub.alert_subscription_name

  indexer_worker_pool_name = module.cloud_run.indexer_worker_pool_name
}

module "cloud_build" {
  source = "../../modules/cloud-build"

  project_id = var.project_id
  region     = var.region
  location   = var.bucket_location
  labels     = var.common_labels

  verify_service_account_id = var.verify_service_account_id
  ci_service_account_id     = var.ci_service_account_id
  cd_service_account_id     = var.cd_service_account_id

  artifacts_bucket_name  = "swm-gcp-test-v2-build-artifacts"
  artifact_repository_id = google_artifact_registry_repository.app.repository_id
  frontend_bucket_name   = module.storage.frontend_bucket_name

  api_service_name         = module.cloud_run.api_service_name
  alerter_service_name     = module.cloud_run.alerter_service_name
  indexer_worker_pool_name = module.cloud_run.indexer_worker_pool_name

  api_service_account_name     = module.iam.api_service_account_name
  alerter_service_account_name = module.iam.alerter_service_account_name
  indexer_service_account_name = module.iam.indexer_service_account_name
  name_prefix                  = var.name_prefix
  public_url                   = "https://${var.domain_name}"

  alerter_url        = module.cloud_run.alerter_service_uri
  events_bucket_name = module.storage.events_bucket_name
  state_bucket_name  = module.storage.state_bucket_name

  force_destroy = var.storage_force_destroy
}
