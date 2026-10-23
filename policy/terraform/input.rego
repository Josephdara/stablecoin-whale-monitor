# Fails closed: anything that is not a usable Terraform plan is rejected.
package input_format

deny contains "input: not Terraform plan JSON (format_version missing)" if {
	not input.format_version
}

deny contains "input: resource_changes missing or not a list" if {
	not has_resource_changes
}

has_resource_changes if is_array(input.resource_changes)

deny contains "input: the plan errored" if {
	input.errored == true
}
