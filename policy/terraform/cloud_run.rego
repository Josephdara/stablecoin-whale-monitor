package cloud_run

private_ingress := {"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER", "INGRESS_TRAFFIC_INTERNAL_ONLY"}

workloads contains rc if {
	some rc in input.resource_changes
	rc.mode == "managed"
	rc.type in {"google_cloud_run_v2_service", "google_cloud_run_v2_job"}
	rc.change.after != null
}

# Jobs nest the container template one level deeper than services.
pod_templates contains [rc.address, i, template] if {
	some rc in workloads
	rc.type == "google_cloud_run_v2_service"
	some i, template in rc.change.after.template
}

pod_templates contains [rc.address, i, template] if {
	some rc in workloads
	rc.type == "google_cloud_run_v2_job"
	some i, execution in rc.change.after.template
	some template in execution.template
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
	some [address, i, template] in pod_templates
	not dedicated_identity(template)
	not identity_created_in_plan(address, i)
	msg := sprintf("cloud_run: %s must run as a dedicated service account", [address])
}

# Only a known image is checked; CD owns the deployed image after creation.
deny contains msg if {
	some [address, _, template] in pod_templates
	some container in template.containers
	is_string(container.image)
	not contains(container.image, "@sha256:")
	msg := sprintf("cloud_run: %s image must be digest-qualified", [address])
}

private(after) if after.ingress in private_ingress

has_template(after) if count(after.template) > 0

dedicated_identity(template) if {
	template.service_account != ""
	not endswith(template.service_account, "-compute@developer.gserviceaccount.com")
}

identity_unknown(rc, i) if rc.change.after_unknown.template[i].service_account == true

identity_unknown(rc, i) if {
	some unknown in rc.change.after_unknown.template[i].template
	unknown.service_account == true
}

identity_created_in_plan(address, i) if {
	some rc in workloads
	rc.address == address
	identity_unknown(rc, i)
	some sa in input.resource_changes
	sa.type == "google_service_account"
	"create" in sa.change.actions
}
