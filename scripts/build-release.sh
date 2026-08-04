#!/usr/bin/env bash

set -Eeuo pipefail

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: scripts/build-release.sh <version>"
  exit 1
fi

VERSION="${VERSION#v}"

PACKAGE_NAME="socicon-${VERSION}"
RELEASE_DIRECTORY="release"
PACKAGE_DIRECTORY="${RELEASE_DIRECTORY}/${PACKAGE_NAME}"

echo "Building production package ${PACKAGE_NAME}..."

rm -rf "$PACKAGE_DIRECTORY"

mkdir -p \
  "${PACKAGE_DIRECTORY}/fonts" \
  "${PACKAGE_DIRECTORY}/svg" \
  "${PACKAGE_DIRECTORY}/demo-files" \
  "${PACKAGE_DIRECTORY}/site/data"

cp -R fonts/. "${PACKAGE_DIRECTORY}/fonts/"
cp -R svg/. "${PACKAGE_DIRECTORY}/svg/"
cp -R demo-files/. "${PACKAGE_DIRECTORY}/demo-files/"
cp -R site/data/. \
  "${PACKAGE_DIRECTORY}/site/data/"

cp \
  demo.html \
  style.css \
  style.scss \
  variables.scss \
  chart-list.json \
  chart-list.js \
  README.md \
  CHANGELOG.md \
  "$PACKAGE_DIRECTORY/"

if [[ -f LICENSE ]]; then
  cp LICENSE "$PACKAGE_DIRECTORY/"
elif [[ -f LICENSE.md ]]; then
  cp LICENSE.md "$PACKAGE_DIRECTORY/"
elif [[ -f LICENSE.txt ]]; then
  cp LICENSE.txt "$PACKAGE_DIRECTORY/"
else
  echo "Error: No license file was found."
  exit 1
fi

(
  cd "$RELEASE_DIRECTORY"

  rm -f \
    "${PACKAGE_NAME}.zip" \
    "${PACKAGE_NAME}.tar.gz"

  zip -r "${PACKAGE_NAME}.zip" "$PACKAGE_NAME"

  tar \
    --create \
    --gzip \
    --file="${PACKAGE_NAME}.tar.gz" \
    "$PACKAGE_NAME"
)

echo ""
echo "Production archives generated:"
echo "  ${RELEASE_DIRECTORY}/${PACKAGE_NAME}.zip"
echo "  ${RELEASE_DIRECTORY}/${PACKAGE_NAME}.tar.gz"