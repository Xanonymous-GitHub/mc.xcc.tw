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

# Check if the remote named "origin" already exists
if git remote | grep -q '^origin$'; then
    echo "Remote 'origin' already exists. Exiting."
else
    git remote add origin "$BACKUP_REMOTE"
    git fetch
    echo "Remote 'origin' added with URL: $BACKUP_REMOTE"
fi

git pull --rebase

# Remove the previous backup file from the git repository, using git-filter-repo.
# This should be done before any un-staged changes are made.
git filter-repo --path-glob '*.tgz' --invert-paths --force --prune-empty never

# Cleanup the git-lfs files. (in .git folder)
git for-each-ref --format="delete %(refname)" refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now
git lfs prune

# Restore the remote URL of the git repository, since it is removed by git-filter-repo.
git remote add origin "$BACKUP_REMOTE"
git fetch
git branch --set-upstream-to=origin/main main
git reset origin/main --hard

# Clean up all the previous backups in the pool directory.
rm -rf "${BACKUP_POOL_DIR:?}/"*.tgz

# Remove all the git replace refs, unless the git branch tree will be very large.
git replace --list | xargs -r git replace -d

# Copy the latest backup file to the `BACKUP_POOL_DIR` directory.
cp "$latest_backup_file" "$BACKUP_POOL_DIR"

git add "."

git lfs lock "$FILE_BASENAME"

git config --global user.email "auto-actions[bot]"
git config --global user.name "auto-actions[bot]"

# Remove all the git replace refs, unless the git branch tree will be very large. (again)
git replace --list | xargs -r git replace -d
git commit -m "Update the latest backup file $FILE_BASENAME"

git push origin main -f
