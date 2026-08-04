test -z "$(git status --porcelain)" || {
  echo "Commit the current source before publishing a commit-tagged image."
  return 1
}

corepack pnpm install --frozen-lockfile &&
corepack pnpm test &&

gcloud auth configure-docker us-east4-docker.pkg.dev --quiet &&

IMAGE_REPOSITORY="$(
  terraform -chdir=infra/environments/test \
    output -raw artifact_repository_url
)" &&
IMAGE_TAG="$(git rev-parse --short=12 HEAD)" &&
TAGGED_IMAGE="${IMAGE_REPOSITORY}/stablecoin-whale-monitor:${IMAGE_TAG}" &&

docker buildx build \
  --platform linux/amd64 \
  --tag "$TAGGED_IMAGE" \
  --push \
  . &&

IMAGE_DIGEST="$(
  gcloud artifacts docker images describe "$TAGGED_IMAGE" \
    --project=swm-gcp-test-v2 \
    --format='value(image_summary.digest)'
)" &&
APPLICATION_IMAGE="${IMAGE_REPOSITORY}/stablecoin-whale-monitor@${IMAGE_DIGEST}" &&

docker buildx imagetools inspect "$APPLICATION_IMAGE" &&
printf 'application_image = "%s"\n' "$APPLICATION_IMAGE"