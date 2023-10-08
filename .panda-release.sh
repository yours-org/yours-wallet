#!/bin/bash

if [ "$#" -ne 1 ]; then
    echo "Usage: release.sh <version>"
    exit 1
fi

VERSION="$1"
ZIP_FILE="public/builds/pw-${VERSION}.zip"
CHECKSUM_FILE="public/builds/pw-${VERSION}.256"
MANIFEST_FILE="public/manifest.json"

# Step 1: Add changes to Git
git add .

# Step 2: Commit the changes
git commit -m "Update version to $VERSION"

# Step 3: Tag the new commit
git tag "$VERSION"

# Step 4: Push changes and tags to remote
git push origin main --tags

# Step 5: Gather commit messages since the last version update
RELEASE_NOTES="Release $VERSION\n\nChangelog:\n"
LAST_VERSION_UPDATE_COMMIT=$(git log --grep='Update version to' --format=format:"%H" | awk 'NR==2{print $1}')
if [ -n "$LAST_VERSION_UPDATE_COMMIT" ]; then
    RELEASE_NOTES+=$(git log --pretty=format:"- %s" "${LAST_VERSION_UPDATE_COMMIT}..HEAD")
else
    RELEASE_NOTES+="No previous version update found."
fi

# Step 6: Create a GitHub release draft
gh release create "$VERSION" "$ZIP_FILE" --draft --title "Release $VERSION" --notes "$RELEASE_NOTES"