package storage

buckets contains rc if {
	some rc in input.resource_changes
	rc.mode == "managed"
	rc.type == "google_storage_bucket"
	rc.change.after != null
}

# An unknown value is absent from "after", so it fails too.
deny contains msg if {
	some rc in buckets
	not uniform_access(rc.change.after)
	msg := sprintf("storage: %s must enable uniform bucket-level access", [rc.address])
}

deny contains msg if {
	some rc in buckets
	not public_access_prevented(rc.change.after)
	msg := sprintf("storage: %s must enforce public access prevention", [rc.address])
}

uniform_access(after) if after.uniform_bucket_level_access == true

public_access_prevented(after) if after.public_access_prevention == "enforced"
