package location

# Deployment-specific.
bucket_locations := {"US-EAST4"}

regional_locations := {"us-east4"}

regional_types := {
	"google_cloud_run_v2_service",
	"google_cloud_run_v2_worker_pool",
	"google_artifact_registry_repository",
	"google_logging_project_bucket_config",
}

managed contains rc if {
	some rc in input.resource_changes
	rc.mode == "managed"
	rc.change.after != null
}

deny contains msg if {
	some rc in managed
	rc.type == "google_storage_bucket"
	not approved_bucket_location(rc.change.after)
	msg := sprintf("location: %s must be in %v", [rc.address, bucket_locations])
}

deny contains msg if {
	some rc in managed
	rc.type in regional_types
	not approved_region(rc.change.after)
	msg := sprintf("location: %s must be in %v", [rc.address, regional_locations])
}

approved_bucket_location(after) if upper(after.location) in bucket_locations

approved_region(after) if after.location in regional_locations
