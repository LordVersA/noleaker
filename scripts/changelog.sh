#!/bin/bash
# Release notes from commit messages, grouped into Features, Fixes and Other changes.
#
#   scripts/changelog.sh <from-ref> <to-ref>   commits in from..to
#   scripts/changelog.sh "" <to-ref>           everything up to to-ref (first release)
#
# With GITHUB_REPOSITORY set (CI), a compare link to the previous tag is added.
set -euo pipefail

FROM="${1:-}"
TO="${2:?usage: changelog.sh <from-ref|\"\"> <to-ref>}"

commits=$(git log --no-merges --format='- %s (%h)' "${FROM:+$FROM..}$TO" | grep -v '^- chore: release' || true)
section() {
  local lines
  lines=$(printf '%s\n' "$commits" | grep "$2" "$3" || true)
  if [ -n "$lines" ]; then printf '## %s\n\n%s\n\n' "$1" "$lines"; fi
}
section Features -E '^- feat'
section Fixes -E '^- fix'
section 'Other changes' -vE '^- (feat|fix)|^$'
if [ -n "$FROM" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  echo "**Full changelog**: https://github.com/$GITHUB_REPOSITORY/compare/$FROM...$TO"
fi
