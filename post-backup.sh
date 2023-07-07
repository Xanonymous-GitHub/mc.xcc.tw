#!/usr/bin/env sh

# This script is executed after the auto backup operation is completed.

# Install git, git-lfs, and pip through apk (the backup image is based on alpine).
apk add --no-cache git git-lfs py3-pip

# Install git-filter-repo through pip.
pip3 install --no-cache-dir git-filter-repo

# Find the latest backup file in the `BACKUP_DIR` directory.
readonly latest_backup_file=$(find "$BACKUP_DIR" -type f -exec basename {} \; | sort | tail -n 1 | xargs -I{} find "$BACKUP_DIR" -name {})

# Find the remote URL of the git repository for pushing the latest backup file to GitLab.
readonly BACKUP_REMOTE=$(cat /run/secrets/"$REMOTE_DEST_ACCESS_TOKEN_SECRET_NAME")

# Push the latest backup file to GitHub using git-lfs.
cd "$BACKUP_POOL_DIR" || exit
readonly FILE_BASENAME=$(basename "$latest_backup_file")

git pull origin main

# Remove the previous backup file from the git repository, using git-filter-repo.
# This should be done before any un-staged changes are made.
git filter-repo --path-glob '*.tgz' --invert-paths --force

# Restore the remote URL of the git repository, since it is removed by git-filter-repo.
git remote add origin "$BACKUP_REMOTE"
git branch --set-upstream-to=origin/main main

# Clean up all the previous backups in the pool directory.
rm -rf "${BACKUP_POOL_DIR:?}/"*.tgz

# Copy the latest backup file to the `BACKUP_POOL_DIR` directory.
cp "$latest_backup_file" "$BACKUP_POOL_DIR"

git add "."

git lfs lock "$FILE_BASENAME"

git config --global user.email "auto-actions[bot]"
git config --global user.name "auto-actions[bot]"
git commit -m "Update the latest backup file $FILE_BASENAME"

git push origin main -f
