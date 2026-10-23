resource "google_service_account" "planner" {
  project      = var.project_id
  account_id   = var.planner_service_account_id
  display_name = "SWM Terraform: plan"
  description  = "Runs terraform plan. Read-only: cannot apply, lock state, or read secret payloads."
}

# Permissions not covered by the predefined roles; extend when plan returns 403.
resource "google_project_iam_custom_role" "plan_reader" {
  project     = var.project_id
  role_id     = "swmTerraformPlanReader"
  title       = "SWM Terraform plan reader"
  description = "Read resources and IAM policies managed by Terraform without data or secret payload access."
  permissions = [
    "resourcemanager.projects.get",
    "resourcemanager.projects.getIamPolicy",
    "iam.roles.get",
    "iam.serviceAccounts.get",
    "iam.serviceAccounts.getIamPolicy",
    "iam.workloadIdentityPools.get",
    "iam.workloadIdentityPoolProviders.get",
    "serviceusage.services.get",
    "serviceusage.services.list",

    "storage.buckets.get",
    "storage.buckets.getIamPolicy",
    "secretmanager.secrets.get",
    "secretmanager.secrets.getIamPolicy",
    "artifactregistry.repositories.getIamPolicy",

    "certificatemanager.certs.get",
    "certificatemanager.certmaps.get",
    "certificatemanager.certmapentries.get",
    "certificatemanager.dnsauthorizations.get",

    "logging.logMetrics.get",
    "monitoring.alertPolicies.get",
    "monitoring.notificationChannels.get",
    "monitoring.uptimeCheckConfigs.get",
  ]
}

# Fixed keys: the custom role ID is unknown at plan time.
resource "google_project_iam_member" "planner" {
  for_each = {
    compute     = "roles/compute.viewer"
    run         = "roles/run.viewer"
    registry    = "roles/artifactregistry.reader"
    cloud_build = "roles/cloudbuild.builds.viewer"
    plan_reader = google_project_iam_custom_role.plan_reader.id
  }

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.planner.email}"
}

# Read-only: plans run with -lock=false.
resource "google_storage_bucket_iam_member" "planner_state_reader" {
  bucket = var.terraform_state_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.planner.email}"
}

resource "google_service_account_iam_member" "planner_impersonators" {
  for_each = toset(var.planner_impersonators)

  service_account_id = google_service_account.planner.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = each.value
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "Short-lived credentials for the Terraform plan workflow."
}

# Numeric IDs survive a repository rename or recreation under the same name.
resource "google_iam_workload_identity_pool_provider" "github_actions" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.event_name"          = "assertion.event_name"
    "attribute.workflow_ref"        = "assertion.workflow_ref"
  }

  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository_owner_id == '${var.github_repository_owner_id}'",
    "assertion.event_name == 'pull_request'",
    "assertion.workflow_ref.startsWith('${var.github_plan_workflow}@')",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "planner_github" {
  service_account_id = google_service_account.planner.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}
