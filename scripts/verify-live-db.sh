#!/usr/bin/env sh
# Verification container on a copy of the working database: http://127.0.0.1:8081
#
#   sh scripts/verify-live-db.sh [source container]
#
# The login and password in the copy are the real ones. To set your own (for
# instance when the real password is unknown), pass VERIFY_PASSWORD; doing so
# also drops every session.
#
# The copy lives in its own volume and the working database is only read. All
# three files are copied: the database runs in WAL mode and recent writes live
# in app.db-wal, so app.db alone would give a nearly empty database.
set -eu

# Git Bash on Windows rewrites arguments such as /data into C:/Program Files/Git/data.
# That breaks every path meant for the container, so the substitution is off.
MSYS_NO_PATHCONV=1
MSYS2_ARG_CONV_EXCL='*'
export MSYS_NO_PATHCONV MSYS2_ARG_CONV_EXCL

SOURCE="${1:-fitweek}"
NAME="fitweek-verify"
VOLUME="fitweek-verify-data"

if ! docker inspect "$SOURCE" >/dev/null 2>&1; then
  echo "Container '$SOURCE' not found. Pass its name as the first argument." >&2
  exit 1
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker volume rm "$VOLUME" >/dev/null 2>&1 || true
docker volume create "$VOLUME" >/dev/null

# Copying volume to volume rather than through the host: this depends neither
# on file permissions nor on what else has that directory open.
docker run --rm --user root --entrypoint sh \
  --volumes-from "$SOURCE" -v "$VOLUME:/verify" fitweek \
  -c 'cp /data/app.db /verify/
      for s in -wal -shm; do
        if [ -f "/data/app.db$s" ]; then cp "/data/app.db$s" /verify/; fi
      done
      chown -R node:node /verify' >/dev/null

docker run -d --name "$NAME" \
  -p 127.0.0.1:8081:8080 \
  -e SESSION_SECRET=verify-secret-that-is-long-enough-0123456789 \
  -e TZ="${TZ:-Europe/Moscow}" \
  -v "$VOLUME:/data" \
  fitweek >/dev/null

if [ -n "${VERIFY_PASSWORD:-}" ]; then
  docker cp "$(dirname "$0")/set-password.mjs" "$NAME:/app/set-password.mjs" >/dev/null
  docker exec "$NAME" node /app/set-password.mjs "$VERIFY_PASSWORD"
fi

echo "Started $NAME at http://127.0.0.1:8081 - a copy of the database from $SOURCE."
if [ -n "${VERIFY_PASSWORD:-}" ]; then
  echo "Password replaced with VERIFY_PASSWORD, the login is unchanged."
else
  echo "Login and password are the same as in the working app."
fi
echo "Stop it with: docker rm -f $NAME && docker volume rm $VOLUME"
