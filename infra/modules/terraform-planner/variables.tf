variable "project_id" {
  description = "Project ID."
  type        = string
}

variable "planner_service_account_id" {
  description = "Account ID for the read-only Terraform planning service account."
  type        = string
}

variable "terraform_state_bucket_name" {
  description = "Bucket holding Terraform state. Created by bootstrap-state.sh, outside Terraform."
  type        = string
}

variable "planner_impersonators" {
  description = "Principals allowed to impersonate the planner, in IAM member form (for example user:name@example.com)."
  type        = list(string)
  default     = []
}
