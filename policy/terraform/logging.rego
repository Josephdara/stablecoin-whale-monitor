package logging

# An unknown value is absent from "after", so it fails too.
deny contains msg if {
	some rc in input.resource_changes
	rc.mode == "managed"
	rc.type == "google_compute_backend_service"
	rc.change.after != null
	not request_logging(rc.change.after)
	msg := sprintf("logging: %s must log requests with a sample rate above 0", [rc.address])
}

request_logging(after) if {
	some cfg in after.log_config
	cfg.enable == true
	cfg.sample_rate > 0
}
