output "api_service_name" {
  description = "Referenced by the regional serverless NEG in the edge phase."
  value       = google_cloud_run_v2_service.api.name
}

output "api_service_uri" {
  description = "Direct run.app URL. Unreachable publicly under internal-and-load-balancing ingress; used for smoke tests through the load balancer."
  value       = google_cloud_run_v2_service.api.uri
}

output "alerter_service_name" {
  description = "Private alerter service name."
  value       = google_cloud_run_v2_service.alerter.name
}

output "alerter_service_uri" {
  description = "Direct run.app URL. Used by the smoke test to assert unauthenticated callers are rejected."
  value       = google_cloud_run_v2_service.alerter.uri
}

output "alerter_push_endpoint" {
  description = "Push endpoint for the Pub/Sub subscription. Append the /pubsub path from src/alerter/server.mjs."
  value       = "${google_cloud_run_v2_service.alerter.uri}/pubsub"
}

output "indexer_worker_pool_name" {
  description = "Worker Pool name, for monitoring and the missing-instance alert."
  value       = google_cloud_run_v2_worker_pool.indexer.name
}