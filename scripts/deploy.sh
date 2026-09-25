#!/usr/bin/env bash
# Builds the web app and the rooms API, deploys the API's Lambda, then publishes the app to the
# site bucket behind CloudFront (SPEC.md §11, multiplayer SPEC §13).
# Needs: pnpm, terraform (with infra/ already applied) and AWS credentials for the account.
set -euo pipefail

cd "$(dirname "$0")/.."

# Print AWS CLI output straight to the terminal rather than through a pager that waits for q.
export AWS_PAGER=""

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
ROOMS_FUNCTION=$(terraform -chdir=infra output -raw rooms_function_name)

echo "Installing, checking and building $(git rev-parse --short HEAD)…"
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# The rooms API first, so the app never calls a Lambda older than itself.
echo "Deploying the rooms API to ${ROOMS_FUNCTION}…"
ROOMS_ZIP=$(mktemp -d)/rooms-api.zip
(cd apps/rooms-api/dist && zip -q -X "$ROOMS_ZIP" handler.mjs handler.mjs.map)
aws lambda update-function-code --function-name "$ROOMS_FUNCTION" \
  --zip-file "fileb://$ROOMS_ZIP" --query "CodeSha256" --output text
aws lambda wait function-updated-v2 --function-name "$ROOMS_FUNCTION"

DIST=apps/web/dist

# Hashed assets never change, so browsers and CloudFront may keep them for a year. Upload them
# first, so the new index.html never points at files that aren't there yet. Old assets are kept:
# a browser still showing the previous index.html can go on loading them.
echo "Uploading assets to s3://${BUCKET}…"
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" \
  --cache-control "public, max-age=31536000, immutable"

# Everything else (index.html, the manifest and icons) must be revalidated on every load, so a
# deploy shows up at once. The AWS CLI doesn't know .webmanifest and would upload it as
# binary/octet-stream, so the manifest goes up on its own, before the index.html that links it.
aws s3 cp "$DIST/manifest.webmanifest" "s3://$BUCKET/manifest.webmanifest" \
  --content-type "application/manifest+json" \
  --cache-control "no-cache"
aws s3 sync "$DIST" "s3://$BUCKET" \
  --exclude "assets/*" \
  --exclude "manifest.webmanifest" \
  --delete \
  --cache-control "no-cache"

# Clear CloudFront's copies of the app shell: /, /index.html and the deep-link error responses.
echo "Invalidating CloudFront…"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" \
  --query "Invalidation.Id" --output text

echo "Deployed: $(terraform -chdir=infra output -raw url)"
