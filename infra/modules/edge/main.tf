locals {
  cache_fill_agent = "serviceAccount:service-${var.project_number}@https-lb.iam.gserviceaccount.com"

  # Must sit before the rate-limit rule: its conform action allows and ends evaluation.
  # nodejs has no v422 rule set.
  api_waf_rules = {
    sqli              = { priority = 900, version = "v422" }
    xss               = { priority = 910, version = "v422" }
    lfi               = { priority = 920, version = "v422" }
    rfi               = { priority = 930, version = "v422" }
    rce               = { priority = 940, version = "v422" }
    nodejs            = { priority = 950, version = "v33" }
    scannerdetection  = { priority = 960, version = "v422" }
    protocolattack    = { priority = 970, version = "v422" }
    methodenforcement = { priority = 980, version = "v422" }
  }

  security_response_headers = [
    "Strict-Transport-Security: max-age=${var.hsts_max_age_seconds}",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=()",
  ]
}

resource "google_compute_global_address" "lb" {
  project = var.project_id
  name    = "${var.name_prefix}-lb-ip"
}

resource "google_certificate_manager_dns_authorization" "main" {
  project = var.project_id
  name    = "${var.name_prefix}-dns-auth"
  domain  = var.domain_name
}

resource "google_certificate_manager_certificate" "main" {
  project = var.project_id
  name    = var.certificate_name

  managed {
    domains            = [var.domain_name]
    dns_authorizations = [google_certificate_manager_dns_authorization.main.id]
  }
}

resource "google_certificate_manager_certificate_map" "main" {
  project = var.project_id
  name    = "${var.name_prefix}-cert-map"
}

resource "google_certificate_manager_certificate_map_entry" "main" {
  project      = var.project_id
  name         = "${var.name_prefix}-cert-entry"
  map          = google_certificate_manager_certificate_map.main.name
  certificates = [google_certificate_manager_certificate.main.id]
  hostname     = var.domain_name
}


resource "google_compute_security_policy" "frontend_edge" {
  project = var.project_id
  name    = var.frontend_edge_policy_name
  type    = "CLOUD_ARMOR_EDGE"

  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Default allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}

resource "google_compute_security_policy" "api" {
  project = var.project_id
  name    = var.api_security_policy_name
  type    = "CLOUD_ARMOR"

  advanced_options_config {
    log_level = "VERBOSE"
  }

  dynamic "rule" {
    for_each = local.api_waf_rules
    content {
      action      = "deny(403)"
      priority    = rule.value.priority
      preview     = !contains(var.api_waf_enforced_rules, rule.key)
      description = "OWASP ${rule.key}-${rule.value.version}-stable, sensitivity 1"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('${rule.key}-${rule.value.version}-stable', {'sensitivity': 1})"
        }
      }
    }
  }

  rule {
    action      = "rate_based_ban"
    priority    = 1000
    description = "Per-IP rate limit on the API"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.api_rate_limit_requests
        interval_sec = var.api_rate_limit_interval_seconds
      }
      ban_duration_sec = var.api_rate_limit_interval_seconds
    }
  }

  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Default allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}


resource "google_compute_backend_bucket" "html" {
  project                 = var.project_id
  name                    = "${var.name_prefix}-html"
  bucket_name             = var.frontend_bucket_name
  enable_cdn              = true
  edge_security_policy    = google_compute_security_policy.frontend_edge.id
  custom_response_headers = local.security_response_headers

  cdn_policy {
    cache_mode       = "FORCE_CACHE_ALL"
    default_ttl      = var.html_cache_ttl_seconds
    client_ttl       = var.html_cache_ttl_seconds
    negative_caching = true
  }
}

resource "google_compute_backend_bucket" "assets" {
  project                 = var.project_id
  name                    = "${var.name_prefix}-assets"
  bucket_name             = var.frontend_bucket_name
  enable_cdn              = true
  edge_security_policy    = google_compute_security_policy.frontend_edge.id
  custom_response_headers = local.security_response_headers

  cdn_policy {
    cache_mode       = "FORCE_CACHE_ALL"
    default_ttl      = var.asset_cache_ttl_seconds
    client_ttl       = var.asset_cache_ttl_seconds
    negative_caching = true
  }
}


resource "google_storage_bucket_iam_member" "cache_fill" {
  bucket = var.frontend_bucket_name
  role   = "roles/storage.objectViewer"
  member = local.cache_fill_agent

  depends_on = [google_compute_backend_bucket.html]
}


resource "google_compute_region_network_endpoint_group" "api" {
  project               = var.project_id
  name                  = "${var.name_prefix}-api-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.api_service_name
  }
}

resource "google_compute_backend_service" "api" {
  project                 = var.project_id
  name                    = "${var.name_prefix}-api-backend"
  protocol                = "HTTPS"
  load_balancing_scheme   = "EXTERNAL_MANAGED"
  security_policy         = google_compute_security_policy.api.id
  custom_response_headers = local.security_response_headers

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }

  log_config {
    enable      = true
    sample_rate = var.api_log_sample_rate
  }
}


resource "google_compute_url_map" "main" {
  project         = var.project_id
  name            = "${var.name_prefix}-url-map"
  default_service = google_compute_backend_bucket.html.id

  host_rule {
    hosts        = [var.domain_name]
    path_matcher = "main"
  }

  path_matcher {
    name            = "main"
    default_service = google_compute_backend_bucket.html.id

    path_rule {
      paths   = ["/_next/static/*"]
      service = google_compute_backend_bucket.assets.id
    }

    dynamic "path_rule" {
      for_each = var.services_paused ? [] : [1]
      content {
        paths   = ["/api", "/api/*"]
        service = google_compute_backend_service.api.id
      }
    }
  }
}

resource "google_compute_target_https_proxy" "main" {
  project         = var.project_id
  name            = "${var.name_prefix}-https-proxy"
  url_map         = google_compute_url_map.main.id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.main.id}"
  ssl_policy      = google_compute_ssl_policy.main.id
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${var.name_prefix}-https-rule"
  target                = google_compute_target_https_proxy.main.id
  ip_address            = google_compute_global_address.lb.id
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}


resource "google_compute_url_map" "redirect" {
  project = var.project_id
  name    = "${var.name_prefix}-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  project = var.project_id
  name    = "${var.name_prefix}-http-proxy"
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  project               = var.project_id
  name                  = "${var.name_prefix}-http-rule"
  target                = google_compute_target_http_proxy.redirect.id
  ip_address            = google_compute_global_address.lb.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_ssl_policy" "main" {
  project         = var.project_id
  name            = "${var.name_prefix}-ssl-policy"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}