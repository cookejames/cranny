#!/usr/bin/env bash
# Builds the web app and publishes it to the site bucket behind CloudFront (SPEC.md §11).
# Needs: pnpm, terraform (with infra/ already applied) and AWS credentials for the account.
set -euo pipefail

cd "$(dirname "$0")/.."

# Deploy exactly what's committed: no stray local edits.
if [[ -n $(git status --porcelain) ]]; then
  echo "Uncommitted changes; commit or stash them first." >&2
  exit 1
fi

# Show who is deploying, and refuse the root user unless CRANNY_ALLOW_ROOT=1.
IDENTITY=$(aws sts get-caller-identity --query Arn --output text)
echo "Deploying as $IDENTITY"
if [[ $IDENTITY == *":root" ]]; then
  if [[ ${CRANNY_ALLOW_ROOT:-} != 1 ]]; then
    echo "Refusing to deploy as the account root user; sign in as an IAM user or role" >&2
    echo "(or set CRANNY_ALLOW_ROOT=1 to deploy as root anyway)." >&2
    exit 1
  fi
  echo "Warning: deploying as the account root user." >&2
fi

BUCKET=$(terraform -chdir=infra output -raw bucket_name)
DISTRIBUTION=$(terraform -chdir=infra output -raw distribution_id)

echo "Installing, checking and building $(git rev-parse --short HEAD)…"
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build

DIST=apps/web/dist

# Hashed assets never change, so browsers and CloudFront may keep them for a year. Upload them
# first, so the new index.html never points at files that aren't there yet. Old assets are kept:
# a browser still showing the previous index.html can go on loading them.
echo "Uploading assets to s3://${BUCKET}…"
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" \
  --cache-control "public, max-age=31536000, immutable"

# Everything else (index.html) must be revalidated on every load, so a deploy shows up at once.
aws s3 sync "$DIST" "s3://$BUCKET" \
  --exclude "assets/*" \
  --delete \
  --cache-control "no-cache"

# Clear CloudFront's copies of the app shell: /, /index.html and the deep-link error responses.
echo "Invalidating CloudFront…"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" \
  --query "Invalidation.Id" --output text

echo "Deployed: $(terraform -chdir=infra output -raw url)"
