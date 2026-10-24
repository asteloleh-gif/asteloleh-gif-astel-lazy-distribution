#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Public registry dependency installation only; no application production credentials.
verification_home=$(mktemp -d)
trap 'rm -rf "$verification_home"' EXIT HUP INT TERM
node -e 'if(Number(process.versions.node.split(".")[0])<22)throw Error("Node 22+ required for release verification")'
env -i PATH="$PATH" HOME="$verification_home" CI=true npm ci --ignore-scripts
env -i PATH="$PATH" HOME="$verification_home" CI=true npm test
