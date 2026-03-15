#!/bin/bash
# filepath: /Users/mac-FGILLO05/Private folder /vocal-vibes-hub-1/ios/App/sign_frameworks.sh

set -e

FRAMEWORKS_DIR="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}"
EXPANDED_CODE_SIGN_IDENTITY_NAME="${EXPANDED_CODE_SIGN_IDENTITY_NAME:-$(security find-identity -v -p codesigning | grep 'Apple Distribution' | head -1 | sed 's/^.*"\(.*\)"$/\1/')}"
EXPANDED_CODE_SIGN_IDENTITY="${EXPANDED_CODE_SIGN_IDENTITY:-${EXPANDED_CODE_SIGN_IDENTITY_NAME}}"

if [ -z "$EXPANDED_CODE_SIGN_IDENTITY" ]; then
  echo "Warning: No code signing identity found"
  exit 0
fi

echo "Code Signing Identity: $EXPANDED_CODE_SIGN_IDENTITY"

for framework in "$FRAMEWORKS_DIR"/*.framework; do
  echo "Signing framework: $(basename "$framework")"
  codesign --force --verbose --sign "$EXPANDED_CODE_SIGN_IDENTITY" --preserve-metadata=identifier,entitlements,flags "$framework"
done

echo "All frameworks signed successfully"