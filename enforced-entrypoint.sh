#!/usr/bin/env sh
set -e

# Run the pre-command
echo "exec minecraft-armor" >/proc/self/attr/exec

# Execute the command passed to the entrypoint
exec "/start"
