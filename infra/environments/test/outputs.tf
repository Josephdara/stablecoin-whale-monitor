output "project_id" {
  description = "Target project for this environment."
  value       = data.google_project.current.project_id
}

output "project_number" {
  description = "Derives the load balancer cache-fill service agent: service-<number>@https-lb.iam.gserviceaccount.com."
  value       = data.google_project.current.number
}

output "region" {
  description = "Primary runtime region for Cloud Run and the serverless NEG."
  value       = var.region
}

output "artifact_repository_url" {
  description = "Docker push target for the application image; supplies _IMAGE_REPOSITORY to Cloud Build."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "frontend_bucket_name" {
  description = "Upload target for frontend/out."
  value       = module.storage.frontend_bucket_name
}


output "frontend_bucket_self_link" {
  value = module.storage.frontend_bucket_self_link
}

output "events_bucket_name" {
  description = "GCS_EVENTS_BUCKET."
  value       = module.storage.events_bucket_name
}


output "events_bucket_self_link" {
  value = module.storage.events_bucket_self_link
}


output "state_bucket_name" {
  description = "GCS_STATE_BUCKET."
  value       = module.storage.state_bucket_name
}


output "state_bucket_self_link" {
  value = module.storage.state_bucket_self_link
}


output "api_service_account_email" {
  description = "Runtime identity for the Cloud Run API service."
  value       = module.iam.api_service_account_email
}

output "indexer_service_account_email" {
  description = "Runtime identity for the indexer Worker Pool."
  value       = module.iam.indexer_service_account_email
}

# Alerting disabled; keep the outputs for easy restoration.
# output "alerter_service_account_email" {
#   description = "Runtime identity for the private alerter."
#   value       = module.iam.alerter_service_account_email
# }
#
# output "pubsub_push_service_account_email" {
#   description = "Pub/Sub push identity awaiting its alerter invoker binding."
#   value       = module.iam.pubsub_push_service_account_email
# }



output "rpc_secret_id" {
  description = "RPC secret container. A version must be added manually before Cloud Run deploys."
  value       = module.secrets.rpc_secret_id
}

# output "gmail_secret_id" {
#   description = "Gmail secret container. A version must be added manually before the alerter deploys."
#   value       = module.secrets.gmail_secret_id
# }
#
# output "event_topic_name" {
#   description = "Pub/Sub topic receiving Cloud Storage event notifications."
#   value       = module.pubsub.event_topic_name
# }
#
# output "dead_letter_topic_name" {
#   description = "Dead-letter topic."
#   value       = module.pubsub.dead_letter_topic_name
# }
#
# output "alert_subscription_name" {
#   description = "Authenticated push subscription delivering to the alerter."
#   value       = module.pubsub.alert_subscription_name
# }
#
# output "dead_letter_subscription_name" {
#   description = "Pull subscription for dead-letter inspection."
#   value       = module.pubsub.dead_letter_subscription_name
# }

output "load_balancer_ip" {
  description = "A record target for swm.josephdara.com."
  value       = module.edge.load_balancer_ip
}

output "dns_authorization_record" {
  description = "CNAME required for certificate issuance and renewal."
  value       = module.edge.dns_authorization_record
}

output "pipeline_service_account_emails" {
  description = "Verify, CI, and CD identities. Each must be named on its own trigger."
  value = {
    verify = module.cloud_build.verify_service_account_email
    ci     = module.cloud_build.ci_service_account_email
    cd     = module.cloud_build.cd_service_account_email
  }
}

output "build_artifacts_bucket" {
  description = "Release archive location, substituted into the CI and CD pipelines."
  value       = module.cloud_build.artifacts_bucket_name
}

output "planner_service_account_email" {
  description = "Read-only identity impersonated for terraform plan."
  value       = module.terraform_planner.planner_service_account_email
}

output "github_workload_identity_provider" {
  description = "Provider resource name for the plan workflow's authentication step."
  value       = module.terraform_planner.github_workload_identity_provider
}
