variable "project_id" {
  description = "Project that owns the topics, subscriptions, and notification."
  type        = string
}

variable "project_number" {
  description = "Derives the Pub/Sub service agent: service-<number>@gcp-sa-pubsub.iam.gserviceaccount.com."
  type        = string
}

variable "labels" {
  description = "Labels applied to topics and subscriptions."
  type        = map(string)
  default     = {}
}

variable "events_bucket_name" {
  description = "Bucket emitting OBJECT_FINALIZE. Pass the storage module output."
  type        = string
}

variable "event_object_prefix" {
  description = "Only objects under this prefix produce notifications."
  type        = string
}

variable "alerter_push_endpoint" {
  description = "Full push URL including the /pubsub path. Pass the Cloud Run module output."
  type        = string
}

variable "pubsub_push_service_account_email" {
  description = "Identity Pub/Sub mints OIDC tokens as. Must already hold run.invoker on the alerter."
  type        = string
}

variable "event_topic_name" {
  description = "Topic receiving Cloud Storage event notifications."
  type        = string
}

variable "dead_letter_topic_name" {
  description = "Topic receiving messages that exhaust delivery attempts."
  type        = string
}

variable "alert_subscription_name" {
  description = "Authenticated push subscription delivering to the alerter."
  type        = string
}

variable "dead_letter_subscription_name" {
  description = "Pull subscription used to inspect dead-lettered messages."
  type        = string
}

variable "pubsub_ack_deadline_seconds" {
  description = "Acknowledgement deadline. Must exceed the alerter's worst-case download and send time."
  type        = number
}

variable "pubsub_max_delivery_attempts" {
  description = "Attempts before a message is forwarded to the dead-letter topic."
  type        = number
}

variable "pubsub_minimum_backoff_seconds" {
  description = "Minimum retry backoff."
  type        = number
}

variable "pubsub_maximum_backoff_seconds" {
  description = "Maximum retry backoff."
  type        = number
}