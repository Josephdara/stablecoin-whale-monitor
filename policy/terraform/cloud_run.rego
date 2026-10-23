package cloud_run

private_ingress := {"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER", "INGRESS_TRAFFIC_INTERNAL_ONLY"}

workloads contains rc if {
	some rc in input.resource_changes
	rc.mode == "managed"
	rc.type in {"google_cloud_run_v2_service", "google_cloud_run_v2_worker_pool"}
	rc.change.after != null
}

deny contains msg if {
	some rc in workloads
	rc.type == "google_cloud_run_v2_service"
	not private(rc.change.after)
	msg := sprintf("cloud_run: %s must not accept traffic that bypasses the load balancer", [rc.address])
}

deny contains msg if {
	some rc in workloads
	not has_template(rc.change.after)
	msg := sprintf("cloud_run: %s has no known template", [rc.address])
}

deny contains msg if {
	some rc in workloads
	some i, template in rc.change.after.template
	not dedicated_identity(template)
	not identity_created_in_plan(rc, i)
	msg := sprintf("cloud_run: %s must run as a dedicated service account", [rc.address])
}

# Only a known image is checked; CD owns the deployed image after creation.
deny contains msg if {
	some rc in workloads
	some template in rc.change.after.template
	some container in template.containers
	is_string(container.image)
	not contains(container.image, "@sha256:")
	msg := sprintf("cloud_run: %s image must be digest-qualified", [rc.address])
}

private(after) if after.ingress in private_ingress

has_template(after) if count(after.template) > 0

dedicated_identity(template) if {
	template.service_account != ""
	not endswith(template.service_account, "-compute@developer.gserviceaccount.com")
}

identity_created_in_plan(rc, i) if {
	rc.change.after_unknown.template[i].service_account == true
	some sa in input.resource_changes
	sa.type == "google_service_account"
	"create" in sa.change.actions
}
