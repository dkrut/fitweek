#!/usr/bin/env sh
# Snapshot of the working database, for checks against real data.
#
#   sh scripts/copy-live-db.sh [container] [directory]
#
# All three files are copied: the database runs in WAL mode and recent writes
# live in app.db-wal rather than app.db. Copying app.db alone yields a nearly
# empty database and verifies something other than what actually runs.
#
# The copy is disposable: the tests and the verification container work on it
# while the working database stays untouched.
set -eu

# Git Bash on Windows rewrites arguments such as /data into C:/Program Files/Git/data.
# That breaks every path meant for the container, so the substitution is off.
MSYS_NO_PATHCONV=1
MSYS2_ARG_CONV_EXCL='*'
export MSYS_NO_PATHCONV MSYS2_ARG_CONV_EXCL

CONTAINER="${1:-fitweek}"
TARGET="${2:-.tmp/live-db}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Container '$CONTAINER' not found. Pass its name as the first argument." >&2
  exit 1
fi

mkdir -p "$TARGET"
for suffix in '' '-wal' '-shm'; do
  file="/data/app.db${suffix}"
  if docker exec "$CONTAINER" test -f "$file" 2>/dev/null; then
    docker cp "$CONTAINER:$file" "$TARGET/app.db${suffix}"
  else
    rm -f "$TARGET/app.db${suffix}"
  fi
done

echo "Snapshot: $TARGET"
ls -l "$TARGET"
