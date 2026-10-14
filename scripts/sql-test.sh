#!/usr/bin/env bash
set -euo pipefail
container_name="velora-sql-test-${RANDOM}"
image="postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24"
trap 'docker rm -f "$container_name" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$container_name" --network none -e POSTGRES_HOST_AUTH_METHOD=trust "$image" >/dev/null
ready=false
for attempt in {1..40}; do
  # The image's temporary initialization server accepts Unix sockets before it
  # shuts down. Only the final server listens on TCP.
  if docker exec "$container_name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then
  docker logs "$container_name" >&2
  echo 'PostgreSQL test server did not become ready within 40 seconds.' >&2
  exit 1
fi
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/bootstrap.sql
for migration in supabase/migrations/*.sql; do docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -q < "$migration"; done
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/ownership.sql
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/purge.sql
