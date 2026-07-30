variable "project_id" {
  description = "Project ID."
  type        = string
}


variable "rpc_secret_id" {
    type = string
}

variable "gmail_secret_id" {
    type = string
}

variable "labels" {
  description = "Labels for the secrets."
  type        = map(string)
  default     = {}

}