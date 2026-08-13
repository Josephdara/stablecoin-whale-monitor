variable "project_id" {
  description = "Project ID."
  type        = string
}


variable "rpc_secret_id" {
  type = string
}

# Alerting disabled; keep the variable for easy restoration.
# variable "gmail_secret_id" {
#   type = string
# }

variable "labels" {
  description = "Labels for the secrets."
  type        = map(string)
  default     = {}

}
