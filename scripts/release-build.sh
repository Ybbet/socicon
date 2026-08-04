#!/usr/bin/env bash

set -Eeuo pipefail

VERSION="${1:-}"

RELEASE_DIRECTORY="release"

REQUIRED_DIRECTORIES=(
  "fonts"
  "svg"
  "demo-files"
  "site/data"
)

REQUIRED_FILES=(
  "demo.html"
  "style.css"
  "style.scss"
  "variables.scss"
  "chart-list.json"
  "chart-list.js"
  "README.md"
  "CHANGELOG.md"
)

error() {
  echo "Error: $*" >&2
}

info() {
  echo "$*"
}

usage() {
  echo "Usage: scripts/build-release.sh <version>"
  echo ""
  echo "Examples:"
  echo "  scripts/build-release.sh 3.9.0"
  echo "  scripts/build-release.sh v3.9.0"
}

validate_version() {
  local version="$1"

  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
    error "Invalid version: ${version}"
    error "Expected a semantic version such as 3.9.0 or 3.9.0-beta.1."
    exit 1
  fi
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    error "Required command not found: ${command_name}"
    exit 1
  fi
}

require_directory() {
  local directory="$1"

  if [[ ! -d "$directory" ]]; then
    error "Required directory not found: ${directory}"
    exit 1
  fi
}

require_file() {
  local file="$1"

  if [[ ! -f "$file" ]]; then
    error "Required file not found: ${file}"
    exit 1
  fi
}

find_license_file() {
  local candidate

  for candidate in \
    "LICENSE" \
    "LICENSE.md" \
    "LICENSE.txt"
  do
    if [[ -f "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

copy_directory_contents() {
  local source_directory="$1"
  local destination_directory="$2"

  mkdir -p "$destination_directory"

  cp -R \
    "${source_directory}/." \
    "${destination_directory}/"
}

display_archive_summary() {
  local zip_file="$1"
  local tar_file="$2"

  local zip_size
  local tar_size

  zip_size="$(
    du -h "$zip_file" |
      awk '{ print $1 }'
  )"

  tar_size="$(
    du -h "$tar_file" |
      awk '{ print $1 }'
  )"

  echo ""
  echo "Production archives generated:"
  echo "  ${zip_file} (${zip_size})"
  echo "  ${tar_file} (${tar_size})"
}

if [[ -z "$VERSION" ]]; then
  usage
  exit 1
fi

VERSION="${VERSION#v}"

validate_version "$VERSION"

PACKAGE_NAME="socicon-${VERSION}"
PACKAGE_DIRECTORY="${RELEASE_DIRECTORY}/${PACKAGE_NAME}"
ZIP_FILE="${RELEASE_DIRECTORY}/${PACKAGE_NAME}.zip"
TAR_FILE="${RELEASE_DIRECTORY}/${PACKAGE_NAME}.tar.gz"

require_command "npm"
require_command "zip"
require_command "unzip"
require_command "tar"
require_command "du"
require_command "awk"
require_command "grep"

if [[ ! -f "package.json" ]]; then
  error "package.json was not found."
  error "Run this script from the repository root."
  exit 1
fi

info "Building production package ${PACKAGE_NAME}..."
echo ""

#
# Generate and validate every derived asset before packaging.
#
# The build command generates:
# - chart-list.json and chart-list.js;
# - individual SVG files;
# - website data;
# - consistency validation.
#
info "Generating and validating assets..."
npm run build

for directory in "${REQUIRED_DIRECTORIES[@]}"; do
  require_directory "$directory"
done

for file in "${REQUIRED_FILES[@]}"; do
  require_file "$file"
done

LICENSE_FILE="$(
  find_license_file
)" || {
  error "No license file was found."
  exit 1
}

info ""
info "Creating production directory..."

rm -rf "$PACKAGE_DIRECTORY"

rm -f \
  "$ZIP_FILE" \
  "$TAR_FILE"

mkdir -p \
  "${PACKAGE_DIRECTORY}/fonts" \
  "${PACKAGE_DIRECTORY}/svg" \
  "${PACKAGE_DIRECTORY}/demo-files" \
  "${PACKAGE_DIRECTORY}/site/data"

copy_directory_contents \
  "fonts" \
  "${PACKAGE_DIRECTORY}/fonts"

copy_directory_contents \
  "svg" \
  "${PACKAGE_DIRECTORY}/svg"

copy_directory_contents \
  "demo-files" \
  "${PACKAGE_DIRECTORY}/demo-files"

copy_directory_contents \
  "site/data" \
  "${PACKAGE_DIRECTORY}/site/data"

cp \
  demo.html \
  style.css \
  style.scss \
  variables.scss \
  chart-list.json \
  chart-list.js \
  README.md \
  CHANGELOG.md \
  "$LICENSE_FILE" \
  "$PACKAGE_DIRECTORY/"

info "Creating ZIP archive..."

(
  cd "$RELEASE_DIRECTORY"

  zip \
    -q \
    -r \
    "${PACKAGE_NAME}.zip" \
    "$PACKAGE_NAME"
)

info "Creating tar.gz archive..."

(
  cd "$RELEASE_DIRECTORY"

  tar \
    --create \
    --gzip \
    --file="${PACKAGE_NAME}.tar.gz" \
    "$PACKAGE_NAME"
)

require_file "$ZIP_FILE"
require_file "$TAR_FILE"

#
# Ensure development and maintenance files were not accidentally included.
#
FORBIDDEN_ARCHIVE_PATHS=(
  "${PACKAGE_NAME}/.github"
  "${PACKAGE_NAME}/scripts"
  "${PACKAGE_NAME}/node_modules"
  "${PACKAGE_NAME}/package.json"
  "${PACKAGE_NAME}/package-lock.json"
  "${PACKAGE_NAME}/selection.json"
  "${PACKAGE_NAME}/icons-metadata.json"
  "${PACKAGE_NAME}/metadata-rules.json"
  "${PACKAGE_NAME}/metadata-suggestions.json"
)

ZIP_CONTENTS="$(
  unzip -Z1 "$ZIP_FILE"
)"

TAR_CONTENTS="$(
  tar \
    --list \
    --gzip \
    --file="$TAR_FILE"
)"

for forbidden_path in "${FORBIDDEN_ARCHIVE_PATHS[@]}"; do
  if grep -Fxq "$forbidden_path" <<< "$ZIP_CONTENTS" ||
    grep -Fq "${forbidden_path}/" <<< "$ZIP_CONTENTS"
  then
    error "Forbidden path found in ZIP archive: ${forbidden_path}"
    exit 1
  fi

  if grep -Fxq "$forbidden_path" <<< "$TAR_CONTENTS" ||
    grep -Fq "${forbidden_path}/" <<< "$TAR_CONTENTS"
  then
    error "Forbidden path found in tar.gz archive: ${forbidden_path}"
    exit 1
  fi
done

display_archive_summary \
  "$ZIP_FILE" \
  "$TAR_FILE"
