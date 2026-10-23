package policy_test

digest := "us-east4-docker.pkg.dev/p/r/app@sha256:0000000000000000000000000000000000000000000000000000000000000000"

rc(address, type, actions, after) := {
	"address": address,
	"mode": "managed",
	"type": type,
	"change": {"actions": actions, "after": after, "after_unknown": {}},
}

bucket := rc("module.storage.google_storage_bucket.events", "google_storage_bucket", ["update"], {
	"location": "US-EAST4",
	"uniform_bucket_level_access": true,
	"public_access_prevention": "enforced",
})

api := rc("module.cloud_run.google_cloud_run_v2_service.api", "google_cloud_run_v2_service", ["update"], {
	"location": "us-east4",
	"ingress": "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
	"template": [{"service_account": "api@p.iam.gserviceaccount.com", "containers": [{"image": digest}]}],
})

api_public := rc(
	"module.cloud_run.google_cloud_run_v2_service_iam_member.api_public",
	"google_cloud_run_v2_service_iam_member", ["no-op"],
	{"role": "roles/run.invoker", "member": "allUsers"},
)

viewer := rc("module.p.google_project_iam_member.viewer", "google_project_iam_member", ["create"], {"role": "roles/run.viewer", "member": "serviceAccount:a@b"})

plan(changes) := {"format_version": "1.2", "resource_changes": changes}

compliant := plan([bucket, api, api_public, viewer])

denials contains msg if {
	some pkg in ["input_format", "storage", "public_access", "iam", "cloud_run", "location", "lifecycle"]
	some msg in data[pkg].deny
}

test_compliant_plan_passes if {
	count(denials) == 0 with input as compliant
	count(data.lifecycle.warn) == 0 with input as compliant
}

test_non_plan_rejected if {
	count(data.input_format.deny) > 0 with input as {"not": "a plan"}
}

test_public_access_prevention_required if {
	changed := json.patch(bucket, [{"op": "replace", "path": "/change/after/public_access_prevention", "value": "inherited"}])
	count(denials) == 1 with input as plan([changed])
}

test_public_bucket_grant_rejected if {
	grant := rc("module.storage.google_storage_bucket_iam_member.public", "google_storage_bucket_iam_member", ["create"], {"role": "roles/storage.objectViewer", "member": "allUsers"})
	count(denials) == 1 with input as plan([grant])
}

test_project_editor_rejected if {
	editor := json.patch(viewer, [{"op": "replace", "path": "/change/after/role", "value": "roles/editor"}])
	count(denials) == 1 with input as plan([editor])
}

test_public_ingress_rejected if {
	changed := json.patch(api, [{"op": "replace", "path": "/change/after/ingress", "value": "INGRESS_TRAFFIC_ALL"}])
	count(denials) == 1 with input as plan([changed])
}

test_bucket_outside_region_rejected if {
	changed := json.patch(bucket, [{"op": "replace", "path": "/change/after/location", "value": "EU"}])
	count(denials) == 1 with input as plan([changed])
}

test_bucket_replacement_rejected if {
	changed := json.patch(bucket, [{"op": "replace", "path": "/change/actions", "value": ["delete", "create"]}])
	count(denials) == 1 with input as plan([changed])
}
