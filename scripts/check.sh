#!/usr/bin/env bash
# Lints the plugin and replays the fixture with the gateway's own plugin CLI.
# Needs a models-gateway checkout; defaults to the sibling directory.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
gateway="${GATEWAY_DIR:-$root/../models-gateway}"
plugin="$root/plugins/tasks/icreat/plugin.js"
fixture="$root/tests/icreat.fixture.json"

cd "$gateway"
CGO_ENABLED=0 go run . plugin lint "$plugin"
CGO_ENABLED=0 go run . plugin test "$plugin" --fixture "$fixture"
