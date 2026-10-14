#!/usr/bin/env bash
# Runs load/catalog.js against the built API, in production mode, on the seed dataset.
#
# Needs: the development stack (docker compose up -d postgres redis), a seeded database
# (npm run db:seed in api/) and a build (npm run build in api/). Node 24 on the PATH.
# The API logs at info level to /dev/null, so the cost of logging each request is included.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
port="${PORT:-3000}"
base_url="http://127.0.0.1:${port}/api/v1"
k6_image='grafana/k6:2.3.0@sha256:9c2dee7f8ed74d317e4027c06a10f169b625638189de8d4555d0b3486a5aeb34'

cd "${root}/api"
# Variables set here take precedence over the ones in ../.env.
NODE_ENV=production LOG_LEVEL=info TRUST_PROXY_HOPS=1 PORT="${port}" \
  node --env-file-if-exists=../.env dist/main.js > /dev/null 2>&1 &
api_pid=$!
trap 'kill "${api_pid}"' EXIT

for _ in $(seq 1 50); do
  if curl --silent --fail --output /dev/null "${base_url}/health/ready"; then
    break
  fi
  sleep 0.2
done
curl --silent --fail --output /dev/null "${base_url}/health/ready"

# Bumps the catalog cache version, as a review write or a sync does, so the uncached scenario
# starts with no entry to read.
docker compose --file "${root}/docker-compose.yml" exec -T redis redis-cli INCR games:version > /dev/null

docker run --rm --network host --volume "${root}/load:/load:ro" --env BASE_URL="${base_url}" \
  "${k6_image}" run --quiet /load/catalog.js
