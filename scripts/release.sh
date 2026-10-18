#!/bin/bash
# Starts a release: bumps the version in package.json, package-lock.json and both manifests,
# commits "chore: release X.Y.Z", tags it and pushes. CI then builds, signs and publishes a GitHub
# Release whose notes are the changelog below (scripts/changelog.sh).
#
#   npm run release -- 0.3.0        shows the notes, asks, then releases v0.3.0
#   npm run release -- 0.3.0 -y     same without the question
set -euo pipefail

VERSION="${1:?usage: release.sh <X.Y.Z> [-y]}"
VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "error: version must look like 1.2.3" >&2; exit 1; }
TAG="v$VERSION"

cd "$(dirname "$0")/.."
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || { echo "error: releases are made from main" >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "error: uncommitted changes. Commit them first." >&2; exit 1; }
git fetch -q origin main --tags
git merge-base --is-ancestor origin/main HEAD || { echo "error: main is behind origin. Pull first." >&2; exit 1; }
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && { echo "error: $TAG already exists" >&2; exit 1; }

PREVIOUS="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
echo "Release $TAG (previous: ${PREVIOUS:-none})"
echo "---- release notes ----"
scripts/changelog.sh "$PREVIOUS" HEAD
echo "-----------------------"

if [[ "${2:-}" != "-y" ]]; then
  read -r -p "Bump, tag and push $TAG? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Cancelled."; exit 1; }
fi

npm version "$VERSION" --no-git-tag-version >/dev/null
perl -pi -e 's/^(  "version": )"[^"]*"/$1"'"$VERSION"'"/' manifests/manifest.chrome.json manifests/manifest.firefox.json
git commit -qam "chore: release $VERSION"
git tag -a "$TAG" -m "noleaker $VERSION"
git push --atomic origin main "$TAG"
echo "Pushed $TAG. Watch it with: gh run watch"
