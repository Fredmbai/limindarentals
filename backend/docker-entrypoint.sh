#!/bin/sh
set -e

# Wait for postgres to be ready before running migrations.
# docker-compose depends_on only waits for the container to start,
# not for postgres to finish its startup sequence.
echo "Waiting for postgres..."
until nc -z "$POSTGRES_HOST" "$POSTGRES_PORT"; do
  sleep 1
done
echo "Postgres is up."

# Apply migrations
python manage.py migrate --noinput

# Collect static files
python manage.py collectstatic --noinput

# Start gunicorn (or whatever CMD was passed — used by celery service)
exec "$@"
