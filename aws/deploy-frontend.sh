#!/usr/bin/env bash
# Deploy the ChopChopMol frontend to S3 + CloudFront.
# ---------------------------------------------------------------------------
# Run from the repo root on your Mac:
#   bash aws/deploy-frontend.sh
#
# Syncs demo/ to the S3 bucket, sets sensible cache headers (long-lived for
# static assets, no-cache for HTML so updates show immediately), and
# invalidates the CloudFront cache.
# See AWS_MIGRATION_GUIDE.md §5.5 / §7.3.
# ---------------------------------------------------------------------------
set -euo pipefail

# ---- EDIT THESE TWO ----
BUCKET="chopchopmol-frontend"                       # your S3 bucket name (§5.1)
DISTRIBUTION_ID="CHANGEME"                          # CloudFront distribution id (§5.3)
# ------------------------

SRC="demo"   # the site root — index.html, main.js, aiagent.js, etc. live here

if [[ ! -f "$SRC/index.html" ]]; then
	echo "!! Run this from the repo root (expected $SRC/index.html). Aborting."
	exit 1
fi

# Files that must NOT be uploaded (build/dev/Firebase leftovers).
EXCLUDES=(
	--exclude ".git/*"
	--exclude "node_modules/*"
	--exclude "tests/*"
	--exclude "package.json"
	--exclude "package-lock.json"
	--exclude "firebase.json"
	--exclude ".firebaserc"
	--exclude "firestore.rules"
	--exclude "firestore.indexes.json"
	--exclude "*.md"
	--exclude ".DS_Store"
)

echo "==> [1/3] Uploading static assets (long cache)"
# Everything except HTML: cache hard for a year. Filenames/imports are versioned
# by CDN URLs and content, so this is safe; HTML is handled separately below.
aws s3 sync "$SRC" "s3://$BUCKET" \
	"${EXCLUDES[@]}" \
	--exclude "*.html" \
	--cache-control "public,max-age=31536000,immutable" \
	--delete

echo "==> [2/3] Uploading HTML (no-cache)"
# HTML must always be fresh so users get new asset references immediately.
aws s3 sync "$SRC" "s3://$BUCKET" \
	"${EXCLUDES[@]}" \
	--exclude "*" --include "*.html" \
	--cache-control "no-cache" \
	--content-type "text/html; charset=utf-8"

echo "==> [3/3] Invalidating CloudFront cache"
aws cloudfront create-invalidation \
	--distribution-id "$DISTRIBUTION_ID" \
	--paths "/*" \
	--query 'Invalidation.Id' --output text

echo
echo "Done. Live in ~30-60s at https://www.chopchopmol.com"
