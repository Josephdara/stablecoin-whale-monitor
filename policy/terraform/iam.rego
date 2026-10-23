package iam

project_roles_denied := {
	"roles/owner",
	"roles/editor",
	"roles/viewer",
	"roles/iam.serviceAccountTokenCreator",
	"roles/iam.serviceAccountUser",
	"roles/iam.workloadIdentityUser",
}

managed contains rc if {
	some rc in input.resource_changes
	rc.mode == "managed"
	rc.change.after != null
}

deny contains msg if {
	some rc in managed
	rc.type in {"google_project_iam_member", "google_project_iam_binding"}
	rc.change.after.role in project_roles_denied
	msg := sprintf("iam: %s grants %s at project level", [rc.address, rc.change.after.role])
}

deny contains msg if {
	some rc in managed
	rc.type == "google_service_account_key"
	msg := sprintf("iam: %s creates a service-account key", [rc.address])
}

deny contains msg if {
	some rc in managed
	regex.match(`_iam_(member|binding)$`, rc.type)
	startswith(rc.change.after.role, "roles/storage.legacy")
	msg := sprintf("iam: %s grants legacy role %s", [rc.address, rc.change.after.role])
}
