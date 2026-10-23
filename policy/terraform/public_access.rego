package public_access

public_members := {"allUsers", "allAuthenticatedUsers"}

# Visitors read transfers without Google sign-in; ingress keeps the API behind the load balancer.
allowed := {"module.cloud_run.google_cloud_run_v2_service_iam_member.api_public": "roles/run.invoker"}

iam_resources contains rc if {
	some rc in input.resource_changes
	rc.mode == "managed"
	regex.match(`_iam_(member|binding|policy)$`, rc.type)
	rc.change.after != null
}

grants contains [rc.address, rc.change.after.role, rc.change.after.member] if {
	some rc in iam_resources
	endswith(rc.type, "_iam_member")
}

grants contains [rc.address, rc.change.after.role, member] if {
	some rc in iam_resources
	endswith(rc.type, "_iam_binding")
	some member in rc.change.after.members
}

grants contains [rc.address, binding.role, member] if {
	some rc in iam_resources
	endswith(rc.type, "_iam_policy")
	some binding in json.unmarshal(rc.change.after.policy_data).bindings
	some member in binding.members
}

deny contains msg if {
	some [address, role, member] in grants
	member in public_members
	not exempt(address, role)
	msg := sprintf("public_access: %s grants %s to %s", [address, role, member])
}

exempt(address, role) if allowed[address] == role
