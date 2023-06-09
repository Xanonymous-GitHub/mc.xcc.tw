#!/bin/bash

function copy_backup() {
    local REMOTE_SERVER=""
    local PORT=""
    local USERNAME=""
    local REMOTE_BACKUP_FOLDER=""
    local FILE_PATH=""
    local DEST_DIR=$(dirname $0)

    FILE_PATH=$(ssh -p $PORT $USERNAME@$REMOTE_SERVER "ls -t $REMOTE_BACKUP_FOLDER | head -n1")

    rsync -avz -e "ssh -p $PORT" "$USERNAME@$REMOTE_SERVER:$REMOTE_BACKUP_FOLDER/$FILE_PATH" "$DEST_DIR"
}

set -e

copy_backup

if [ $? -ne 0 ]; then
    echo "Error: Failed to copy the file."
else
    echo "File copied done."
fi
