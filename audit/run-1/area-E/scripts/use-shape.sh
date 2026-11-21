#!/usr/bin/env bash
# audit/run-1/area-E/scripts/use-shape.sh <shape>
# Installs a previously snapshotted build shape into dist/ + electron/dist/ so
# the harness launches that shape. Only build output is touched.
set -euo pipefail
REPO=/home/user/stream-trimmer
S="${1:?usage: use-shape.sh public|owner-match|owner-nomatch|owner-star}"
B="$REPO/audit/run-1/area-E/builds/$S"
[ -d "$B/dist" ] || { echo "shape $S not built; run build-shape.sh $S" >&2; exit 2; }
rm -rf "$REPO/dist" "$REPO/electron/dist"
cp -r "$B/dist" "$REPO/dist"
mkdir -p "$REPO/electron/dist"
cp "$B/server.cjs" "$REPO/electron/dist/server.cjs"
echo "in place: $S"
