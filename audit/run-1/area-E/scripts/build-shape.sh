#!/usr/bin/env bash
# audit/run-1/area-E/scripts/build-shape.sh
# Builds one of the four build shapes for area E and snapshots it under
# audit/run-1/area-E/builds/<shape>/.  Touches no product code.
#
#   public       channel data off   (the shipped shape)
#   owner-match  on,  allowlist contains THIS machine's salted hash
#   owner-nomatch on, allowlist contains a hash for a different machine
#   owner-star   on,  allowlist is "*"
set -euo pipefail
REPO=/home/user/stream-trimmer
SHAPE="${1:?usage: build-shape.sh public|owner-match|owner-nomatch|owner-star}"
SALT=audit-salt-E-2026-7f3a
MINE=9e7ecc4b1ebadc8b3bcae2d3a96c5605d4615739b41515ca16f6e4e19938e2c3
OTHER=63e7977b735f0aa8aa9acba72b9c39a697fbc39b81e040beeeeced4d20d27c30

case "$SHAPE" in
  public)        ON=""  LIST=""        ;;
  owner-match)   ON="1" LIST="$MINE"   ;;
  owner-nomatch) ON="1" LIST="$OTHER"  ;;
  owner-star)    ON="1" LIST="*"       ;;
  *) echo "unknown shape $SHAPE" >&2; exit 2 ;;
esac

cd "$REPO"
rm -rf dist electron/dist
VITE_ENABLE_CHANNEL_DATA="$ON" VITE_OWNER_MACHINES="$LIST" VITE_OWNER_SALT="$SALT" \
  npx vite build >/dev/null
VITE_ENABLE_CHANNEL_DATA="$ON" node scripts/build-server.cjs >/dev/null

OUT="$REPO/audit/run-1/area-E/builds/$SHAPE"
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r dist "$OUT/dist"
cp electron/dist/server.cjs "$OUT/server.cjs"
echo "$SHAPE built -> $OUT  (renderer: $(ls "$OUT"/dist/assets/*.js))"
