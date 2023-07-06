FROM itzg/minecraft-server:java20-alpine

# Copy your Minecraft armor profile to the appropriate location
COPY minecraft-armor /etc/apparmor.d/

# Ensure the profile is loaded into AppArmor
RUN apk add --no-cache apparmor \
    && service apparmor restart \
    && apparmor_parser -r /etc/apparmor.d/minecraft-armor

# Run the command to switch to the apparmor profile before starting the server
CMD echo "exec minecraft-armor" >/proc/self/attr/exec
