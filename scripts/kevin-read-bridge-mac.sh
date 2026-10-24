#!/bin/sh
set -eu
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname -- "$script_dir")
node_bin=/Users/oleh/Documents/Codex/2026-10-23/files-pasted-by-the-user-instagram/work/toolchain/node-v24.20.0-darwin-arm64/bin/node
export LD_KEVIN_CREDENTIAL_FILE=/Users/oleh/.config/astel-distribution/kevin-hub-reader.json
exec "$node_bin" "$repo_dir/scripts/kevin-read-bridge.mjs"
