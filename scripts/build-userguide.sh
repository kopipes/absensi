#!/usr/bin/env bash
#
# Regenerate doc/userguide.html (self-contained HTML user guide with screenshots).
#
# Requirements: Google Chrome installed at the default macOS path, Node 20+.
#
# Usage:
#   ./scripts/build-userguide.sh            # uses http://localhost:3000
#   BASE=http://localhost:3100 ./scripts/build-userguide.sh
#
# The guide is built from the running app: every screenshot is captured with a
# real login for each role, then embedded as base64 inside a single HTML file so
# the result works offline with no asset folder.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
BASE="${BASE:-http://localhost:3000}"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "==> Preparing build workspace in $WORK"
cd "$WORK"
npm init -y >/dev/null 2>&1
npm i --no-audit --no-fund puppeteer-core@23 >/dev/null 2>&1

echo "==> Copying capture/build scripts from $ROOT/scripts/userguide"
mkdir -p shots
cp "$ROOT"/scripts/userguide/*.mjs .

echo "==> Capturing screenshots from $BASE (app must be running)"
BASE="$BASE" node capture.mjs

echo "==> Building self-contained guide"
node build-guide.mjs "$ROOT/doc/userguide.html"

# Publish the same file so it is reachable at <app>/guide (allowed in middleware).
mkdir -p "$ROOT/public/guide"
cp "$ROOT/doc/userguide.html" "$ROOT/public/guide/index.html"

echo "==> Done:"
echo "    $ROOT/doc/userguide.html          (repo copy)"
echo "    $ROOT/public/guide/index.html     (served at /guide)"