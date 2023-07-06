#!/usr/bin/env sh

# This script is executed after the auto backup operation is completed.

# Install git and git-lfs through apt. (minimal install)
apt update && apt install -y git git-lfs

# The directory where the Minecraft backups are stored.
# This is the directory that is specified in the `docker-compose.yml` file.
# Note that this path is pointed to the directory inside the container.
readonly BACKUP_DIR=/backups

# The directory where the latest backup file is copied to.
# This is a git repository for pushing the latest backup file to GitHub.
# So before running this script, you need to initialize the git repository.
readonly BACKUP_POOL_DIR=/pool

# Find the latest backup file in the `BACKUP_DIR` directory.
readonly latest_backup_file=$(find $BACKUP_DIR -type f -exec basename {} \; | sort | tail -n 1 | xargs -I{} find $BACKUP_DIR -name {})

# Clean up all the previous backups in the pool directory.
rm -rf "${BACKUP_POOL_DIR:?}/"*.tgz

# Copy the latest backup file to the `BACKUP_POOL_DIR` directory.
cp "$latest_backup_file" $BACKUP_POOL_DIR

# Push the latest backup file to GitHub using git-lfs.
cd $BACKUP_POOL_DIR || exit
readonly FILE_BASENAME=$(basename "$latest_backup_file")
git add "$FILE_BASENAME"
git config --global user.email "auto-actions[bot]"
git config --global user.name "auto-actions[bot]"
git commit -m "Update the latest backup file $FILE_BASENAME"
git push origin main
