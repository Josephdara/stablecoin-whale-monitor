resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "SWM ${var.environment} alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email_to
  }
}

resource "google_monitoring_uptime_check_config" "api" {
  project      = var.project_id
  display_name = "SWM API health"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true

    accepted_response_status_codes {
      status_value = 200
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain_name
    }
  }

  content_matchers {
    content = "\"status\":\"ok\""
    matcher = "CONTAINS_STRING"
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  project      = var.project_id
  display_name = "SWM API uptime failing"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.api.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_FRACTION_TRUE"
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "api_5xx" {
  project      = var.project_id
  display_name = "SWM API 5xx responses (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "5xx request rate high"
    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"loadbalancing.googleapis.com/https/request_count\"",
        "resource.type=\"https_lb_rule\"",
        "resource.label.url_map_name=\"${var.url_map_name}\"",
        "resource.label.backend_target_name=\"${var.api_backend_service_name}\"",
        "metric.label.response_code_class=\"500\"",
      ])
      comparison = "COMPARISON_GT"


      threshold_value = var.api_5xx_rate_threshold
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "api_latency" {
  project      = var.project_id
  display_name = "SWM API high latency p99 (${var.environment})"
  combiner     = "OR"
  enabled      = false

  conditions {
    display_name = "p99 latency above threshold"
    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"loadbalancing.googleapis.com/https/total_latencies\"",
        "resource.type=\"https_lb_rule\"",
        "resource.label.url_map_name=\"${var.url_map_name}\"",
        "resource.label.backend_target_name=\"${var.api_backend_service_name}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.api_latency_threshold_ms
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "dead_letter" {
  project      = var.project_id
  display_name = "SWM dead-letter queue non-empty (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Undelivered messages in the DLQ"
    condition_threshold {
      filter          = "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" AND resource.type=\"pubsub_subscription\" AND resource.label.subscription_id=\"${var.dead_letter_subscription_name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "60s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "push_backlog" {
  project      = var.project_id
  display_name = "SWM alert push backlog ageing (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Oldest unacked message too old"
    condition_threshold {
      filter          = "metric.type=\"pubsub.googleapis.com/subscription/oldest_unacked_message_age\" AND resource.type=\"pubsub_subscription\" AND resource.label.subscription_id=\"${var.alert_subscription_name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.push_backlog_age_threshold_seconds
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}


resource "google_monitoring_alert_policy" "indexer_instance" {
  project      = var.project_id
  display_name = "SWM indexer worker pool down (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Active instance count is 0"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/container/instance_count\" AND resource.type=\"cloud_run_worker_pool\" AND resource.label.worker_pool_name=\"${var.indexer_worker_pool_name}\" AND metric.label.state=\"active\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MIN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_logging_metric" "indexer_cycles" {
  project = var.project_id
  name    = "swm-indexer-cycle-complete-${var.environment}"
  filter = join(" AND ", [
    "resource.type=\"cloud_run_worker_pool\"",
    "resource.labels.worker_pool_name=\"${var.indexer_worker_pool_name}\"",
    "jsonPayload.message=\"Indexer cycle complete\"",
  ])

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_monitoring_alert_policy" "indexer_stalled" {
  project      = var.project_id
  display_name = "SWM indexer loop stalled (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "No completed cycles"
    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"logging.googleapis.com/user/${google_logging_metric.indexer_cycles.name}\"",
        "resource.type=\"cloud_run_worker_pool\"",
      ])
      comparison      = "COMPARISON_LT"
      threshold_value = 1


      duration = var.indexer_stall_duration_seconds

      evaluation_missing_data = "EVALUATION_MISSING_DATA_ACTIVE"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}
