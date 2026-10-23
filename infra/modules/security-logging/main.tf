locals {
  admin_activity = "logName:\"cloudaudit.googleapis.com%2Factivity\""

  security_changes = {
    iam_policy = {
      title  = "IAM policy or audit config changed"
      filter = "protoPayload.methodName=~\"(?i)setiampolicy$\" OR protoPayload.methodName=\"storage.setIamPermissions\""
    }
    custom_role = {
      title  = "Custom IAM role changed"
      filter = "protoPayload.serviceName=\"iam.googleapis.com\" AND protoPayload.methodName=~\"[.](Create|Update|Delete|Undelete)Role$\""
    }
    service_account_key = {
      title  = "Service-account key created"
      filter = "protoPayload.serviceName=\"iam.googleapis.com\" AND protoPayload.methodName=~\"[.](Create|Upload)ServiceAccountKey$\""
    }
    workload_identity = {
      title  = "Workload Identity Federation changed"
      filter = "protoPayload.serviceName=\"iam.googleapis.com\" AND protoPayload.methodName:\"WorkloadIdentityPool\""
    }
    logging_config = {
      title  = "Log routing or retention changed"
      filter = "protoPayload.serviceName=\"logging.googleapis.com\" AND protoPayload.methodName=~\"ConfigServiceV2[.](Create|Update|Delete|Undelete)\""
    }
    cloud_armor = {
      title  = "Cloud Armor policy or attachment changed"
      filter = "protoPayload.serviceName=\"compute.googleapis.com\" AND protoPayload.methodName=~\"(securityPolicies[.](insert|patch|delete|addRule|patchRule|removeRule)|backendServices[.]setSecurityPolicy|backendBuckets[.]setEdgeSecurityPolicy)$\""
    }
  }

  armor_denied = join(" AND ", [
    "resource.type=\"http_load_balancer\"",
    "resource.labels.backend_service_name=\"${var.api_backend_service_name}\"",
    "jsonPayload.enforcedSecurityPolicy.outcome=\"DENY\"",
  ])
}

resource "google_project_iam_audit_config" "secret_manager" {
  project = var.project_id
  service = "secretmanager.googleapis.com"

  audit_log_config {
    log_type = "DATA_READ"
  }
}

# Workload reads are constant and expected; logging them would dominate volume and cost.
resource "google_project_iam_audit_config" "storage" {
  project = var.project_id
  service = "storage.googleapis.com"

  audit_log_config {
    log_type         = "DATA_READ"
    exempted_members = [for email in var.workload_service_account_emails : "serviceAccount:${email}"]
  }
}

resource "google_logging_project_bucket_config" "security" {
  project        = var.project_id
  location       = var.location
  bucket_id      = "${var.name_prefix}-security"
  retention_days = var.retention_days
  description    = "Audit logs and Cloud Armor denials."
}

resource "google_logging_project_sink" "security" {
  project     = var.project_id
  name        = "${var.name_prefix}-security"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.security.id}"
  filter      = "logName:\"cloudaudit.googleapis.com\" OR (${local.armor_denied})"
}

# Data Access entries are stored once, in the security bucket.
resource "google_logging_project_exclusion" "data_access_default" {
  project     = var.project_id
  name        = "${var.name_prefix}-data-access-default"
  description = "Data Access audit logs are routed to the security bucket."
  filter      = "logName:\"cloudaudit.googleapis.com%2Fdata_access\""
}

resource "google_logging_log_view" "security" {
  name        = "security-readers"
  bucket      = google_logging_project_bucket_config.security.id
  description = "Read access to the security log bucket."
}

resource "google_logging_log_view_iam_member" "security_readers" {
  for_each = toset(var.security_log_readers)

  parent   = google_logging_log_view.security.parent
  location = google_logging_log_view.security.location
  bucket   = google_logging_log_view.security.bucket
  name     = google_logging_log_view.security.name
  role     = "roles/logging.viewAccessor"
  member   = each.value
}

resource "google_monitoring_alert_policy" "security_change" {
  for_each = local.security_changes

  project      = var.project_id
  display_name = "SWM security change: ${each.value.title} (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = each.value.title
    condition_matched_log {
      filter = "${local.admin_activity} AND (${each.value.filter})"
      label_extractors = {
        principal = "EXTRACT(protoPayload.authenticationInfo.principalEmail)"
        method    = "EXTRACT(protoPayload.methodName)"
      }
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Match the principal and time to a reviewed Terraform apply or documented manual change. If none matches, inspect the entry in the security log bucket and revert the change."
  }

  notification_channels = [var.notification_channel_id]
}

resource "google_logging_metric" "armor_denied" {
  project = var.project_id
  name    = "swm-api-armor-denied-${var.environment}"
  filter  = local.armor_denied

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    labels {
      key        = "priority"
      value_type = "STRING"
    }
  }

  label_extractors = {
    priority = "EXTRACT(jsonPayload.enforcedSecurityPolicy.priority)"
  }
}

resource "google_monitoring_alert_policy" "armor_denied" {
  project      = var.project_id
  display_name = "SWM API Cloud Armor denials high (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Denied requests above threshold"
    condition_threshold {
      filter = join(" AND ", [
        "metric.type=\"logging.googleapis.com/user/${google_logging_metric.armor_denied.name}\"",
        "resource.type=\"l7_lb_rule\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.armor_denied_threshold
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [var.notification_channel_id]
}
