package lifecycle

protected_types := {
	"google_storage_bucket",
	"google_secret_manager_secret",
	"google_artifact_registry_repository",
	"google_iam_workload_identity_pool",
	"google_iam_workload_identity_pool_provider",
	"google_project_iam_custom_role",
	"google_logging_project_bucket_config",
	"google_logging_project_sink",
	"google_project_iam_audit_config",
}

deny contains msg if {
	some rc in input.resource_changes
	rc.mode == "managed"
	rc.type in protected_types
	"delete" in rc.change.actions
	msg := sprintf("lifecycle: %s would be deleted or replaced", [rc.address])
}

warn contains msg if {
	some rc in input.resource_changes
	rc.mode == "managed"
	not rc.type in protected_types
	"delete" in rc.change.actions
	"create" in rc.change.actions
	msg := sprintf("lifecycle: %s will be replaced", [rc.address])
}
