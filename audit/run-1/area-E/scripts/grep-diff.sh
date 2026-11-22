#!/usr/bin/env bash
# audit/run-1/area-E/scripts/grep-diff.sh
# Counts channel-exporter marker strings in every built shape, renderer bundle
# and bundled server alike. Read-only.
set -uo pipefail
B=/home/user/stream-trimmer/audit/run-1/area-E/builds
SHAPES="public owner-match owner-nomatch owner-star"

PATS=(
  'api/channel/export'
  'api/channel/export/cancel'
  'api/channel/export/progress'
  'Channel profile exporter'
  'Channel data'
  'ui-channel-link'
  'Back to clipping'
  'Export channel'
  'What to export'
  'Start over (ignore saved progress)'
  'Reads public data on this computer'
  'Top 50 per video'
  'youtube.com/@channelhandle'
  'Partial export saved'
  'video-status.csv'
  'transcripts.csv'
  'videos.csv'
  'summary.csv'
  'hashtags_in_title'
  'subscriber_count'
  'includeTranscripts'
  'registerChannelRoutes'
  'comment_sort=top'
  'flatPlaylist'
  'isOwnerMachine'
  'owner:check'
  'audit-salt-E-2026-7f3a'
  '9e7ecc4b1ebadc8b3bcae2d3a96c5605d4615739b41515ca16f6e4e19938e2c3'
  '63e7977b735f0aa8aa9acba72b9c39a697fbc39b81e040beeeeced4d20d27c30'
)

row() { printf '%-36s' "$1"; shift; for v in "$@"; do printf ' %-14s' "$v"; done; printf '\n'; }

echo "### renderer bundle (dist/assets/*.js)"
row "pattern" $SHAPES
for p in "${PATS[@]}"; do
  vals=()
  for s in $SHAPES; do
    f=$(ls $B/$s/dist/assets/*.js 2>/dev/null | head -1)
    vals+=("$(grep -o -F -- "$p" "$f" 2>/dev/null | wc -l)")
  done
  row "$p" "${vals[@]}"
done

echo
echo "### bundled server (server.cjs)"
row "pattern" $SHAPES
for p in "${PATS[@]}"; do
  vals=()
  for s in $SHAPES; do
    vals+=("$(grep -o -F -- "$p" $B/$s/server.cjs 2>/dev/null | wc -l)")
  done
  row "$p" "${vals[@]}"
done

echo
echo "### sizes"
for s in $SHAPES; do
  printf '%-14s renderer=%-9s server=%-9s\n' "$s" \
    "$(stat -c%s $(ls $B/$s/dist/assets/*.js | head -1))" \
    "$(stat -c%s $B/$s/server.cjs)"
done

echo
echo "### source maps / .ts leftovers in any dist"
for s in $SHAPES; do
  echo "$s: $(find $B/$s/dist -name '*.map' -o -name '*.ts' | wc -l) map/ts files"
done
