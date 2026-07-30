terraform {
  backend "gcs" {
    bucket = "swm-gcp-state-v2"
    prefix = "terraform/state"
  }
}