#!/bin/bash

if [ "$#" -ne 1 ]; then
    echo "Usage: release.sh <version>"
    exit 1
fi

VERSION="$1"
ZIP_FILE="public/builds/pw-${VERSION}.zip"
CHECKSUM_FILE="public/builds/pw-${VERSION}.256"

# Step 1: Add changes to Git
git add .

# Step 2: Commit the changes
git commit -m "Update version to $VERSION"

# Step 3: Tag the new commit
git tag "$VERSION"

# Step 4: Push changes and tags to remote
git push origin main --tags

# Step 5: Create a GitHub release draft without release notes
gh release create "$VERSION" "$ZIP_FILE" --draft --title "Release $VERSION"
