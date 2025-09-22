#!/bin/bash

confirm_manifest_update() {
    # Function to confirm manifest update
    while true; do
        read -p "Have you updated and saved the manifest and package.json? (y/N) " yn
        case $yn in
            [Yy]* ) break;;
            [Nn]* ) exit;;
            * ) echo "Please answer yes or no.";;
        esac
    done
}

if [ "$#" -ne 1 ]; then
    echo "Usage: panda build <version>"
    exit 1
fi

VERSION="$1"
ZIP_FILE="pw-${VERSION}.zip"
CHECKSUM_FILE="pw-${VERSION}.256"
BUILD_DIR="build"

# Speedbump: Confirm manifest has been updated
confirm_manifest_update

# Step 0: Delete old zip files
rm -f "public/builds/pw-"*.zip
rm -f "public/builds/pw-"*.256

# Step 1: Run the build
npm run format
npm run build
# Check if build is successful
if [ $? -ne 0 ]; then
    echo "Build failed. Exiting..."
    exit 1
fi

# Step 2: Zip the build directory
zip -r "$ZIP_FILE" "$BUILD_DIR" >/dev/null

# Step 3: Move the zip file to /public/builds
mv "$ZIP_FILE" "public/builds"

# Step 4: Create a sha256 checksum
shasum -a 256 "public/builds/$ZIP_FILE" > "public/builds/$CHECKSUM_FILE"

# Step 5: Get the checksum hash
CHECKSUM_HASH=$(cat "public/builds/$CHECKSUM_FILE" | awk '{print $1}')

# Step 6: Print the version and checksum
echo "Version upgraded to $VERSION with checksum:"
echo "$CHECKSUM_HASH"
echo "*********************************************************************************************"
echo "DON'T FORGET TO:"
echo "UPDATE THE README - VERSION"
echo "RUN RELEASE COMMAND"
echo "**************"
