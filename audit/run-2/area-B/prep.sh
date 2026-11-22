#!/usr/bin/env bash
# File: audit/run-2/area-B/prep.sh
# Builds the three trees run 2 area B drives, plus the stub root. Audit-only.
#   wtB    = HEAD (the real tree)
#   wtRev0 = 26ea7ab (run-1 code, before any fix) -- the negative control
#   wtRev1 = HEAD with ONLY the C-1 call site reverted
set -e
SP=/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad
REPO=/home/user/stream-trimmer

mktree() { # $1 = dir, $2 = committish
  rm -rf "$SP/$1"; mkdir -p "$SP/$1"
  ( cd "$REPO" && git archive "$2" | tar -x -C "$SP/$1" )
  ln -sfn "$REPO/node_modules" "$SP/$1/node_modules"
  cp -r "$REPO/resources" "$SP/$1/"
}
build() { ( cd "$SP/$1" && npx vite build >/dev/null && node scripts/build-server.cjs >/dev/null ); }

mktree wtB HEAD;     build wtB
mktree wtRev0 26ea7ab; build wtRev0
mktree wtRev1 HEAD
python3 - "$SP/wtRev1/src/components/ClipsColumn.tsx" <<'EOF'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace('import { useSegments } from "../hooks/useSegments";',
              'import { setBankedRanges, useSegments } from "../hooks/useSegments";')
s = s.replace('      seg.setBanked(planned);', '      setBankedRanges(planned);')
s = s.replace('  }, [planned, seg.banked.length, seg.setBanked, vid]);',
              '  }, [planned, seg.banked.length, vid]);')
open(p, 'w').write(s)
EOF
build wtRev1

# stub root (area-B flavour: answers the auth probe, writes a real WebVTT, cuts with real ffmpeg)
node "$REPO/audit/run-1/area-B/stubroot.cjs" "$SP/stubB2"
echo "ready"
