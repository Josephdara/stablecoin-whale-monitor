
output "load_balancer_ip" {
  description = "Reserved global IPv4. Target of the A record."
  value       = google_compute_global_address.lb.address
}

output "dns_authorization_record" {
  description = "CNAME that must exist before the certificate can provision, and must remain for renewals."
  value = {
    name = google_certificate_manager_dns_authorization.main.dns_resource_record[0].name
    type = google_certificate_manager_dns_authorization.main.dns_resource_record[0].type
    data = google_certificate_manager_dns_authorization.main.dns_resource_record[0].data
  }
}

output "certificate_name" {
  description = "Watch this for the ACTIVE transition before smoke testing HTTPS."
  value       = google_certificate_manager_certificate.main.name
}

output "url_map_name" {
  description = "Routing map, for monitoring and debugging."
  value       = google_compute_url_map.main.name
}

output "api_backend_service_name" {
  description = "Target of the API 5xx and latency alerts in the monitoring phase."
  value       = google_compute_backend_service.api.name
}

output "html_backend_bucket_name" {
  description = "Short-TTL frontend backend bucket."
  value       = google_compute_backend_bucket.html.name
}

output "assets_backend_bucket_name" {
  description = "One-year TTL backend bucket for /_next/static/*."
  value       = google_compute_backend_bucket.assets.name
}