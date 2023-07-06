#!/usr/bin/env sh

# This script is executed after the auto backup operation is completed.

# The directory where the Minecraft backups are stored.
# This is the directory that is specified in the `docker-compose.yml` file.
readonly BACKUP_DIR=~/minecraft/mc-backups

# The directory where the latest backup file is copied to.
# This is a git repository for pushing the latest backup file to GitHub.
# So before running this script, you need to initialize the git repository.
readonly BACKUP_POOL_DIR=~/minecraft-backup-pool

# Find the latest backup file in the `~/minecraft/mc-backups` directory.
readonly latest_backup_file=$(find $BACKUP_DIR -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -f2- -d" ")

# Clean up all the previous backups in the pool directory.
rm -rf "${BACKUP_POOL_DIR:?}/"*.tgz

# Copy the latest backup file to the `~/minecraft/mc-backups/latest` directory.
cp "$latest_backup_file" $BACKUP_POOL_DIR

# Push the latest backup file to GitHub using git-lfs.
cd $BACKUP_POOL_DIR || exit
readonly FILE_BASENAME=$(basename "$latest_backup_file")
git add "$FILE_BASENAME"
git commit -m "Update the latest backup file $FILE_BASENAME"
git push origin main
